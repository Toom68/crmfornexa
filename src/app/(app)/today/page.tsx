import Link from "next/link";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRelative, formatDateTime } from "@/lib/utils";
import { SalesStageBadge, ArticleStageBadge } from "@/components/stage-badge";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const now = new Date();
  const [replies, followUps, articles, failedJobs, queuedJobs] = await Promise.all([
    // newest inbound messages not yet followed by an outbound reply
    prisma.message.findMany({
      where: { direction: "INBOUND" },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { business: true, contact: true },
    }),
    prisma.business.findMany({
      where: { nextActionAt: { lte: now }, salesStage: { notIn: ["WON", "LOST", "DO_NOT_CONTACT"] } },
      orderBy: { nextActionAt: "asc" },
      take: 20,
      include: { assignedTo: true },
    }),
    prisma.article.findMany({
      where: { stage: { in: ["HUMAN_EDIT", "CLIENT_REVIEW", "REVISIONS", "TOPIC_APPROVED", "DRAFT", "RESEARCH"] } },
      orderBy: { updatedAt: "desc" },
      take: 20,
      include: { business: true, topic: true },
    }),
    prisma.job.findMany({
      where: { status: "FAILED" },
      orderBy: { updatedAt: "desc" },
      take: 10,
    }),
    prisma.job.count({ where: { status: { in: ["PENDING", "RUNNING"] } } }),
  ]);

  const needsReply = replies.filter((m) =>
    m.business.nextAction?.includes("Reply received") || m.business.nextAction?.includes("SMS reply"),
  );

  return (
    <div>
      <PageHeader title="Today" description="What needs attention right now" />
      <div className="grid gap-4 p-8 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Replies waiting</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {needsReply.length === 0 && <p className="text-sm text-muted-foreground">No unanswered replies.</p>}
            {needsReply.map((m) => (
              <Link key={m.id} href={`/prospects/${m.businessId}`} className="block rounded-md border p-3 hover:bg-accent">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{m.business.name}</span>
                  <span className="text-xs text-muted-foreground">{formatRelative(m.createdAt)}</span>
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                  {m.channel === "SMS" ? "SMS" : m.subject || "Email"} — {m.bodyText}
                </p>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Follow-ups due</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {followUps.length === 0 && <p className="text-sm text-muted-foreground">Nothing due.</p>}
            {followUps.map((b) => (
              <Link key={b.id} href={`/prospects/${b.id}`} className="block rounded-md border p-3 hover:bg-accent">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{b.name}</span>
                  <SalesStageBadge stage={b.salesStage} />
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {b.nextAction ?? "Follow up"} — due {formatDateTime(b.nextActionAt)}
                  {b.assignedTo ? ` · ${b.assignedTo.name}` : ""}
                </p>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Articles needing attention</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {articles.length === 0 && <p className="text-sm text-muted-foreground">No articles in flight.</p>}
            {articles.map((a) => (
              <Link key={a.id} href={`/articles/${a.id}`} className="block rounded-md border p-3 hover:bg-accent">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{a.title}</span>
                  <ArticleStageBadge stage={a.stage} />
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{a.business.name}</p>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">System</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">{queuedJobs} background jobs queued/running.</p>
            {failedJobs.map((j) => (
              <div key={j.id} className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{j.type}</span>
                  <span className="text-xs text-muted-foreground">{formatRelative(j.updatedAt)}</span>
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-destructive">{j.error}</p>
              </div>
            ))}
            {failedJobs.length === 0 && <p className="text-sm text-muted-foreground">No failed jobs.</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
