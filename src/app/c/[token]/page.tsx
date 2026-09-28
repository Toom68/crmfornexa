import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { hashToken } from "@/lib/crypto";
import { getSetting } from "@/lib/settings";
import { formatMoney, outstandingCents, monthLabel, parseLineItems } from "@/lib/billing";
import { approvePlanByToken } from "@/lib/actions/plan";
import { decideQuoteByToken } from "@/lib/actions/billing";

export const dynamic = "force-dynamic";

const ITEM_LABELS: Record<string, string> = {
  PLANNED: "planned",
  IN_PRODUCTION: "being written",
  READY: "ready",
  DELIVERED: "delivered",
  DROPPED: "removed",
};

async function resolveLink(token: string) {
  const link = await prisma.clientLink.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      business: { select: { name: true } },
      contentPlan: { include: { items: { orderBy: [{ scheduledFor: "asc" }, { sortOrder: "asc" }] } } },
      quote: true,
      invoice: { include: { payments: true } },
    },
  });
  if (!link || link.revokedAt || (link.expiresAt && link.expiresAt < new Date())) return null;
  prisma.clientLink
    .update({ where: { id: link.id }, data: { viewCount: { increment: 1 }, lastViewedAt: new Date() } })
    .catch(() => undefined);
  return link;
}

const fmtDate = (d: Date) =>
  d.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "long" });

export default async function ClientLinkPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ done?: string }>;
}) {
  const { token } = await params;
  const { done } = await searchParams;
  const link = await resolveLink(token);
  if (!link) notFound();

  const businessName = link.business.name;

  return (
    <div className="min-h-screen bg-[#fafaf8]">
      <div className="mx-auto max-w-2xl px-6 py-12">
        {link.purpose === "PLAN_APPROVAL" && link.contentPlan && (
          <PlanView plan={link.contentPlan} businessName={businessName} token={token} done={done} />
        )}
        {link.purpose === "QUOTE" && link.quote && (
          <QuoteView quote={link.quote} businessName={businessName} token={token} done={done} />
        )}
        {link.purpose === "INVOICE" && link.invoice && (
          <InvoiceView invoice={link.invoice} businessName={businessName} />
        )}
      </div>
    </div>
  );
}

function Shell({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <header className="mb-8 border-b pb-6">
        <p className="text-xs font-medium uppercase tracking-widest text-stone-500">{eyebrow}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-stone-900">{title}</h1>
      </header>
      {children}
      <p className="mt-12 border-t pt-6 text-xs text-stone-400">
        This is a private link — please don&apos;t share it publicly.
      </p>
    </>
  );
}

function Notice({ tone, children }: { tone: "green" | "amber"; children: React.ReactNode }) {
  const cls =
    tone === "green"
      ? "border-green-300 bg-green-50 text-green-800"
      : "border-amber-300 bg-amber-50 text-amber-800";
  return <p className={`mb-6 rounded-md border p-3 text-sm ${cls}`}>{children}</p>;
}

// ---------- content plan ----------

type PlanWithItems = NonNullable<Awaited<ReturnType<typeof resolveLink>>>["contentPlan"];

function PlanView({
  plan,
  businessName,
  token,
  done,
}: {
  plan: NonNullable<PlanWithItems>;
  businessName: string;
  token: string;
  done?: string;
}) {
  const items = plan.items.filter((i) => i.status !== "DROPPED");
  const awaiting = plan.status === "AWAITING_APPROVAL";

  return (
    <Shell eyebrow={`Content plan for ${businessName}`} title={monthLabel(plan.periodStart)}>
      {done === "approved" && <Notice tone="green">Thanks — the plan is approved and we&apos;ll get writing.</Notice>}
      {done === "changes" && <Notice tone="amber">Thanks — your notes are with the team and we&apos;ll revise the plan.</Notice>}
      {plan.status === "APPROVED" && done !== "approved" && (
        <Notice tone="green">This plan is approved — we&apos;re on it.</Notice>
      )}
      {plan.status === "DRAFT" && done !== "changes" && (
        <Notice tone="amber">This plan is being revised — we&apos;ll send an updated version soon.</Notice>
      )}

      <p className="mb-6 text-sm leading-6 text-stone-600">
        Here&apos;s what we&apos;re planning to write for you in {monthLabel(plan.periodStart)}. Each article
        will be delivered on its date — you publish it whenever you&apos;re ready.
      </p>

      <ol className="space-y-3">
        {items.map((item) => (
          <li key={item.id} className="rounded-lg border border-stone-200 bg-white p-4">
            <div className="flex items-baseline justify-between gap-3">
              <p className="font-medium text-stone-900">{item.title}</p>
              <span className="shrink-0 text-xs text-stone-500">{fmtDate(item.scheduledFor)}</span>
            </div>
            {item.rationale && <p className="mt-1 text-sm text-stone-500">{item.rationale}</p>}
            <p className="mt-1 text-xs text-stone-400">{ITEM_LABELS[item.status] ?? item.status}</p>
          </li>
        ))}
      </ol>

      {awaiting && (
        <form action={approvePlanByToken.bind(null, token)} className="mt-8 space-y-3 rounded-lg border border-stone-200 bg-white p-4">
          <label className="block text-sm font-medium text-stone-700">
            Anything you&apos;d like changed? <span className="font-normal text-stone-400">(optional)</span>
          </label>
          <textarea
            name="note"
            rows={3}
            placeholder="Swap a topic, move a date, add an idea…"
            className="w-full rounded-md border border-stone-300 px-3 py-1.5 text-sm"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              name="decision"
              value="approve"
              className="rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700"
            >
              Approve this plan
            </button>
            <button
              type="submit"
              name="decision"
              value="changes"
              className="rounded-md border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100"
            >
              Request changes
            </button>
          </div>
        </form>
      )}
    </Shell>
  );
}

// ---------- quote ----------

type QuoteRow = NonNullable<Awaited<ReturnType<typeof resolveLink>>>["quote"];

function QuoteView({
  quote,
  businessName,
  token,
  done,
}: {
  quote: NonNullable<QuoteRow>;
  businessName: string;
  token: string;
  done?: string;
}) {
  const lines = parseLineItems(quote.lines);
  const actionable = quote.status === "SENT";

  return (
    <Shell eyebrow={`Quote for ${businessName}`} title={`Quote ${quote.number}`}>
      {done === "accepted" && <Notice tone="green">Thanks — quote accepted. We&apos;ll be in touch to get started.</Notice>}
      {done === "declined" && <Notice tone="amber">No problem — thanks for letting us know.</Notice>}
      {quote.status === "ACCEPTED" && done !== "accepted" && <Notice tone="green">This quote has been accepted.</Notice>}
      {quote.status === "DECLINED" && done !== "declined" && <Notice tone="amber">This quote was declined.</Notice>}

      {quote.notes && <p className="mb-4 text-sm text-stone-600">{quote.notes}</p>}

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase tracking-wider text-stone-500">
            <th className="py-2 pr-4 font-medium">Item</th>
            <th className="py-2 pr-4 text-right font-medium">Qty</th>
            <th className="py-2 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i} className="border-b border-stone-100">
              <td className="py-2.5 pr-4 text-stone-800">{l.description}</td>
              <td className="py-2.5 pr-4 text-right text-stone-500">{l.quantity}</td>
              <td className="py-2.5 text-right text-stone-800">{formatMoney(l.quantity * l.unitPriceCents, quote.currency)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={2} className="py-2 pr-4 text-right text-stone-500">Subtotal</td>
            <td className="py-2 text-right">{formatMoney(quote.subtotalCents, quote.currency)}</td>
          </tr>
          <tr>
            <td colSpan={2} className="py-2 pr-4 text-right text-stone-500">
              {quote.taxRateBps > 0 ? `GST (${quote.taxRateBps / 100}%)` : "Tax"}
            </td>
            <td className="py-2 text-right">{formatMoney(quote.taxCents, quote.currency)}</td>
          </tr>
          <tr className="border-t">
            <td colSpan={2} className="py-2.5 pr-4 text-right font-semibold text-stone-900">Total</td>
            <td className="py-2.5 text-right font-semibold text-stone-900">{formatMoney(quote.totalCents, quote.currency)}</td>
          </tr>
        </tfoot>
      </table>

      {quote.validUntil && (
        <p className="mt-3 text-xs text-stone-500">
          Valid until {quote.validUntil.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}.
        </p>
      )}

      {actionable && (
        <div className="mt-8 flex flex-wrap gap-2">
          <form action={decideQuoteByToken.bind(null, token, "ACCEPTED")}>
            <button type="submit" className="rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700">
              Accept this quote
            </button>
          </form>
          <form action={decideQuoteByToken.bind(null, token, "DECLINED")}>
            <button type="submit" className="rounded-md border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100">
              Decline
            </button>
          </form>
        </div>
      )}
    </Shell>
  );
}

// ---------- invoice ----------

type InvoiceRow = NonNullable<Awaited<ReturnType<typeof resolveLink>>>["invoice"];

async function InvoiceView({ invoice, businessName }: { invoice: NonNullable<InvoiceRow>; businessName: string }) {
  const lines = parseLineItems(invoice.lines);
  const owing = outstandingCents(invoice);
  const [abn, bsb, accountNumber, accountName, instructions] = await Promise.all([
    getSetting<string>("billing.abn"),
    getSetting<string>("billing.bsb"),
    getSetting<string>("billing.accountNumber"),
    getSetting<string>("billing.accountName"),
    getSetting<string>("billing.paymentInstructions"),
  ]);
  const paid = invoice.status === "PAID" || owing === 0;

  return (
    <Shell eyebrow={`Invoice for ${businessName}`} title={`Invoice ${invoice.number}`}>
      {paid ? (
        <Notice tone="green">Paid in full — thank you.</Notice>
      ) : invoice.status === "VOID" ? (
        <Notice tone="amber">This invoice has been voided — nothing is owing.</Notice>
      ) : (
        <Notice tone="amber">
          {formatMoney(owing, invoice.currency)} owing
          {invoice.dueDate && ` — due ${invoice.dueDate.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}`}.
        </Notice>
      )}

      {invoice.notes && <p className="mb-4 text-sm text-stone-600">{invoice.notes}</p>}

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase tracking-wider text-stone-500">
            <th className="py-2 pr-4 font-medium">Item</th>
            <th className="py-2 pr-4 text-right font-medium">Qty</th>
            <th className="py-2 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i} className="border-b border-stone-100">
              <td className="py-2.5 pr-4 text-stone-800">{l.description}</td>
              <td className="py-2.5 pr-4 text-right text-stone-500">{l.quantity}</td>
              <td className="py-2.5 text-right text-stone-800">{formatMoney(l.quantity * l.unitPriceCents, invoice.currency)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={2} className="py-2 pr-4 text-right text-stone-500">Subtotal</td>
            <td className="py-2 text-right">{formatMoney(invoice.subtotalCents, invoice.currency)}</td>
          </tr>
          <tr>
            <td colSpan={2} className="py-2 pr-4 text-right text-stone-500">
              {invoice.taxRateBps > 0 ? `GST (${invoice.taxRateBps / 100}%)` : "Tax"}
            </td>
            <td className="py-2 text-right">{formatMoney(invoice.taxCents, invoice.currency)}</td>
          </tr>
          <tr className="border-t">
            <td colSpan={2} className="py-2.5 pr-4 text-right font-semibold text-stone-900">Total</td>
            <td className="py-2.5 text-right font-semibold text-stone-900">{formatMoney(invoice.totalCents, invoice.currency)}</td>
          </tr>
          {invoice.payments.length > 0 && (
            <tr>
              <td colSpan={2} className="py-2 pr-4 text-right text-stone-500">Paid so far</td>
              <td className="py-2 text-right text-stone-700">
                {formatMoney(invoice.payments.reduce((s, p) => s + p.amountCents, 0), invoice.currency)}
              </td>
            </tr>
          )}
        </tfoot>
      </table>

      {!paid && invoice.status !== "VOID" && (
        <div className="mt-8 rounded-lg border border-stone-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-stone-900">Pay by bank transfer</h2>
          <dl className="mt-3 space-y-1.5 text-sm">
            {accountName && (
              <div className="flex justify-between gap-4">
                <dt className="text-stone-500">Account name</dt>
                <dd className="font-medium text-stone-800">{accountName}</dd>
              </div>
            )}
            {bsb && (
              <div className="flex justify-between gap-4">
                <dt className="text-stone-500">BSB</dt>
                <dd className="font-medium text-stone-800">{bsb}</dd>
              </div>
            )}
            {accountNumber && (
              <div className="flex justify-between gap-4">
                <dt className="text-stone-500">Account number</dt>
                <dd className="font-medium text-stone-800">{accountNumber}</dd>
              </div>
            )}
            <div className="flex justify-between gap-4">
              <dt className="text-stone-500">Reference</dt>
              <dd className="font-medium text-stone-800">{invoice.number}</dd>
            </div>
          </dl>
          {instructions && <p className="mt-3 text-xs text-stone-500">{instructions}</p>}
          {abn && <p className="mt-1 text-xs text-stone-400">ABN {abn}</p>}
        </div>
      )}
    </Shell>
  );
}
