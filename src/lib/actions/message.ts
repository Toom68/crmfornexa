"use server";

import crypto from "crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { enqueueJob } from "@/lib/jobs";
import { logActivity } from "@/lib/activity";
import { renderTemplate, unsubscribeToken } from "@/lib/templates";
import { ensurePrivateLink } from "./article";
import { getSetting } from "@/lib/settings";

async function templateVars(businessId: string, contactId: string | null, userName: string) {
  const business = await prisma.business.findUniqueOrThrow({ where: { id: businessId }, include: { contacts: true } });
  const contact = contactId ? business.contacts.find((c) => c.id === contactId) ?? business.contacts[0] : business.contacts[0];
  const signature = await getSetting<string>("outreach.senderSignature");

  // Resolve {{article_link}} lazily — only create a link if the template uses it
  // and a ready free-offer article exists.
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
    unsubscribe_url: contact ? `${process.env.APP_BASE_URL ?? "http://localhost:3000"}/unsubscribe?t=${unsubscribeToken(contact.id)}` : "",
  };
}

/** Compose + queue a message. Sending is a reviewed, manual step — the job sends it. */
export async function sendMessage(businessId: string, formData: FormData) {
  const user = await requireUser();
  const channel = String(formData.get("channel") ?? "EMAIL") as "EMAIL" | "SMS";
  const contactId = String(formData.get("contactId") ?? "") || null;
  const templateId = String(formData.get("templateId") ?? "") || null;
  const vars = await templateVars(businessId, contactId, user.name);
  const subject = renderTemplate(String(formData.get("subject") ?? ""), vars);
  const body = renderTemplate(String(formData.get("body") ?? ""), vars);
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
      templateId,
      sentById: user.id,
      idempotencyKey,
    },
  });
  await enqueueJob("send_message", { messageId: message.id }, { idempotencyKey: `send:${message.id}` });
  await prisma.business.update({
    where: { id: businessId },
    data: { salesStage: "PREPARING_OUTREACH" },
  }).catch(() => undefined);
  await logActivity({ actorId: user.id, action: "message.queued", entityType: "message", entityId: message.id, meta: { businessId, channel } });
  revalidatePath(`/prospects/${businessId}`);
  revalidatePath("/inbox");
}

/** Enqueue an immediate poll — used by the "check inbox now" button and tests. */
export async function pollInboxNow() {
  const user = await requireUser();
  await enqueueJob("gmail_poll", {}, { idempotencyKey: `gmail_poll:${Date.now()}`, maxAttempts: 1 });
  await logActivity({ actorId: user.id, action: "inbox.poll", entityType: "system", entityId: "gmail" });
  revalidatePath("/inbox");
}
