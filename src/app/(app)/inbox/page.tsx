import Link from "next/link";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { pollInboxNow } from "@/lib/actions/message";
import { formatRelative } from "@/lib/utils";
import { needsReply } from "@/lib/workflow";
import { RefreshCw, Mail, MessageSquare, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const messages = await prisma.message.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { business: true, contact: true, sentBy: true },
  });
  const account = await prisma.emailAccount.findFirst({ where: { status: "active" } });

  // Group into threads by business, newest activity first
  const byBusiness = new Map<string, typeof messages>();
  for (const m of messages) {
    const list = byBusiness.get(m.businessId) ?? [];
    list.push(m);
    byBusiness.set(m.businessId, list);
  }
  const threads = [...byBusiness.entries()]
    .map(([businessId, msgs]) => {
      const b = msgs[0].business;
      return {
        businessId,
        business: b,
        latest: msgs[0],
        needsAction: needsReply(b.nextAction),
        msgCount: msgs.length,
        lastInbound: msgs.find((m) => m.direction === "INBOUND") ?? null,
      };
    })
    .sort((a, z) => (z.needsAction ? 1 : 0) - (a.needsAction ? 1 : 0) || z.latest.createdAt.getTime() - a.latest.createdAt.getTime());

  return (
    <div>
      <PageHeader
        title="Inbox"
        description={account ? `Shared mailbox — ${account.email}` : "No mailbox connected yet — hook up Gmail in Settings"}
        actions={
          <form action={pollInboxNow}>
            <Button type="submit" variant="outline"><RefreshCw className="mr-2 h-4 w-4" />Check for replies</Button>
          </form>
        }
      />
      <div className="mx-auto max-w-3xl px-8 py-8">
        {threads.length === 0 ? (
          <div className="rounded-xl border bg-card px-8 py-14 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent">
              <Mail className="h-6 w-6 text-accent-foreground" />
            </div>
            <h2 className="mt-4 font-heading text-xl font-semibold">No conversations yet</h2>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
              Once you send an introduction from a prospect&apos;s page, replies land here.
            </p>
            <Button className="mt-6" variant="outline" render={<Link href="/prospects" />}>
              Go to prospects<ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border bg-card">
            {threads.map((t) => (
              <Link
                key={t.businessId}
                href={`/prospects/${t.businessId}?tab=messages`}
                className="group flex items-start gap-4 border-b px-5 py-4 transition-colors last:border-b-0 hover:bg-accent/50"
              >
                <div
                  className={cn(
                    "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                    t.needsAction ? "bg-primary text-primary-foreground" : "bg-accent text-accent-foreground",
                  )}
                >
                  {t.business.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-medium">{t.business.name}</span>
                    {t.needsAction && <Badge>needs reply</Badge>}
                    {t.msgCount > 1 && (
                      <span className="text-xs text-muted-foreground">{t.msgCount} messages</span>
                    )}
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
                    <span className="mr-1.5 inline-flex items-center gap-0.5 align-[-2px] text-muted-foreground/70">
                      {t.latest.channel === "SMS" ? <MessageSquare className="h-3 w-3" /> : <Mail className="h-3 w-3" />}
                    </span>
                    {t.latest.direction === "INBOUND" ? "" : "You: "}
                    {t.latest.bodyText}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-xs text-muted-foreground">{formatRelative(t.latest.createdAt)}</div>
                  <ArrowRight className="ml-auto mt-2 h-4 w-4 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
