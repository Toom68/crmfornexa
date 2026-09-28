import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { UrlTabs } from "@/components/url-tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { SalesStageBadge, QualBadge, ArticleStageBadge, salesStageLabel } from "@/components/stage-badge";
import { formatDate, formatDateTime, formatRelative } from "@/lib/utils";
import { nextStepFor, NEXT_STEP_COPY } from "@/lib/workflow";
import {
  setSalesStage, setNextAction, addNote, addContact, qualifyBusiness, updateBusiness,
} from "@/lib/actions/business";
import { suggestTopics, addManualTopic, decideTopic, createArticleFromTopic } from "@/lib/actions/article";
import { convertToCustomer, subscribeCustomer, setSubscriptionStatus } from "@/lib/actions/customer";
import { createPlan } from "@/lib/actions/plan";
import {
  createQuote, sendQuote, convertQuoteToInvoice,
  createInvoice, generateMonthlyInvoice, sendInvoice, recordPayment, voidInvoice,
} from "@/lib/actions/billing";
import { getSetting } from "@/lib/settings";
import { formatMoney, outstandingCents, isOverdue, monthLabel, monthAfter } from "@/lib/billing";
import {
  CustomerBadge, PackageBadge, SubscriptionStatusBadge, PlanStatusBadge,
  QuoteStatusBadge, InvoiceStatusBadge,
} from "@/components/customer-badges";
import { LineItemsEditor } from "@/components/line-items-editor";
import { MessageComposer } from "@/components/message-composer";
import { ProfileEditor } from "@/components/profile-editor";
import { ExternalLink, Sparkles, CheckCircle2, XCircle, Check, ArrowRight, Send, Ban, Plus } from "lucide-react";
import type { SalesStage } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const STAGE_ORDER: SalesStage[] = [
  "NEW_PROSPECT", "PREPARING_OUTREACH", "CONTACTED", "INTERESTED", "PROPOSAL", "WON", "LOST", "DO_NOT_CONTACT",
];

function monthKeyOf(d: Date): number {
  return d.getFullYear() * 12 + d.getMonth();
}

export default async function BusinessPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const business = await prisma.business.findUnique({
    where: { id },
    include: {
      contacts: true,
      assignedTo: true,
      notes: { orderBy: { createdAt: "desc" }, include: { author: true } },
      inspections: { orderBy: { inspectedAt: "desc" }, take: 3 },
      rankingObservations: { orderBy: { checkedAt: "desc" }, take: 5 },
      topics: { orderBy: { createdAt: "desc" } },
      articles: { orderBy: { updatedAt: "desc" }, include: { versions: { orderBy: { version: "desc" }, take: 1 } } },
      messages: { orderBy: { createdAt: "desc" }, take: 50, include: { contact: true, sentBy: true } },
      subscriptions: { orderBy: { createdAt: "desc" }, include: { package: true } },
      contentPlans: {
        orderBy: { periodStart: "desc" },
        include: { items: { orderBy: { sortOrder: "asc" } } },
      },
      invoices: {
        orderBy: { createdAt: "desc" },
        include: { payments: { orderBy: { receivedAt: "desc" }, include: { recordedBy: true } } },
      },
      quotes: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!business) notFound();

  const [users, templates, packages, taxRateBps] = await Promise.all([
    prisma.user.findMany({ orderBy: { name: "asc" } }),
    prisma.messageTemplate.findMany({ orderBy: { name: "asc" } }),
    prisma.articlePackage.findMany({ where: { isActive: true }, orderBy: { priceCents: "asc" } }),
    getSetting<number>("billing.taxRateBps"),
  ]);

  const step = nextStepFor(business);
  const latestInspection = business.inspections[0];
  const firstApprovedTopicWithoutArticle = business.topics.find(
    (t) => t.status === "APPROVED" && !business.articles.some((a) => a.topicId === t.id),
  );
  const inFlightArticle = business.articles.find((a) =>
    ["TOPIC_APPROVED", "RESEARCH", "DRAFT", "HUMAN_EDIT", "CLIENT_REVIEW", "REVISIONS"].includes(a.stage),
  );

  // ---- customer state ----
  const activeSub = business.subscriptions.find((s) => s.status === "ACTIVE");
  const now = new Date();
  const nextMonth = monthAfter(now);
  const outstanding = business.invoices
    .filter((i) => i.status !== "VOID" && i.status !== "DRAFT")
    .reduce((sum, i) => sum + outstandingCents(i), 0);

  // ---- pipeline stepper state ----
  const fitDone = ["STRONG", "MODERATE", "LOW"].includes(business.qualificationStatus);
  const topicDone = business.topics.some((t) => t.status === "APPROVED");
  const articleDone = business.articles.some((a) => a.isFreeOffer && ["APPROVED", "DELIVERED"].includes(a.stage));
  const introDone = business.messages.some((m) => m.direction === "OUTBOUND") ||
    ["CONTACTED", "INTERESTED", "PROPOSAL", "WON"].includes(business.salesStage);
  const replyDone = business.messages.some((m) => m.direction === "INBOUND");
  const outcome = business.salesStage === "WON" ? "won" : business.salesStage === "LOST" ? "lost" : null;
  const stepper = [
    { label: "Fit", done: fitDone },
    { label: "Topic", done: topicDone },
    { label: "Article", done: articleDone },
    { label: "Intro sent", done: introDone },
    { label: "Reply", done: replyDone },
    { label: "Outcome", done: !!outcome },
  ];
  const firstUndone = stepper.findIndex((s) => !s.done);

  // ---- customer pipeline stepper (replaces the prospect one once converted) ----
  const currentPlan = business.contentPlans.find(
    (p) => p.status !== "ARCHIVED" && monthKeyOf(p.periodStart) >= monthKeyOf(now) - 1,
  );
  const customerStepper = business.isCustomer
    ? [
        {
          label: "Plan",
          done: !!currentPlan && currentPlan.status !== "DRAFT",
          active: !!currentPlan && currentPlan.status === "DRAFT",
        },
        {
          label: "Approved",
          done: !!currentPlan && (currentPlan.status === "APPROVED" || currentPlan.items.every((i) => i.status === "DELIVERED" || i.status === "DROPPED")),
        },
        {
          label: "In production",
          done: !!currentPlan && currentPlan.items.some((i) => i.status === "IN_PRODUCTION" || i.status === "READY" || i.status === "DELIVERED"),
        },
        {
          label: "Delivered",
          done: !!currentPlan && currentPlan.items.length > 0 && currentPlan.items.every((i) => i.status === "DELIVERED" || i.status === "DROPPED"),
        },
        {
          label: "Paid",
          done: outstanding === 0 && business.invoices.some((i) => i.status === "PAID"),
        },
      ]
    : null;

  return (
    <div>
      <PageHeader
        title={business.name}
        description={business.domain ?? undefined}
        actions={
          <div className="flex items-center gap-2">

            {business.isCustomer && <CustomerBadge />}
            {activeSub && <PackageBadge name={activeSub.package.name} articlesPerMonth={activeSub.package.articlesPerMonth} />}
            {business.isCustomer && !activeSub && <Badge variant="outline">Ad-hoc</Badge>}
            {business.website && (
              <Button variant="ghost" size="sm" render={<a href={business.website} target="_blank" rel="noreferrer" />}>
                <ExternalLink className="mr-1.5 h-3.5 w-3.5" />Visit site
              </Button>
            )}
          </div>
        }
      />

      <div className="mx-auto max-w-6xl px-8 py-6">
        {/* ---------- conversion panel (won but not yet a customer) ---------- */}
        {step.key === "won" && (
          <div className="mb-6 overflow-hidden rounded-xl border border-primary/40 bg-primary/[0.06]">
            <div className="px-5 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">Deal won</p>
              <h2 className="mt-0.5 font-heading text-lg font-semibold leading-snug">Convert {business.name} to a customer</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Pick their monthly package — or choose ad-hoc for one-off articles. Plans and billing open up straight away.
              </p>
              <form action={convertToCustomer.bind(null, business.id)} className="mt-4 flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Package</Label>
                  <Select
                    name="packageId"
                    defaultValue="adhoc"
                    items={{
                      adhoc: "Ad-hoc (no monthly package)",
                      ...Object.fromEntries(packages.map((p) => [p.id, `${p.name} — ${formatMoney(p.priceCents)}/mo · ${p.articlesPerMonth} articles`])),
                    }}
                  >
                    <SelectTrigger className="w-72"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="adhoc">Ad-hoc (no monthly package)</SelectItem>
                      {packages.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name} — {formatMoney(p.priceCents)}/mo · {p.articlesPerMonth} articles
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Billing preference</Label>
                  <Select
                    name="billingPreference"
                    defaultValue="INVOICE_APPROVAL"
                    items={{
                      INVOICE_APPROVAL: "Send an invoice — they pay by bank transfer",
                      AUTO_CHARGE: "Card auto-pay (coming soon)",
                    }}
                  >
                    <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="INVOICE_APPROVAL">Send an invoice — they pay by bank transfer</SelectItem>
                      <SelectItem value="AUTO_CHARGE">Card auto-pay (coming soon)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit">Convert to customer<ArrowRight className="ml-2 h-4 w-4" /></Button>
              </form>
            </div>
          </div>
        )}

        {/* ---------- next step banner ---------- */}
        {step.key !== "won" && (
        <div
          className={cn(
            "mb-6 overflow-hidden rounded-xl border",
            step.key === "reply" || step.key === "follow_up" || step.key === "chase_payment" || step.key === "release_article"
              ? "border-primary/40 bg-primary/[0.06]"
              : "border-border bg-card",
          )}
        >
          <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">Next step</p>
              <h2 className="mt-0.5 font-heading text-lg font-semibold leading-snug">{step.title}</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">{step.hint}</p>
            </div>
            <BannerCta
              businessId={business.id}
              step={step}
              approvedTopicId={firstApprovedTopicWithoutArticle?.id ?? null}
              inFlightArticleId={inFlightArticle?.id ?? null}
              hasProposedTopics={business.topics.some((t) => t.status === "PROPOSED")}
            />
          </div>

          {/* inline fit-check form when that's the next step */}
          {step.key === "run_checks" && (
            <div className="border-t bg-muted/40 px-5 py-3">
              <form action={qualifyBusiness.bind(null, business.id)} className="flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Keyword to check</Label>
                  <Input name="keyword" placeholder="kitchen renovation" className="w-52" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Location</Label>
                  <Input name="location" defaultValue={business.city ? `${business.city}, Australia` : ""} className="w-52" />
                </div>
                <Button type="submit">Run checks</Button>
              </form>
            </div>
          )}
        </div>
        )}

        {/* ---------- pipeline stepper ---------- */}
        <ol className="mb-8 flex flex-wrap items-center gap-x-1 gap-y-2 text-xs">
          {(customerStepper ?? stepper).map((s, i) => (
            <li key={s.label} className="flex items-center gap-1">
              <span
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-2.5 py-1",
                  s.done
                    ? "border-primary/30 bg-primary/10 font-medium text-foreground"
                    : i === firstUndone || ("active" in s && s.active)
                      ? "border-primary/50 bg-primary/[0.04] text-foreground"
                      : "border-dashed text-muted-foreground",
                )}
              >
                {s.done ? (
                  <Check className="h-3 w-3 text-primary" />
                ) : (
                  <span className={cn("h-1.5 w-1.5 rounded-full", i === firstUndone ? "bg-primary" : "bg-muted-foreground/40")} />
                )}
                {s.label}
              </span>
              {i < stepper.length - 1 && <span className="text-muted-foreground/40">–</span>}
            </li>
          ))}
          {outcome === "won" && <Badge className="ml-2">won</Badge>}
          {outcome === "lost" && <Badge variant="destructive" className="ml-2">lost</Badge>}
        </ol>

        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          {/* left column */}
          <div className="min-w-0">
            <UrlTabs
              defaultValue="overview"
              tabs={[
                {
                  value: "overview",
                  label: "Overview",
                  content: (
                    <div className="space-y-4">
                      <ProfileEditor
                        businessId={business.id}
                        profile={business.profile as Record<string, unknown> | null}
                        siteSummary={latestInspection?.siteSummary ?? null}
                      />
                      <Card>
                        <CardHeader><CardTitle className="text-sm font-medium">Notes</CardTitle></CardHeader>
                        <CardContent className="space-y-3">
                          <form action={addNote.bind(null, business.id)} className="flex gap-2">
                            <Input name="body" placeholder="Jot something down…" />
                            <Button type="submit" variant="secondary">Add</Button>
                          </form>
                          {business.notes.length === 0 && (
                            <p className="text-sm text-muted-foreground">Nothing noted yet.</p>
                          )}
                          {business.notes.map((n) => (
                            <div key={n.id} className="rounded-lg bg-muted/50 px-3 py-2.5 text-sm">
                              <div className="mb-1 text-xs text-muted-foreground">
                                {n.author?.name ?? "system"} · {formatRelative(n.createdAt)}
                              </div>
                              {n.body}
                            </div>
                          ))}
                        </CardContent>
                      </Card>
                    </div>
                  ),
                },
                ...(business.isCustomer
                  ? [
                      {
                        value: "plans",
                        label: "Plans",
                        count: business.contentPlans.filter((p) => p.status !== "ARCHIVED").length,
                        content: (
                          <div className="space-y-4">
                            {/* subscription summary */}
                            <Card>
                              <CardHeader className="flex-row items-center justify-between pb-3">
                                <CardTitle className="text-sm font-medium">Package</CardTitle>
                                {activeSub && <SubscriptionStatusBadge status={activeSub.status} />}
                              </CardHeader>
                              <CardContent className="space-y-3">
                                {activeSub ? (
                                  <>
                                    <div className="flex flex-wrap items-center gap-2">
                                      <PackageBadge name={activeSub.package.name} articlesPerMonth={activeSub.package.articlesPerMonth} />
                                      <span className="text-sm text-muted-foreground">
                                        {formatMoney(activeSub.package.priceCents)}/month ·{" "}
                                        {activeSub.billingPreference === "INVOICE_APPROVAL"
                                          ? "approve each invoice"
                                          : "card auto-pay"}
                                      </span>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                      <form action={generateMonthlyInvoice.bind(null, activeSub.id, nextMonth)}>
                                        <Button type="submit" size="sm" variant="outline">
                                          <Plus className="mr-1.5 h-3.5 w-3.5" />
                                          Invoice for {monthLabel(nextMonth)}
                                        </Button>
                                      </form>
                                      <form action={setSubscriptionStatus.bind(null, activeSub.id, activeSub.status === "PAUSED" ? "ACTIVE" : "PAUSED")}>
                                        <Button type="submit" size="sm" variant="ghost">
                                          {activeSub.status === "PAUSED" ? "Resume" : "Pause"}
                                        </Button>
                                      </form>
                                      <form action={setSubscriptionStatus.bind(null, activeSub.id, "CANCELLED")}>
                                        <Button type="submit" size="sm" variant="ghost" className="text-muted-foreground">Cancel</Button>
                                      </form>
                                    </div>
                                  </>
                                ) : (
                                  <div className="space-y-3">
                                    <p className="text-sm text-muted-foreground">
                                      Ad-hoc customer — add a monthly package whenever they&rsquo;re ready.
                                    </p>
                                    {packages.length > 0 && (
                                      <form action={subscribeCustomer.bind(null, business.id)} className="flex flex-wrap items-end gap-2">
                                        <Select
                                          name="packageId"
                                          items={Object.fromEntries(packages.map((p) => [p.id, `${p.name} — ${formatMoney(p.priceCents)}/mo`]))}
                                        >
                                          <SelectTrigger className="w-64"><SelectValue placeholder="Pick a package" /></SelectTrigger>
                                          <SelectContent>
                                            {packages.map((p) => (
                                              <SelectItem key={p.id} value={p.id}>
                                                {p.name} — {formatMoney(p.priceCents)}/mo
                                              </SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                        <input type="hidden" name="billingPreference" value="INVOICE_APPROVAL" />
                                        <Button size="sm" type="submit">Start package</Button>
                                      </form>
                                    )}
                                  </div>
                                )}
                                {business.subscriptions.filter((s) => s.status !== "ACTIVE").length > 0 && (
                                  <p className="text-xs text-muted-foreground">
                                    Past: {business.subscriptions.filter((s) => s.status !== "ACTIVE").map((s) => `${s.package.name} (${s.status.toLowerCase()})`).join(", ")}
                                  </p>
                                )}
                              </CardContent>
                            </Card>

                            {/* create a month plan */}
                            <Card>
                              <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">Plan a month</CardTitle></CardHeader>
                              <CardContent>
                                <form action={createPlan.bind(null, business.id)} className="flex flex-wrap items-end gap-3">
                                  <div className="space-y-1">
                                    <Label className="text-xs text-muted-foreground">Month</Label>
                                    <Input
                                      name="month"
                                      type="month"
                                      required
                                      defaultValue={`${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}`}
                                    />
                                  </div>
                                  <Button type="submit" variant="secondary">Create plan</Button>
                                </form>
                              </CardContent>
                            </Card>

                            {/* existing plans */}
                            {business.contentPlans.length === 0 ? (
                              <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                                No content plans yet — create one above and send it to them for approval.
                              </p>
                            ) : (
                              business.contentPlans.map((p) => {
                                const open = p.items.filter((i) => i.status !== "DROPPED");
                                const delivered = open.filter((i) => i.status === "DELIVERED").length;
                                return (
                                  <Link
                                    key={p.id}
                                    href={`/prospects/${business.id}/plans/${p.id}`}
                                    className="flex items-center justify-between rounded-lg border bg-card px-4 py-3 transition-colors hover:bg-accent/50"
                                  >
                                    <div>
                                      <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium">{monthLabel(p.periodStart)}</span>
                                        <PlanStatusBadge status={p.status} />
                                      </div>
                                      <p className="mt-0.5 text-xs text-muted-foreground">
                                        {open.length} article{open.length === 1 ? "" : "s"} · {delivered} delivered
                                        {p.approvedAt && ` · approved ${formatDate(p.approvedAt)}`}
                                      </p>
                                    </div>
                                    <ArrowRight className="h-4 w-4 text-muted-foreground/50" />
                                  </Link>
                                );
                              })
                            )}
                          </div>
                        ),
                      },
                    ]
                  : []),
                ...(!business.isCustomer
                  ? [
                      {
                        value: "checks",
                        label: "Fit checks",
                        content: (
                    <div className="space-y-4">
                      {business.qualificationSummary && (
                        <p className="rounded-lg border bg-card px-4 py-3 text-sm">{business.qualificationSummary}</p>
                      )}
                      <Card>
                        <CardHeader><CardTitle className="text-sm font-medium">Website & blog</CardTitle></CardHeader>
                        <CardContent>
                          {!latestInspection && (
                            <p className="text-sm text-muted-foreground">
                              Not inspected yet — the banner above runs both checks.
                            </p>
                          )}
                          {latestInspection && (
                            <div className="space-y-2 text-sm">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline">{latestInspection.status.replaceAll("_", " ")}</Badge>
                                <span className="text-xs text-muted-foreground">{formatRelative(latestInspection.inspectedAt)}</span>
                              </div>
                              {latestInspection.blogUrl && (
                                <p>Blog: <a className="text-primary hover:underline" href={latestInspection.blogUrl} target="_blank" rel="noreferrer">{latestInspection.blogUrl}</a></p>
                              )}
                              {latestInspection.lastPostAt && (
                                <p>Last post: {formatDate(latestInspection.lastPostAt)} ({latestInspection.lastPostSource})</p>
                              )}
                              {latestInspection.error && <p className="text-destructive">{latestInspection.error}</p>}
                              {(latestInspection.evidence as { url: string; note: string }[] | null)?.map((e, i) => (
                                <div key={i} className="text-xs text-muted-foreground">
                                  · {e.note} — <a className="text-primary hover:underline" href={e.url} target="_blank" rel="noreferrer">{e.url}</a>
                                </div>
                              ))}
                            </div>
                          )}
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader><CardTitle className="text-sm font-medium">Google ranking checks</CardTitle></CardHeader>
                        <CardContent className="space-y-3">
                          {business.rankingObservations.length === 0 && (
                            <p className="text-sm text-muted-foreground">No ranking checks yet.</p>
                          )}
                          {business.rankingObservations.map((r) => (
                            <div key={r.id} className="rounded-lg border p-3 text-sm">
                              <div className="flex items-center justify-between">
                                <span className="font-medium">“{r.keyword}” · {r.location}</span>
                                <Badge variant={r.status === "ERROR" ? "destructive" : "outline"}>
                                  {r.status === "FOUND" ? `#${r.position}` : r.status === "NOT_FOUND_IN_DEPTH" ? `not in top ${r.depth} checked` : "check failed"}
                                </Badge>
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {formatDateTime(r.checkedAt)} · {r.device} · {r.source}
                              </p>
                              {(r.serpSnapshot as { topUrls?: { url: string; rank: number }[] } | null)?.topUrls && (
                                <details className="mt-2 text-xs text-muted-foreground">
                                  <summary className="cursor-pointer">Top results seen (evidence)</summary>
                                  <ul className="mt-1 list-inside list-disc">
                                    {(r.serpSnapshot as { topUrls: { url: string; rank: number }[] }).topUrls.map((u, i) => (
                                      <li key={i}>#{u.rank} {u.url}</li>
                                    ))}
                                  </ul>
                                </details>
                              )}
                            </div>
                          ))}
                        </CardContent>
                      </Card>
                    </div>
                        ),
                      },
                    ]
                  : []),
                {
                  value: "messages",
                  label: "Messages",
                  count: business.messages.length,
                  content: (
                    <div className="space-y-4">
                      {business.messages.length === 0 ? (
                        <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                          No messages yet — send the introduction below when their article is ready.
                        </p>
                      ) : (
                        <div className="space-y-3">
                          {[...business.messages].reverse().map((m) => (
                            <div key={m.id} className={cn("flex flex-col", m.direction === "OUTBOUND" ? "items-end" : "items-start")}>
                              <div
                                className={cn(
                                  "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm",
                                  m.direction === "OUTBOUND"
                                    ? "rounded-br-md bg-accent"
                                    : "rounded-bl-md border bg-card",
                                )}
                              >
                                {m.subject && <p className="mb-0.5 font-medium">{m.subject}</p>}
                                <p className="whitespace-pre-wrap">{m.bodyText}</p>
                              </div>
                              <div className="mt-0.5 flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground">
                                {m.direction === "INBOUND" ? (
                                  <span>{m.contact?.name ?? "them"}</span>
                                ) : (
                                  <>
                                    <span>{m.sentBy?.name ?? "us"}</span>
                                    {m.status === "SIMULATED" && (
                                      <Badge variant="outline" className="h-4 border-amber-400 px-1.5 text-[10px] text-amber-600">simulated</Badge>
                                    )}
                                  </>
                                )}
                                · {formatDateTime(m.sentAt ?? m.createdAt)}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      <MessageComposer
                        businessId={business.id}
                        contacts={business.contacts.map((c) => ({ id: c.id, name: c.name, email: c.email, phone: c.phone, optedOut: c.optedOut }))}
                        templates={templates.map((t) => ({ id: t.id, name: t.name, channel: t.channel, subject: t.subject, body: t.body }))}
                        hasReadyArticle={business.articles.some((a) => a.isFreeOffer && ["APPROVED", "DELIVERED"].includes(a.stage))}
                      />
                    </div>
                  ),
                },
                {
                  value: "articles",
                  label: "Articles",
                  count: business.articles.length,
                  content: (
                    <div className="space-y-4">
                      <Card>
                        <CardHeader className="flex-row items-center justify-between">
                          <CardTitle className="text-sm font-medium">Free article topics</CardTitle>
                          <form action={suggestTopics.bind(null, business.id)}>
                            <Button type="submit" size="sm" variant="secondary"><Sparkles className="mr-1.5 h-3.5 w-3.5" />Suggest topics</Button>
                          </form>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <form action={addManualTopic.bind(null, business.id)} className="flex gap-2">
                            <Input name="title" placeholder="Add your own topic idea…" />
                            <Button variant="outline" type="submit">Add</Button>
                          </form>
                          {business.topics.length === 0 && (
                            <p className="text-sm text-muted-foreground">No topics yet — suggest a few and approve the best one.</p>
                          )}
                          {business.topics.map((t) => (
                            <div key={t.id} className="rounded-lg border p-3">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-sm font-medium">{t.title}</p>
                                  {t.rationale && <p className="mt-1 text-xs text-muted-foreground">{t.rationale}</p>}
                                  {t.intentNote && <p className="mt-1 text-xs italic text-muted-foreground">Intent: {t.intentNote}</p>}
                                </div>
                                <Badge variant={t.status === "APPROVED" ? "default" : t.status === "REJECTED" ? "destructive" : "secondary"}>
                                  {t.status.toLowerCase()}
                                </Badge>
                              </div>
                              {t.status === "PROPOSED" && (
                                <div className="mt-2 flex gap-2">
                                  <form action={decideTopic.bind(null, t.id, "APPROVED")}>
                                    <Button type="submit" size="sm" variant="outline"><CheckCircle2 className="mr-1 h-3.5 w-3.5" />Approve</Button>
                                  </form>
                                  <form action={decideTopic.bind(null, t.id, "REJECTED")}>
                                    <Button type="submit" size="sm" variant="ghost"><XCircle className="mr-1 h-3.5 w-3.5" />Reject</Button>
                                  </form>
                                </div>
                              )}
                              {t.status === "APPROVED" && !business.articles.some((a) => a.topicId === t.id) && (
                                <form action={createArticleFromTopic.bind(null, t.id)} className="mt-2">
                                  <Button type="submit" size="sm">Start writing →</Button>
                                </form>
                              )}
                            </div>
                          ))}
                        </CardContent>
                      </Card>
                      {business.articles.map((a) => (
                        <Link key={a.id} href={`/articles/${a.id}`} className="flex items-center justify-between rounded-lg border bg-card px-4 py-3 transition-colors hover:bg-accent/50">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">{a.title}</span>
                              {a.isFreeOffer && <Badge variant="outline">free</Badge>}
                            </div>
                            <p className="mt-0.5 text-xs text-muted-foreground">updated {formatRelative(a.updatedAt)}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <ArticleStageBadge stage={a.stage} />
                            <ArrowRight className="h-4 w-4 text-muted-foreground/50" />
                          </div>
                        </Link>
                      ))}
                    </div>
                  ),
                },
                ...(business.isCustomer
                  ? [
                      {
                        value: "billing",
                        label: "Billing",
                        count: business.invoices.filter((i) => i.status !== "PAID" && i.status !== "VOID").length,
                        content: (
                          <div className="space-y-4">
                            {/* summary strip */}
                            <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card px-4 py-3 text-sm">
                              <span>
                                <span className="text-muted-foreground">Outstanding </span>
                                <span className={cn("font-semibold", outstanding > 0 && "text-primary")}>{formatMoney(outstanding)}</span>
                              </span>
                              <span className="text-muted-foreground/40">·</span>
                              <span className="text-muted-foreground">
                                {business.invoices.filter((i) => i.status === "PAID").length} paid ·{" "}
                                {business.quotes.length} quote{business.quotes.length === 1 ? "" : "s"}
                              </span>
                            </div>

                            {/* quotes */}
                            <Card>
                              <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">Quotes</CardTitle></CardHeader>
                              <CardContent className="space-y-3">
                                {business.quotes.length === 0 && (
                                  <p className="text-sm text-muted-foreground">No quotes yet.</p>
                                )}
                                {business.quotes.map((q) => (
                                  <div key={q.id} className="rounded-lg border p-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium">{q.number}</span>
                                        <QuoteStatusBadge status={q.status} />
                                      </div>
                                      <span className="text-sm font-medium">{formatMoney(q.totalCents)}</span>
                                    </div>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                      {formatDate(q.createdAt)} · {formatMoney(q.subtotalCents)} + GST {formatMoney(q.taxCents)}
                                      {q.validUntil && ` · valid until ${formatDate(q.validUntil)}`}
                                      {q.notes && ` · ${q.notes}`}
                                    </p>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                      {q.status === "DRAFT" && (
                                        <form action={sendQuote.bind(null, q.id)}>
                                          <Button type="submit" size="sm" variant="secondary"><Send className="mr-1.5 h-3.5 w-3.5" />Send to client</Button>
                                        </form>
                                      )}
                                      {q.status === "ACCEPTED" && !business.invoices.some((i) => i.quoteId === q.id) && (
                                        <form action={convertQuoteToInvoice.bind(null, q.id)}>
                                          <Button type="submit" size="sm" variant="secondary">Create invoice</Button>
                                        </form>
                                      )}
                                    </div>
                                  </div>
                                ))}
                                <details className="rounded-lg border border-dashed">
                                  <summary className="cursor-pointer px-4 py-3 text-sm text-muted-foreground hover:text-foreground">
                                    New quote
                                  </summary>
                                  <form action={createQuote.bind(null, business.id)} className="space-y-3 border-t px-4 py-4">
                                    <LineItemsEditor taxRateBps={taxRateBps} />
                                    <div className="flex flex-wrap items-end gap-3">
                                      <div className="space-y-1">
                                        <Label className="text-xs text-muted-foreground">Valid for (days)</Label>
                                        <Input name="validDays" type="number" min={1} defaultValue={30} className="w-24" />
                                      </div>
                                      <div className="min-w-0 flex-1 space-y-1">
                                        <Label className="text-xs text-muted-foreground">Notes (optional)</Label>
                                        <Input name="notes" placeholder="e.g. includes first month free article credit" />
                                      </div>
                                      <Button type="submit">Create quote</Button>
                                    </div>
                                  </form>
                                </details>
                              </CardContent>
                            </Card>

                            {/* invoices */}
                            <Card>
                              <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">Invoices</CardTitle></CardHeader>
                              <CardContent className="space-y-3">
                                {business.invoices.length === 0 && (
                                  <p className="text-sm text-muted-foreground">No invoices yet.</p>
                                )}
                                {business.invoices.map((inv) => {
                                  const overdue = isOverdue(inv);
                                  const owing = outstandingCents(inv);
                                  return (
                                    <div key={inv.id} className={cn("rounded-lg border p-3", overdue && "border-destructive/40")}>
                                      <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div className="flex items-center gap-2">
                                          <span className="text-sm font-medium">{inv.number}</span>
                                          <InvoiceStatusBadge status={overdue ? "OVERDUE" : inv.status} />
                                        </div>
                                        <div className="text-right text-sm">
                                          <span className="font-medium">{formatMoney(inv.totalCents)}</span>
                                          {inv.status !== "PAID" && inv.status !== "VOID" && owing !== inv.totalCents && (
                                            <span className="ml-2 text-xs text-muted-foreground">{formatMoney(owing)} left</span>
                                          )}
                                        </div>
                                      </div>
                                      <p className="mt-1 text-xs text-muted-foreground">
                                        {formatDate(inv.createdAt)}
                                        {inv.dueDate && ` · due ${formatDate(inv.dueDate)}`}
                                        {inv.paidAt && ` · paid ${formatDate(inv.paidAt)}`}
                                        {inv.notes && ` · ${inv.notes}`}
                                      </p>
                                      {inv.payments.length > 0 && (
                                        <p className="mt-1 text-xs text-muted-foreground">
                                          Payments: {inv.payments.map((p) => `${formatMoney(p.amountCents)} (${p.method.toLowerCase().replaceAll("_", " ")}${p.reference ? ` · ${p.reference}` : ""})`).join(" · ")}
                                        </p>
                                      )}
                                      <div className="mt-2 flex flex-wrap items-center gap-2">
                                        {inv.status === "DRAFT" && (
                                          <form action={sendInvoice.bind(null, inv.id)}>
                                            <Button type="submit" size="sm" variant="secondary"><Send className="mr-1.5 h-3.5 w-3.5" />Send to client</Button>
                                          </form>
                                        )}
                                        {inv.status !== "PAID" && inv.status !== "VOID" && (
                                          <details className="group inline">
                                            <summary className="inline-flex h-8 cursor-pointer list-none items-center rounded-md px-3 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground">
                                              Record payment
                                            </summary>
                                            <form action={recordPayment.bind(null, inv.id)} className="mt-2 flex flex-wrap items-end gap-2 rounded-lg border bg-muted/40 p-3">
                                              <div className="space-y-1">
                                                <Label className="text-xs text-muted-foreground">Amount ($)</Label>
                                                <Input name="amount" type="number" min="0.01" step="0.01" defaultValue={(owing / 100).toFixed(2)} className="w-28" required />
                                              </div>
                                              <div className="space-y-1">
                                                <Label className="text-xs text-muted-foreground">Method</Label>
                                                <Select name="method" defaultValue="BANK_TRANSFER" items={{ BANK_TRANSFER: "Bank transfer", CARD: "Card", OTHER: "Other" }}>
                                                  <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                                                  <SelectContent>
                                                    <SelectItem value="BANK_TRANSFER">Bank transfer</SelectItem>
                                                    <SelectItem value="CARD">Card</SelectItem>
                                                    <SelectItem value="OTHER">Other</SelectItem>
                                                  </SelectContent>
                                                </Select>
                                              </div>
                                              <div className="space-y-1">
                                                <Label className="text-xs text-muted-foreground">Reference</Label>
                                                <Input name="reference" placeholder="e.g. txn id" className="w-36" />
                                              </div>
                                              <Button size="sm" type="submit">Save</Button>
                                            </form>
                                          </details>
                                        )}
                                        {inv.status !== "VOID" && inv.status !== "PAID" && (
                                          <form action={voidInvoice.bind(null, inv.id)}>
                                            <Button type="submit" size="sm" variant="ghost" className="text-muted-foreground"><Ban className="mr-1 h-3.5 w-3.5" />Void</Button>
                                          </form>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                                <details className="rounded-lg border border-dashed">
                                  <summary className="cursor-pointer px-4 py-3 text-sm text-muted-foreground hover:text-foreground">
                                    New invoice
                                  </summary>
                                  <form action={createInvoice.bind(null, business.id)} className="space-y-3 border-t px-4 py-4">
                                    <LineItemsEditor taxRateBps={taxRateBps} />
                                    <div className="flex flex-wrap items-end gap-3">
                                      <div className="min-w-0 flex-1 space-y-1">
                                        <Label className="text-xs text-muted-foreground">Notes (optional)</Label>
                                        <Input name="notes" placeholder="e.g. October package" />
                                      </div>
                                      <Button type="submit">Create invoice</Button>
                                    </div>
                                  </form>
                                </details>
                              </CardContent>
                            </Card>
                          </div>
                        ),
                      },
                    ]
                  : []),
              ]}
            />
          </div>

          {/* right rail */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">Pipeline</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <SalesStageBadge stage={business.salesStage} />
                  <QualBadge status={business.qualificationStatus} />
                </div>
                <form action={setSalesStage.bind(null, business.id)} className="flex items-center gap-2">
                  <Select
                    name="stage"
                    defaultValue={business.salesStage}
                    items={Object.fromEntries(STAGE_ORDER.map((s) => [s, salesStageLabel(s)]))}
                  >
                    <SelectTrigger className="h-8 flex-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STAGE_ORDER.map((s) => (
                        <SelectItem key={s} value={s}>{s.replaceAll("_", " ").toLowerCase()}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button size="sm" variant="outline" type="submit">Move</Button>
                </form>
                <Separator />
                <form action={setNextAction.bind(null, business.id)} className="space-y-2.5">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Next action</Label>
                    <Input name="nextAction" defaultValue={business.nextAction ?? ""} placeholder="What happens next?" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">When</Label>
                    <Input name="nextActionAt" type="datetime-local"
                      defaultValue={business.nextActionAt ? new Date(business.nextActionAt.getTime() - business.nextActionAt.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ""} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Owner</Label>
                    <Select
                      name="assignedToId"
                      defaultValue={business.assignedToId ?? "none"}
                      items={{ none: "Unassigned", ...Object.fromEntries(users.map((u) => [u.id, u.name])) }}
                    >
                      <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Unassigned</SelectItem>
                        {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button type="submit" size="sm" variant="secondary" className="w-full">Save</Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">Contacts</CardTitle></CardHeader>
              <CardContent className="space-y-2.5">
                {business.contacts.length === 0 && (
                  <p className="text-sm text-muted-foreground">No contacts yet — add who to reach out to.</p>
                )}
                {business.contacts.map((c) => (
                  <div key={c.id} className="rounded-lg bg-muted/50 p-2.5 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{c.name ?? c.email ?? c.phone}</span>
                      {c.isPrimary && <Badge variant="secondary">primary</Badge>}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {[c.email, c.phone, c.role].filter(Boolean).join(" · ") || "no details"}
                    </div>
                    {c.optedOut && <Badge variant="destructive" className="mt-1">opted out</Badge>}
                  </div>
                ))}
                <Separator />
                <form action={addContact.bind(null, business.id)} className="space-y-2">
                  <Input name="name" placeholder="Name" />
                  <Input name="email" type="email" placeholder="Email" />
                  <Input name="phone" placeholder="Phone" />
                  <Input name="role" placeholder="Role (e.g. owner)" />
                  <Select
                    name="permissionBasis"
                    defaultValue="inferred_business"
                    items={{
                      inferred_business: "Published business contact",
                      express: "Gave us permission",
                      replied: "They contacted us",
                      unknown: "Unknown",
                    }}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="inferred_business">Published business contact</SelectItem>
                      <SelectItem value="express">Gave us permission</SelectItem>
                      <SelectItem value="replied">They contacted us</SelectItem>
                      <SelectItem value="unknown">Unknown</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button type="submit" size="sm" variant="secondary" className="w-full">Add contact</Button>
                </form>
              </CardContent>
            </Card>

            <details className="group rounded-xl border bg-card">
              <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
                Business details
              </summary>
              <div className="border-t px-4 py-4">
                <form action={updateBusiness.bind(null, business.id)} className="space-y-2.5 text-sm">
                  <div className="space-y-1"><Label className="text-xs">Name</Label><Input name="name" defaultValue={business.name} /></div>
                  <div className="space-y-1"><Label className="text-xs">Website</Label><Input name="website" defaultValue={business.website ?? ""} /></div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1"><Label className="text-xs">Email</Label><Input name="email" defaultValue={business.email ?? ""} /></div>
                    <div className="space-y-1"><Label className="text-xs">Phone</Label><Input name="phone" defaultValue={business.phone ?? ""} /></div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1"><Label className="text-xs">Suburb</Label><Input name="suburb" defaultValue={business.suburb ?? ""} /></div>
                    <div className="space-y-1"><Label className="text-xs">City</Label><Input name="city" defaultValue={business.city ?? ""} /></div>
                    <div className="space-y-1"><Label className="text-xs">State</Label><Input name="state" defaultValue={business.state ?? ""} /></div>
                  </div>
                  <div className="space-y-1"><Label className="text-xs">Categories</Label><Input name="categories" defaultValue={(business.categories as string[]).join(", ")} /></div>
                  <Button type="submit" size="sm" variant="secondary" className="w-full">Save details</Button>
                </form>
              </div>
            </details>
          </div>
        </div>
      </div>
    </div>
  );
}

function BannerCta({
  businessId,
  step,
  approvedTopicId,
  inFlightArticleId,
  hasProposedTopics,
}: {
  businessId: string;
  step: ReturnType<typeof nextStepFor>;
  approvedTopicId: string | null;
  inFlightArticleId: string | null;
  hasProposedTopics: boolean;
}) {
  switch (step.key) {
    case "suggest_topics":
      return hasProposedTopics ? (
        <Button render={<Link href={`/prospects/${businessId}?tab=articles`} />}>
          Review the topics<ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      ) : (
        <form action={suggestTopics.bind(null, businessId)}>
          <Button type="submit"><Sparkles className="mr-2 h-4 w-4" />Suggest topics</Button>
        </form>
      );
    case "start_article":
      return approvedTopicId ? (
        <form action={createArticleFromTopic.bind(null, approvedTopicId)}>
          <Button type="submit">Start writing<ArrowRight className="ml-2 h-4 w-4" /></Button>
        </form>
      ) : null;
    case "finish_article":
      return (
        <Button render={<Link href={`/articles/${inFlightArticleId}`} />}>
          Open article<ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      );
    case "send_intro":
    case "reply":
    case "follow_up":
      return (
        <Button render={<Link href={`/prospects/${businessId}?tab=messages`} />}>
          Write it<ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      );
    case "run_checks":
      return <p className="text-xs text-muted-foreground">Fill in below ↓</p>;
    case "await_checks":
    case "review_fit":
      return (
        <Button variant="outline" render={<Link href={`/prospects/${businessId}?tab=checks`} />}>
          View checks
        </Button>
      );
    case "add_website":
      return <p className="text-xs text-muted-foreground">Add it in Business details ↓</p>;
    case "won":
      return null; // conversion panel above handles it
    // customer keys — the workflow already computed where to go
    case "chase_payment":
    case "release_article":
    case "nudge_plan":
    case "plan_next_month":
    case "prepare_invoice":
    case "customer_ok":
      return (
        <Button render={<Link href={step.href} />}>
          {NEXT_STEP_COPY[step.key].cta}<ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      );
    default:
      return null;
  }
}
