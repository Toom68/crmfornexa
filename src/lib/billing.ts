import { z } from "zod";

/** A single line on a quote or invoice. */
export const LineItemSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().int().min(1).default(1),
  unitPriceCents: z.number().int().min(0),
});
export type LineItem = z.infer<typeof LineItemSchema>;

export function parseLineItems(raw: unknown): LineItem[] {
  const parsed = z.array(LineItemSchema).safeParse(raw);
  return parsed.success ? parsed.data : [];
}

/**
 * Totals with tax applied on top (GST-exclusive pricing).
 * Tax is computed on the subtotal and rounded half-up to whole cents.
 */
export function computeTotals(lines: LineItem[], taxRateBps: number) {
  const subtotalCents = lines.reduce((sum, l) => sum + l.quantity * l.unitPriceCents, 0);
  const taxCents = Math.round((subtotalCents * taxRateBps) / 10_000);
  return { subtotalCents, taxCents, totalCents: subtotalCents + taxCents };
}

/** "1,234.50" style formatting; cents already include the currency base. */
export function formatMoney(cents: number, currency = "AUD"): string {
  const symbol = currency === "AUD" || currency === "NZD" || currency === "USD" ? "$" : `${currency} `;
  const neg = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100).toLocaleString("en-AU");
  const frac = String(abs % 100).padStart(2, "0");
  return `${neg}${symbol}${whole}.${frac}`;
}

/** Q-0001 / INV-0001 style numbering from a 1-based sequence. */
export function formatDocumentNumber(prefix: string, n: number): string {
  return `${prefix}-${String(n).padStart(4, "0")}`;
}

export type InvoiceLike = {
  totalCents: number;
  status: string;
  dueDate: Date | null;
  paidAt: Date | null;
  voidedAt: Date | null;
  payments: { amountCents: number }[];
};

export function paidCents(invoice: InvoiceLike): number {
  return invoice.payments.reduce((sum, p) => sum + p.amountCents, 0);
}

export function outstandingCents(invoice: InvoiceLike): number {
  return Math.max(0, invoice.totalCents - paidCents(invoice));
}

/** Sent, unvoided, past its due date, and not fully paid. */
export function isOverdue(invoice: InvoiceLike, now = new Date()): boolean {
  if (invoice.status === "VOID" || invoice.status === "DRAFT" || invoice.status === "PAID") return false;
  if (invoice.paidAt || invoice.voidedAt) return false;
  if (!invoice.dueDate || invoice.dueDate > now) return false;
  return outstandingCents(invoice) > 0;
}

/** Does recording this payment amount complete the invoice? */
export function paymentCompletes(invoice: InvoiceLike, amountCents: number): boolean {
  return paidCents(invoice) + amountCents >= invoice.totalCents;
}

/** First and last instant of the month containing (or starting at) `date`. */
export function monthRange(date: Date): { periodStart: Date; periodEnd: Date } {
  const periodStart = new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
  const periodEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
  return { periodStart, periodEnd };
}

export function monthAfter(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1);
}

/** "October 2026" */
export function monthLabel(date: Date): string {
  return date.toLocaleDateString("en-AU", { month: "long", year: "numeric" });
}

/** "Oct 2026" */
export function monthShortLabel(date: Date): string {
  return date.toLocaleDateString("en-AU", { month: "short", year: "numeric" });
}
