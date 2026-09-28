import Link from "next/link";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { formatRelative } from "@/lib/utils";
import { SalesStageBadge } from "@/components/stage-badge";
import { nextStepFor, needsReply, type NextStep } from "@/lib/workflow";
import { ArrowRight, Inbox, Radar, Plus, CircleCheck } from "lucide-react";
import type { SalesStage } from "@/generated/prisma/enums";

export const dynamic = "force-dynamic";

type QueueItem = {
  id: string;
  name: string;
  stage: SalesStage;
  step: NextStep;
  nextActionAt: Date | null;
  assignedTo: string | null;
};

function QueueRow({ item }: { item: QueueItem }) {
  const overdue = item.step.rank <= 5;
  return (
    <Link
      href={item.step.href}
      className="group flex items-center gap-4 border-b px-5 py-3.5 transition-colors last:border-b-0 hover:bg-accent/50"
    >
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
          overdue ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
        }`}
      >
        {item.step.rank === 0 ? (
          <Inbox className="h-4 w-4" />
        ) : (
          <CircleCheck className="h-4 w-4" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-medium">{item.name}</span>
          <SalesStageBadge stage={item.stage} />
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground">
          <span className={overdue ? "font-medium text-foreground" : ""}>{item.step.title}</span>
          {item.step.hint ? ` — ${item.step.hint}` : ""}
        </p>
      </div>
      <div className="hidden shrink-0 text-right text-xs text-muted-foreground sm:block">
        {item.assignedTo ? <div>{item.assignedTo}</div> : null}
        {item.nextActionAt && item.step.key !== "reply" && <div>due {formatRelative(item.nextActionAt)}</div>}
        {item.nextActionAt && item.step.key === "reply" && <div>waiting {formatRelative(item.nextActionAt).replace(" ago", "")}</div>}
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
    </Link>
  );
}

export default async function TodayPage() {
  const [businesses, prospectCount, failedJobs, queuedJobs] = await Promise.all([
    prisma.business.findMany({
      where: {
        OR: [
          { salesStage: { notIn: ["WON", "LOST", "DO_NOT_CONTACT"] } },
          { isCustomer: true },
        ],
      },
      orderBy: { updatedAt: "desc" },
      include: {
        assignedTo: { select: { name: true } },
        topics: { select: { id: true, status: true, title: true } },
        articles: { select: { id: true, topicId: true, stage: true, title: true, isFreeOffer: true, updatedAt: true } },
        messages: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true } },
        subscriptions: { select: { id: true, status: true, package: { select: { name: true, articlesPerMonth: true } } } },
        contentPlans: {
          select: {
            id: true, status: true, periodStart: true, sentAt: true,
            items: { select: { id: true, status: true, scheduledFor: true, title: true, articleId: true } },
          },
        },
        invoices: {
          select: {
            id: true, number: true, status: true, dueDate: true, totalCents: true, paidAt: true, voidedAt: true,
            payments: { select: { amountCents: true } },
          },
        },
      },
    }),
    prisma.business.count(),
    prisma.job.findMany({ where: { status: "FAILED" }, orderBy: { updatedAt: "desc" }, take: 5 }),
    prisma.job.count({ where: { status: { in: ["PENDING", "RUNNING"] } } }),
  ]);

  const queue: QueueItem[] = businesses.map((b) => ({
    id: b.id,
    name: b.name,
    stage: b.salesStage,
    step: nextStepFor(b),
    nextActionAt: b.nextActionAt,
    assignedTo: b.assignedTo?.name ?? null,
  }));

  const needsReplyList = queue.filter((q) => q.step.key === "reply");
  const dueList = queue.filter((q) => q.step.key === "follow_up" || q.step.key === "chase_payment" || q.step.key === "release_article");
  const workingList = queue.filter(
    (q) => !["reply", "follow_up", "chase_payment", "release_article", "awaiting", "closed", "customer_ok"].includes(q.step.key),
  );
  const inboxWaiting = await countInboxWaiting();

  const totalAttention = needsReplyList.length + dueList.length + workingList.length;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const todayStr = new Date().toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div>
      <PageHeader
        title={`${greeting}`}
        description={todayStr}
      />
      <div className="mx-auto max-w-3xl px-8 py-8">
        {totalAttention === 0 ? (
          <div className="rounded-xl border bg-card p-10 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <CircleCheck className="h-6 w-6 text-primary" />
            </div>
            <h2 className="mt-4 font-heading text-xl font-semibold">Nothing needs you right now</h2>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
              {prospectCount === 0
                ? "Your pipeline is empty — add your first business or run a discovery to fill it."
                : "Every follow-up is handled. Fill the pipeline while you wait."}
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <Button render={<Link href="/prospects/discover" />}>
                <Radar className="mr-2 h-4 w-4" />Discover businesses
              </Button>
              <Button variant="outline" render={<Link href="/prospects/new" />}>
                <Plus className="mr-2 h-4 w-4" />Add a business
              </Button>
            </div>
          </div>
        ) : (
          <p className="mb-6 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">
              {totalAttention === 1 ? "1 business" : `${totalAttention} businesses`}
            </span>{" "}
            {needsReplyList.length > 0 && `· ${needsReplyList.length} waiting on a reply`}
            {dueList.length > 0 && ` · ${dueList.length} due now`}
            {inboxWaiting > 0 && ` · ${inboxWaiting} unread in the inbox`}
          </p>
        )}

        {needsReplyList.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-primary">Waiting on you</h2>
            <div className="overflow-hidden rounded-xl border bg-card">
              {needsReplyList.map((item) => <QueueRow key={item.id} item={item} />)}
            </div>
          </section>
        )}

        {dueList.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Due now</h2>
            <div className="overflow-hidden rounded-xl border bg-card">
              {dueList.map((item) => <QueueRow key={item.id} item={item} />)}
            </div>
          </section>
        )}

        {workingList.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Keep moving</h2>
            <div className="overflow-hidden rounded-xl border bg-card">
              {workingList.map((item) => <QueueRow key={item.id} item={item} />)}
            </div>
          </section>
        )}

        {failedJobs.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-destructive">Needs a look</h2>
            <div className="space-y-2">
              {failedJobs.map((j) => (
                <div key={j.id} className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
                  <span className="font-medium">{j.type}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{formatRelative(j.updatedAt)}</span>
                  <p className="mt-0.5 line-clamp-2 text-xs text-destructive">{j.error}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {totalAttention > 0 && (
          <p className="text-center text-xs text-muted-foreground">
            {queuedJobs > 0 ? `${queuedJobs} background job${queuedJobs === 1 ? "" : "s"} running — ` : ""}
            {prospectCount} business{prospectCount === 1 ? "" : "es"} in the pipeline
          </p>
        )}
      </div>
    </div>
  );
}

async function countInboxWaiting(): Promise<number> {
  const inbound = await prisma.message.findMany({
    where: { direction: "INBOUND" },
    orderBy: { createdAt: "desc" },
    take: 30,
    include: { business: { select: { nextAction: true } } },
  });
  return new Set(inbound.filter((m) => needsReply(m.business.nextAction)).map((m) => m.businessId)).size;
}
