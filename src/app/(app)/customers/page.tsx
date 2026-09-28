import Link from "next/link";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PackageBadge, PlanStatusBadge } from "@/components/customer-badges";
import { formatMoney, outstandingCents, paidCents } from "@/lib/billing";
import { formatDate } from "@/lib/utils";
import { nextStepFor } from "@/lib/workflow";
import { Plus, ArrowRight, CalendarClock, Wallet } from "lucide-react";

export const dynamic = "force-dynamic";

function monthKeyOf(d: Date): number {
  return d.getFullYear() * 12 + d.getMonth();
}

export default async function CustomersPage() {
  const customers = await prisma.business.findMany({
    where: { isCustomer: true },
    orderBy: { customerSince: "desc" },
    include: {
      subscriptions: { include: { package: true }, orderBy: { createdAt: "desc" } },
      contentPlans: {
        where: { status: { not: "ARCHIVED" } },
        orderBy: { periodStart: "asc" },
        include: { items: { orderBy: { sortOrder: "asc" } } },
      },
      invoices: { where: { status: { notIn: ["VOID", "DRAFT"] } }, include: { payments: true } },
      topics: true,
      articles: true,
    },
  });

  const now = new Date();
  const activeSubs = customers.flatMap((c) => c.subscriptions.filter((s) => s.status === "ACTIVE"));
  const mrrCents = activeSubs.reduce((sum, s) => sum + s.package.priceCents, 0);
  const outstanding = customers.reduce(
    (sum, c) => sum + c.invoices.reduce((s, i) => s + outstandingCents(i), 0),
    0,
  );

  return (
    <div>
      <PageHeader
        title="Customers"
        description={`${customers.length} customer${customers.length === 1 ? "" : "s"}`}
        actions={
          <Button render={<Link href="/customers/new" />}>
            <Plus className="mr-2 h-4 w-4" />Add customer
          </Button>
        }
      />
      <div className="mx-auto max-w-6xl px-8 py-6">
        {/* summary strip */}
        <div className="mb-6 flex flex-wrap gap-3">
          <div className="rounded-lg border bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">Active packages</p>
            <p className="font-heading text-xl font-semibold">{activeSubs.length}</p>
          </div>
          <div className="rounded-lg border bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">Monthly value</p>
            <p className="font-heading text-xl font-semibold">{formatMoney(mrrCents)}</p>
          </div>
          <div className="rounded-lg border bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">Outstanding</p>
            <p className={`font-heading text-xl font-semibold ${outstanding > 0 ? "text-primary" : ""}`}>
              {formatMoney(outstanding)}
            </p>
          </div>
        </div>

        {customers.length === 0 ? (
          <div className="rounded-xl border border-dashed px-6 py-16 text-center">
            <h2 className="font-heading text-lg font-semibold">No customers yet</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              When a prospect says yes, mark them won and convert them — or add a customer directly.
            </p>
            <div className="mt-4 flex justify-center gap-2">
              <Button render={<Link href="/customers/new" />}><Plus className="mr-2 h-4 w-4" />Add customer</Button>
              <Button variant="outline" render={<Link href="/prospects" />}>Open prospects</Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {customers.map((c) => {
              const sub = c.subscriptions.find((s) => s.status === "ACTIVE");
              const nextPlan = c.contentPlans.find((p) => monthKeyOf(p.periodStart) >= monthKeyOf(now));
              const upcoming = c.contentPlans
                .flatMap((p) => p.items)
                .filter((i) => i.status !== "DELIVERED" && i.status !== "DROPPED" && i.scheduledFor >= now)
                .sort((a, b) => a.scheduledFor.getTime() - b.scheduledFor.getTime())[0];
              const dueNowItem = c.contentPlans
                .flatMap((p) => p.items)
                .find((i) => i.status === "READY" && i.scheduledFor <= now);
              const owing = c.invoices.reduce((s, i) => s + outstandingCents(i), 0);
              const hasOverdue = c.invoices.some(
                (i) => i.status === "SENT" && i.dueDate && i.dueDate < now && outstandingCents(i) > 0,
              );
              const step = nextStepFor(c);

              return (
                <Link
                  key={c.id}
                  href={`/prospects/${c.id}?tab=plans`}
                  className="group flex flex-col rounded-xl border bg-card p-5 transition-colors hover:border-primary/40 hover:bg-accent/30"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate font-heading text-lg font-semibold leading-snug">{c.name}</h2>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        customer since {formatDate(c.customerSince ?? c.createdAt)}
                      </p>
                    </div>

                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    {sub ? (
                      <PackageBadge name={sub.package.name} articlesPerMonth={sub.package.articlesPerMonth} />
                    ) : (
                      <Badge variant="outline">Ad-hoc</Badge>
                    )}
                    {nextPlan && <PlanStatusBadge status={nextPlan.status} />}
                  </div>

                  <dl className="mt-4 space-y-2 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <dt className="flex items-center gap-1.5 text-muted-foreground">
                        <CalendarClock className="h-3.5 w-3.5" />Next delivery
                      </dt>
                      <dd className="text-right">
                        {dueNowItem ? (
                          <span className="font-medium text-primary">due now — release it</span>
                        ) : upcoming ? (
                          formatDate(upcoming.scheduledFor)
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="flex items-center gap-1.5 text-muted-foreground">
                        <Wallet className="h-3.5 w-3.5" />Payments
                      </dt>
                      <dd className="text-right">
                        {owing > 0 ? (
                          <span className={hasOverdue ? "font-medium text-destructive" : "font-medium text-primary"}>
                            {formatMoney(owing)} {hasOverdue ? "overdue" : "owing"}
                          </span>
                        ) : c.invoices.some((i) => paidCents(i) > 0) ? (
                          <span className="text-muted-foreground">paid up</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </dd>
                    </div>
                  </dl>

                  <div className="mt-4 flex items-center justify-between border-t pt-3 text-xs">
                    <span className="text-muted-foreground">{step.title}</span>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5" />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
