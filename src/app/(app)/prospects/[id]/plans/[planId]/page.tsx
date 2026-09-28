import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PlanStatusBadge, PlanItemStatusBadge } from "@/components/customer-badges";
import { formatDate } from "@/lib/utils";
import { monthLabel } from "@/lib/billing";
import { addPlanItem, movePlanItem, removePlanItem, sendPlanForApproval, archivePlan, startPlanItemArticle, releasePlanItem, dropPlanItem } from "@/lib/actions/plan";
import { ArrowLeft, ArrowUp, ArrowDown, Trash2, Send, Archive, PenLine, ExternalLink, CheckCircle2 } from "lucide-react";

export const dynamic = "force-dynamic";

function dateInputValue(d: Date): string {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export default async function PlanEditorPage({
  params,
}: {
  params: Promise<{ id: string; planId: string }>;
}) {
  const { id, planId } = await params;
  const [business, plan] = await Promise.all([
    prisma.business.findUniqueOrThrow({ where: { id }, select: { id: true, name: true } }),
    prisma.contentPlan.findUnique({
      where: { id: planId },
      include: {
        items: { orderBy: { sortOrder: "asc" } },
        clientLinks: { where: { revokedAt: null } },
      },
    }),
  ]);
  if (!plan || plan.businessId !== id) notFound();

  const articleIds = plan.items.map((i) => i.articleId).filter((x): x is string => !!x);
  const articles = await prisma.article.findMany({
    where: { id: { in: articleIds } },
    select: { id: true, stage: true, title: true },
  });
  const articleById = new Map(articles.map((a) => [a.id, a]));
  const now = new Date();
  const editable = plan.status === "DRAFT";

  return (
    <div>
      <PageHeader
        title={`${monthLabel(plan.periodStart)} plan`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Link href={`/prospects/${id}?tab=plans`} className="text-muted-foreground hover:text-foreground">
              <ArrowLeft className="mr-1 inline h-3.5 w-3.5" />
              {business.name}
            </Link>
            <PlanStatusBadge status={plan.status} />
            {plan.approvedAt && (
              <span className="text-xs text-muted-foreground">approved {formatDate(plan.approvedAt)}</span>
            )}
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            {plan.status === "DRAFT" && (
              <form action={sendPlanForApproval.bind(null, plan.id)}>
                <Button type="submit"><Send className="mr-2 h-4 w-4" />Send for approval</Button>
              </form>
            )}
            {plan.status !== "ARCHIVED" && (
              <form action={archivePlan.bind(null, plan.id)}>
                <Button type="submit" variant="ghost" size="sm"><Archive className="mr-1.5 h-4 w-4" />Archive</Button>
              </form>
            )}
          </div>
        }
      />
      <div className="mx-auto max-w-3xl px-8 py-8">
        {plan.status === "AWAITING_APPROVAL" && (
          <p className="mb-6 rounded-lg border border-amber-300/60 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Sent to the client — the plan page link is in their email. They can approve it or ask for changes.
          </p>
        )}
        {plan.status === "APPROVED" && plan.clientNote && (
          <p className="mb-6 rounded-lg border bg-card px-4 py-3 text-sm">
            <span className="font-medium">Client note: </span>
            {plan.clientNote}
          </p>
        )}

        {editable && (
          <Card className="mb-6">
            <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">Add a topic</CardTitle></CardHeader>
            <CardContent>
              <form action={addPlanItem.bind(null, plan.id)} className="flex flex-wrap items-end gap-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <Label className="text-xs text-muted-foreground">Topic</Label>
                  <Input name="title" placeholder="e.g. Laundry renovation ideas for small spaces" required />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Publish date</Label>
                  <Input name="scheduledFor" type="date" required defaultValue={dateInputValue(plan.periodStart)} />
                </div>
                <Button type="submit" variant="secondary">Add</Button>
              </form>
            </CardContent>
          </Card>
        )}

        <div className="space-y-2">
          {plan.items.length === 0 && (
            <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
              No topics on this plan yet — add one above.
            </p>
          )}
          {plan.items.map((item, idx) => {
            const article = item.articleId ? articleById.get(item.articleId) : undefined;
            const canStart = plan.status === "APPROVED" && item.status === "PLANNED" && !item.articleId;
            const canRelease =
              item.status !== "DELIVERED" && item.status !== "DROPPED" && article?.stage === "APPROVED";
            const dueNow = item.status === "READY" && item.scheduledFor <= now;
            return (
              <Card key={item.id} className={dueNow ? "border-primary/40" : undefined}>
                <CardContent className="py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{item.title}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Scheduled for {formatDate(item.scheduledFor)}
                        {item.scheduledFor <= now && (item.status === "READY" || item.status === "PLANNED") && (
                          <span className="ml-1 text-primary">· due</span>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <PlanItemStatusBadge status={item.status} />
                      {editable && (
                        <div className="flex">
                          <form action={movePlanItem.bind(null, item.id, "up")}>
                            <Button type="submit" variant="ghost" size="sm" className="h-7 w-7 p-0" aria-label="Move up" disabled={idx === 0}>
                              <ArrowUp className="h-3.5 w-3.5" />
                            </Button>
                          </form>
                          <form action={movePlanItem.bind(null, item.id, "down")}>
                            <Button type="submit" variant="ghost" size="sm" className="h-7 w-7 p-0" aria-label="Move down" disabled={idx === plan.items.length - 1}>
                              <ArrowDown className="h-3.5 w-3.5" />
                            </Button>
                          </form>
                          <form action={removePlanItem.bind(null, item.id)}>
                            <Button type="submit" variant="ghost" size="sm" className="h-7 w-7 p-0" aria-label="Remove">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </form>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {canStart && (
                      <form action={startPlanItemArticle.bind(null, item.id)}>
                        <Button type="submit" size="sm" variant="secondary"><PenLine className="mr-1.5 h-3.5 w-3.5" />Start writing</Button>
                      </form>
                    )}
                    {item.articleId && (
                      <Button size="sm" variant="outline" render={<Link href={`/articles/${item.articleId}`} />}>
                        <ExternalLink className="mr-1.5 h-3.5 w-3.5" />Open article
                      </Button>
                    )}
                    {canRelease && (
                      <form action={releasePlanItem.bind(null, item.id, true)}>
                        <Button type="submit" size="sm"><CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />Release & notify</Button>
                      </form>
                    )}
                    {item.status === "IN_PRODUCTION" && article && article.stage !== "APPROVED" && (
                      <span className="text-xs text-muted-foreground">Article is at the {article.stage.replaceAll("_", " ").toLowerCase()} stage</span>
                    )}
                    {item.status === "READY" && article?.stage === "APPROVED" && !dueNow && (
                      <span className="text-xs text-muted-foreground">Releases on {formatDate(item.scheduledFor)}</span>
                    )}
                    {item.status !== "DELIVERED" && item.status !== "DROPPED" && (
                      <form action={dropPlanItem.bind(null, item.id)}>
                        <Button type="submit" size="sm" variant="ghost" className="text-muted-foreground">Drop</Button>
                      </form>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
