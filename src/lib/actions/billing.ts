"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import {
  computeTotals,
  formatDocumentNumber,
  monthLabel,
  outstandingCents,
  parseLineItems,
  type LineItem,
} from "@/lib/billing";
import { getSetting } from "@/lib/settings";
import { issueClientLink, primaryContact, queueNamedTemplate } from "@/lib/outbound";
import { hashToken } from "@/lib/crypto";

const QUOTE_TEMPLATE = "Quote sent (email)";
const INVOICE_TEMPLATE = "Invoice (email)";

/** Generate the next document number (Q-0001 / INV-0001) with a collision retry. */
async function nextNumber(prefix: "Q" | "INV"): Promise<string> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const count = prefix === "Q" ? await prisma.quote.count() : await prisma.invoice.count();
    const candidate = formatDocumentNumber(prefix, count + 1 + attempt);
    const clash =
      prefix === "Q"
        ? await prisma.quote.findUnique({ where: { number: candidate } })
        : await prisma.invoice.findUnique({ where: { number: candidate } });
    if (!clash) return candidate;
  }
  return formatDocumentNumber(prefix, Math.floor(Date.now() / 1000));
}

async function totalsFor(lines: unknown) {
  const parsed = parseLineItems(lines);
  if (parsed.length === 0) throw new Error("Add at least one line item");
  const taxRateBps = await getSetting<number>("billing.taxRateBps");
  return { lines: parsed, taxRateBps, ...computeTotals(parsed, taxRateBps) };
}

// ---------- quotes ----------

export async function createQuote(businessId: string, formData: FormData) {
  const user = await requireUser();
  const { lines, taxRateBps, subtotalCents, taxCents, totalCents } = await totalsFor(JSON.parse(String(formData.get("lines") ?? "[]")));
  const validDays = Number(formData.get("validDays") ?? 30);
  const quote = await prisma.quote.create({
    data: {
      businessId,
      number: await nextNumber("Q"),
      lines,
      taxRateBps,
      subtotalCents,
      taxCents,
      totalCents,
      validUntil: new Date(Date.now() + validDays * 86400_000),
      notes: String(formData.get("notes") ?? "").trim() || null,
    },
  });
  await logActivity({ actorId: user.id, action: "quote.create", entityType: "quote", entityId: quote.id });
  revalidatePath(`/prospects/${businessId}`);
  redirect(`/prospects/${businessId}?tab=billing&quote=${quote.id}`);
}

export async function sendQuote(quoteId: string) {
  const user = await requireUser();
  const quote = await prisma.quote.findUniqueOrThrow({ where: { id: quoteId }, include: { business: true } });
  if (quote.status !== "DRAFT") throw new Error("Only draft quotes can be sent");
  const link = await issueClientLink("QUOTE", { businessId: quote.businessId, quoteId: quote.id });
  const contact = await primaryContact(quote.businessId, "EMAIL");
  await queueNamedTemplate({
    templateName: QUOTE_TEMPLATE,
    businessId: quote.businessId,
    contactId: contact?.id ?? null,
    userName: user.name,
    userId: user.id,
    extra: { quote_link: link, quote_number: quote.number },
  });
  await prisma.quote.update({ where: { id: quoteId }, data: { status: "SENT", sentAt: new Date() } });
  await prisma.business.update({
    where: { id: quote.businessId },
    data: { nextAction: `Quote ${quote.number} sent — awaiting response`, nextActionAt: new Date(Date.now() + 48 * 3600_000) },
  });
  await logActivity({ actorId: user.id, action: "quote.sent", entityType: "quote", entityId: quoteId });
  revalidatePath(`/prospects/${quote.businessId}`);
}

export async function decideQuote(quoteId: string, decision: "ACCEPTED" | "DECLINED") {
  const user = await requireUser();
  const quote = await prisma.quote.update({
    where: { id: quoteId },
    data: decision === "ACCEPTED" ? { status: "ACCEPTED", acceptedAt: new Date() } : { status: "DECLINED", declinedAt: new Date() },
  });
  await prisma.clientLink.updateMany({ where: { quoteId, revokedAt: null }, data: { revokedAt: new Date() } });
  await prisma.business.update({
    where: { id: quote.businessId },
    data: {
      nextAction: decision === "ACCEPTED" ? `Quote ${quote.number} accepted — create the invoice` : `Quote ${quote.number} declined`,
      nextActionAt: new Date(),
    },
  });
  await logActivity({ actorId: user.id, action: `quote.${decision.toLowerCase()}`, entityType: "quote", entityId: quoteId });
  revalidatePath(`/prospects/${quote.businessId}`);
}

/** Turn an accepted quote into a ready-to-send invoice. */
export async function convertQuoteToInvoice(quoteId: string) {
  const user = await requireUser();
  const quote = await prisma.quote.findUniqueOrThrow({ where: { id: quoteId } });
  if (quote.status !== "ACCEPTED") throw new Error("Only accepted quotes can be invoiced");
  if (await prisma.invoice.findUnique({ where: { quoteId } })) throw new Error("This quote already has an invoice");
  const dueDays = await getSetting<number>("billing.invoiceDueDays");
  const invoice = await prisma.invoice.create({
    data: {
      businessId: quote.businessId,
      quoteId: quote.id,
      number: await nextNumber("INV"),
      lines: quote.lines as object,
      taxRateBps: quote.taxRateBps,
      subtotalCents: quote.subtotalCents,
      taxCents: quote.taxCents,
      totalCents: quote.totalCents,
      currency: quote.currency,
      dueDate: new Date(Date.now() + dueDays * 86400_000),
      notes: `From quote ${quote.number}`,
    },
  });
  await logActivity({ actorId: user.id, action: "invoice.from_quote", entityType: "invoice", entityId: invoice.id, meta: { quoteId } });
  revalidatePath(`/prospects/${quote.businessId}`);
}

// ---------- invoices ----------

export async function createInvoice(businessId: string, formData: FormData) {
  const user = await requireUser();
  const { lines, taxRateBps, subtotalCents, taxCents, totalCents } = await totalsFor(JSON.parse(String(formData.get("lines") ?? "[]")));
  const dueDays = await getSetting<number>("billing.invoiceDueDays");
  const invoice = await prisma.invoice.create({
    data: {
      businessId,
      number: await nextNumber("INV"),
      lines,
      taxRateBps,
      subtotalCents,
      taxCents,
      totalCents,
      dueDate: new Date(Date.now() + dueDays * 86400_000),
      notes: String(formData.get("notes") ?? "").trim() || null,
    },
  });
  await logActivity({ actorId: user.id, action: "invoice.create", entityType: "invoice", entityId: invoice.id });
  revalidatePath(`/prospects/${businessId}`);
}

/** One-click monthly invoice for an active subscription, prefilled from the package. */
export async function generateMonthlyInvoice(subscriptionId: string, month: Date) {
  const user = await requireUser();
  const sub = await prisma.subscription.findUniqueOrThrow({
    where: { id: subscriptionId },
    include: { package: true, business: true },
  });
  const label = monthLabel(month);
  const lines: LineItem[] = [
    {
      description: `${sub.package.name} — ${label} (${sub.package.articlesPerMonth} article${sub.package.articlesPerMonth === 1 ? "" : "s"})`,
      quantity: 1,
      unitPriceCents: sub.package.priceCents,
    },
  ];
  const taxRateBps = await getSetting<number>("billing.taxRateBps");
  const dueDays = await getSetting<number>("billing.invoiceDueDays");
  const t = computeTotals(lines, taxRateBps);
  const invoice = await prisma.invoice.create({
    data: {
      businessId: sub.businessId,
      subscriptionId: sub.id,
      number: await nextNumber("INV"),
      lines,
      taxRateBps,
      subtotalCents: t.subtotalCents,
      taxCents: t.taxCents,
      totalCents: t.totalCents,
      dueDate: new Date(Date.now() + dueDays * 86400_000),
      notes: `${label} subscription`,
    },
  });
  await logActivity({ actorId: user.id, action: "invoice.generate_monthly", entityType: "invoice", entityId: invoice.id, meta: { subscriptionId } });
  revalidatePath(`/prospects/${sub.businessId}`);
}

export async function sendInvoice(invoiceId: string) {
  const user = await requireUser();
  const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { business: true } });
  if (invoice.status !== "DRAFT") throw new Error("Only draft invoices can be sent");
  const link = await issueClientLink("INVOICE", { businessId: invoice.businessId, invoiceId: invoice.id });
  const contact = await primaryContact(invoice.businessId, "EMAIL");
  await queueNamedTemplate({
    templateName: INVOICE_TEMPLATE,
    businessId: invoice.businessId,
    contactId: contact?.id ?? null,
    userName: user.name,
    userId: user.id,
    extra: { invoice_link: link, invoice_number: invoice.number },
  });
  await prisma.invoice.update({ where: { id: invoiceId }, data: { status: "SENT", sentAt: new Date() } });
  await prisma.business.update({
    where: { id: invoice.businessId },
    data: { nextAction: `Invoice ${invoice.number} sent — watch for payment`, nextActionAt: new Date(Date.now() + 7 * 86400_000) },
  });
  await logActivity({ actorId: user.id, action: "invoice.sent", entityType: "invoice", entityId: invoiceId });
  revalidatePath(`/prospects/${invoice.businessId}`);
  revalidatePath("/customers");
}

export async function recordPayment(invoiceId: string, formData: FormData) {
  const user = await requireUser();
  const amountDollars = Number(formData.get("amount") ?? 0);
  if (!Number.isFinite(amountDollars) || amountDollars <= 0) throw new Error("Payment amount must be greater than zero");
  const amountCents = Math.round(amountDollars * 100);
  const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { payments: true } });

  await prisma.payment.create({
    data: {
      invoiceId,
      amountCents,
      method: (String(formData.get("method") ?? "BANK_TRANSFER") as "BANK_TRANSFER" | "CARD" | "OTHER"),
      reference: String(formData.get("reference") ?? "").trim() || null,
      recordedById: user.id,
    },
  });
  if (outstandingCents(invoice) <= amountCents && invoice.status !== "PAID") {
    await prisma.invoice.update({ where: { id: invoiceId }, data: { status: "PAID", paidAt: new Date() } });
    await prisma.business.update({
      where: { id: invoice.businessId },
      data: { nextAction: `Invoice ${invoice.number} paid ✓`, nextActionAt: new Date() },
    });
  }
  await logActivity({ actorId: user.id, action: "invoice.payment", entityType: "invoice", entityId: invoiceId, meta: { amountCents } });
  revalidatePath(`/prospects/${invoice.businessId}`);
  revalidatePath("/customers");
}

export async function voidInvoice(invoiceId: string) {
  const user = await requireUser();
  const invoice = await prisma.invoice.update({ where: { id: invoiceId }, data: { status: "VOID", voidedAt: new Date() } });
  await prisma.clientLink.updateMany({ where: { invoiceId, revokedAt: null }, data: { revokedAt: new Date() } });
  await logActivity({ actorId: user.id, action: "invoice.void", entityType: "invoice", entityId: invoiceId });
  revalidatePath(`/prospects/${invoice.businessId}`);
}

// ---------- client-side (token-gated, no login) ----------

export async function decideQuoteByToken(token: string, decision: "ACCEPTED" | "DECLINED") {
  const link = await prisma.clientLink.findUnique({ where: { tokenHash: hashToken(token) }, include: { quote: true } });
  if (!link || link.revokedAt || (link.expiresAt && link.expiresAt < new Date())) throw new Error("This link is no longer valid");
  const quote = link.quote;
  if (!quote) throw new Error("Link does not point to a quote");
  if (quote.status !== "SENT") throw new Error("This quote has already been actioned");
  await prisma.quote.update({
    where: { id: quote.id },
    data: decision === "ACCEPTED" ? { status: "ACCEPTED", acceptedAt: new Date() } : { status: "DECLINED", declinedAt: new Date() },
  });
  await prisma.business.update({
    where: { id: quote.businessId },
    data: {
      nextAction: decision === "ACCEPTED" ? `Quote ${quote.number} accepted — create the invoice` : `Quote ${quote.number} declined`,
      nextActionAt: new Date(),
    },
  });
  redirect(`/c/${token}?done=${decision === "ACCEPTED" ? "accepted" : "declined"}`);
}
