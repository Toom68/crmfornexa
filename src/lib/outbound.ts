import crypto from "crypto";
import { prisma } from "@/lib/db";
import { enqueueJob } from "@/lib/jobs";
import { renderTemplate, unsubscribeToken } from "@/lib/templates";
import { getSetting } from "@/lib/settings";
import { ensurePrivateLink } from "@/lib/actions/article";
import { newToken, hashToken } from "@/lib/crypto";

/**
 * Shared outbound-message plumbing used by the composer (actions/message.ts)
 * and the customer flows (plans, quotes, invoices) so everything goes through
 * the same reviewed-send pipeline with simulated-send labelling.
 */

export async function buildTemplateVars(
  businessId: string,
  contactId: string | null,
  userName: string,
  extra?: Record<string, string>,
): Promise<Record<string, string>> {
  const business = await prisma.business.findUniqueOrThrow({ where: { id: businessId }, include: { contacts: true } });
  const contact = contactId
    ? business.contacts.find((c) => c.id === contactId) ?? business.contacts[0]
    : business.contacts[0];
  const signature = await getSetting<string>("outreach.senderSignature");

  let articleLink = "";
  let articleTitle = "";
  const ready = await prisma.article.findFirst({
    where: { businessId, isFreeOffer: true, stage: { in: ["APPROVED", "DELIVERED"] } },
    orderBy: { updatedAt: "desc" },
  });
  if (ready) {
    articleLink = await ensurePrivateLink(ready.id, undefined);
    articleTitle = ready.title;
  }

  return {
    business_name: business.name,
    contact_name: contact?.name?.split(" ")[0] ?? "there",
    business_website: business.website ?? "",
    article_link: articleLink,
    article_title: articleTitle,
    sender_name: userName,
    sender_signature: signature,
    unsubscribe_url: contact
      ? `${process.env.APP_BASE_URL ?? "http://localhost:3000"}/unsubscribe?t=${unsubscribeToken(contact.id)}`
      : "",
    ...extra,
  };
}

export async function queueMessage({
  businessId,
  contactId,
  channel,
  subject,
  body,
  templateId,
  sentById,
}: {
  businessId: string;
  contactId: string | null;
  channel: "EMAIL" | "SMS";
  subject: string;
  body: string;
  templateId?: string | null;
  sentById?: string;
}) {
  if (!body.trim()) throw new Error("Message body is empty");
  const idempotencyKey = crypto
    .createHash("sha256")
    .update(`${businessId}:${contactId}:${channel}:${subject}:${body}:${Date.now()}`)
    .digest("hex");
  const message = await prisma.message.create({
    data: {
      businessId,
      contactId,
      channel,
      direction: "OUTBOUND",
      status: "QUEUED",
      subject: channel === "EMAIL" ? subject : null,
      bodyText: body,
      templateId: templateId ?? null,
      sentById: sentById ?? null,
      idempotencyKey,
    },
  });
  await enqueueJob("send_message", { messageId: message.id }, { idempotencyKey: `send:${message.id}` });
  return message;
}

/**
 * Render a stored template (by exact name) with merge fields and queue it.
 * Returns null if no template with that name exists.
 */
export async function queueNamedTemplate(opts: {
  templateName: string;
  businessId: string;
  contactId: string | null;
  userName: string;
  userId?: string;
  extra?: Record<string, string>;
}) {
  const template = await prisma.messageTemplate.findFirst({ where: { name: opts.templateName } });
  if (!template) return null;
  const vars = await buildTemplateVars(opts.businessId, opts.contactId, opts.userName, opts.extra);
  const subject = renderTemplate(template.subject ?? "", vars);
  const body = renderTemplate(template.body, vars);
  return queueMessage({
    businessId: opts.businessId,
    contactId: opts.contactId,
    channel: template.channel as "EMAIL" | "SMS",
    subject,
    body,
    templateId: template.id,
    sentById: opts.userId,
  });
}

/**
 * Create a fresh client-facing link for a plan/quote/invoice and return its
 * full URL. Raw tokens are never stored (only sha256 hashes), so a new link
 * is rotated each time — any previous live link for the same resource is
 * revoked first.
 */
export async function issueClientLink(
  purpose: "PLAN_APPROVAL" | "QUOTE" | "INVOICE",
  ref: { businessId: string; contentPlanId?: string; quoteId?: string; invoiceId?: string },
): Promise<string> {
  const where =
    purpose === "PLAN_APPROVAL"
      ? { contentPlanId: ref.contentPlanId! }
      : purpose === "QUOTE"
        ? { quoteId: ref.quoteId! }
        : { invoiceId: ref.invoiceId! };
  await prisma.clientLink.updateMany({ where: { ...where, revokedAt: null }, data: { revokedAt: new Date() } });
  const token = newToken();
  await prisma.clientLink.create({
    data: {
      tokenHash: hashToken(token),
      purpose,
      businessId: ref.businessId,
      contentPlanId: ref.contentPlanId ?? null,
      quoteId: ref.quoteId ?? null,
      invoiceId: ref.invoiceId ?? null,
    },
  });
  return `${process.env.APP_BASE_URL ?? "http://localhost:3000"}/c/${token}`;
}

/** First primary contact with a usable address for the channel, or null. */
export async function primaryContact(businessId: string, channel: "EMAIL" | "SMS") {
  const contacts = await prisma.contact.findMany({
    where: { businessId, optedOut: false },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
  });
  return contacts.find((c) => (channel === "EMAIL" ? c.email : c.phone)) ?? null;
}
