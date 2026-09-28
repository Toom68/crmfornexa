import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { AppSidebar } from "@/components/app-sidebar";
import { isActiveStage, needsReply, nextStepFor, CUSTOMER_ATTENTION_KEYS } from "@/lib/workflow";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/login");

  const now = new Date();
  const [dueFollowUps, recentInbound, customers] = await Promise.all([
    prisma.business.count({
      where: { nextActionAt: { lte: now }, salesStage: { notIn: ["WON", "LOST", "DO_NOT_CONTACT"] } },
    }),
    prisma.message.findMany({
      where: { direction: "INBOUND" },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: { business: { select: { nextAction: true, salesStage: true } } },
    }),
    prisma.business.findMany({
      where: { isCustomer: true },
      include: {
        topics: true,
        articles: true,
        subscriptions: { include: { package: true } },
        contentPlans: { where: { status: { not: "ARCHIVED" } }, include: { items: true } },
        invoices: { where: { status: { not: "VOID" } }, include: { payments: true } },
      },
    }),
  ]);
  const replyThreads = new Set(
    recentInbound
      .filter((m) => needsReply(m.business.nextAction) && isActiveStage(m.business.salesStage))
      .map((m) => m.businessId),
  ).size;
  const customerAttention = customers.filter((c) =>
    CUSTOMER_ATTENTION_KEYS.includes(nextStepFor(c).key),
  ).length;

  return (
    <div className="flex min-h-screen">
      <AppSidebar
        user={{ name: user.name, email: user.email }}
        counts={{ today: dueFollowUps + replyThreads + customerAttention, inbox: replyThreads, customers: customerAttention }}
      />
      <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
