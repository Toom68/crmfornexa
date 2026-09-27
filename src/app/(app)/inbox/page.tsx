import Link from "next/link";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { pollInboxNow } from "@/lib/actions/message";
import { formatRelative } from "@/lib/utils";
import { RefreshCw } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const messages = await prisma.message.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { business: true, contact: true, sentBy: true },
  });
  const account = await prisma.emailAccount.findFirst({ where: { status: "active" } });

  // Group into threads by business
  const byBusiness = new Map<string, typeof messages>();
  for (const m of messages) {
    const list = byBusiness.get(m.businessId) ?? [];
    list.push(m);
    byBusiness.set(m.businessId, list);
  }

  return (
    <div>
      <PageHeader
        title="Shared inbox"
        description={account ? `Connected to ${account.email}` : "No mailbox connected — connect Gmail in Settings → Integrations"}
        actions={
          <form action={pollInboxNow}>
            <Button variant="outline"><RefreshCw className="mr-2 h-4 w-4" />Check for replies</Button>
          </form>
        }
      />
      <div className="max-w-4xl space-y-3 p-8">
        {[...byBusiness.entries()].map(([businessId, msgs]) => {
          const b = msgs[0].business;
          const latest = msgs[0];
          const needsAction = b.nextAction?.includes("Reply received") || b.nextAction?.includes("SMS reply");
          return (
            <Card key={businessId} className={needsAction ? "border-primary/50" : ""}>
              <CardContent className="py-4">
                <div className="flex items-start justify-between">
                  <div>
                    <Link href={`/prospects/${businessId}`} className="font-medium hover:underline">{b.name}</Link>
                    {needsAction && <Badge className="ml-2">needs reply</Badge>}
                  </div>
                  <span className="text-xs text-muted-foreground">{formatRelative(latest.createdAt)}</span>
                </div>
                <div className="mt-2 space-y-2">
                  {msgs.slice(0, 3).map((m) => (
                    <div key={m.id} className={`rounded-md border p-2.5 text-sm ${m.direction === "INBOUND" ? "bg-accent/40" : ""}`}>
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{m.direction === "INBOUND" ? "← " : "→ "}{m.channel.toLowerCase()}{m.status === "SIMULATED" ? " (simulated)" : ""}</span>
                        <span>{formatRelative(m.createdAt)}</span>
                      </div>
                      {m.subject && <p className="mt-0.5 font-medium">{m.subject}</p>}
                      <p className="mt-0.5 line-clamp-2 whitespace-pre-wrap text-muted-foreground">{m.bodyText}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-2">
                  <Button size="sm" variant="outline" render={<Link href={`/prospects/${businessId}`} />}>
                    Open record →
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {byBusiness.size === 0 && (
          <p className="py-16 text-center text-sm text-muted-foreground">
            No messages yet — send an introduction from a prospect&apos;s page.
          </p>
        )}
      </div>
    </div>
  );
}
