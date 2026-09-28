"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { enqueueJob } from "@/lib/jobs";
import { monthRange, monthLabel } from "@/lib/billing";
import { issueClientLink, primaryContact, queueNamedTemplate } from "@/lib/outbound";
import { hashToken } from "@/lib/crypto";

const PLAN_TEMPLATES = {
  email: "Content plan — approval request (email)",
  sms: "Content plan — approval request (SMS)",
};
const DELIVERED_TEMPLATES = {
  email: "Article delivered (email)",
  sms: "Article delivered (SMS)",
};

async function activeSubscription(businessId: string) {
  return prisma.subscription.findFirst({
    where: { businessId, status: "ACTIVE" },
    include: { package: true },
  });
}

/** Create a plan month for a customer, prefilled from package quota + proposed topics. */
export async function createPlan(businessId: string, formData: FormData) {
  const user = await requireUser();
  const month = String(formData.get("month") ?? "").trim(); // "YYYY-MM"
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) throw new Error("Pick a month");
  const { periodStart, periodEnd } = monthRange(new Date(y, m - 1, 1));

  const existing = await prisma.contentPlan.findUnique({
    where: { businessId_periodStart: { businessId, periodStart } },
  });
  if (existing) redirect(`/prospects/${businessId}/plans/${existing.id}`);

  const sub = await activeSubscription(businessId);
  const plan = await prisma.contentPlan.create({
    data: {
      businessId,
      subscriptionId: sub?.id ?? null,
      periodStart,
      periodEnd,
    },
  });

  // Prefill: proposed topics from earlier AI suggestions, up to the package quota
  const quota = sub?.package.articlesPerMonth ?? 4;
  const proposed = await prisma.topic.findMany({
    where: { businessId, status: "PROPOSED" },
    orderBy: { createdAt: "asc" },
    take: quota,
  });
  const days = new Date(periodEnd).getDate();
  await prisma.contentPlanItem.createMany({
    data: proposed.map((t, i) => ({
      contentPlanId: plan.id,
      title: t.title,
      rationale: t.rationale,
      sortOrder: i,
      // spread across the month: roughly every quota-th of the days
      scheduledFor: new Date(y, m - 1, Math.min(days, Math.max(1, Math.round(((i + 1) * days) / (quota + 1)))), 9, 0, 0),
    })),
  });

  await logActivity({ actorId: user.id, action: "plan.create", entityType: "contentPlan", entityId: plan.id });
  revalidatePath(`/prospects/${businessId}`);
  redirect(`/prospects/${businessId}/plans/${plan.id}`);
}

export async function addPlanItem(planId: string, formData: FormData) {
  const user = await requireUser();
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;
  const dateStr = String(formData.get("scheduledFor") ?? "");
  if (!dateStr) throw new Error("Pick a date");
  const count = await prisma.contentPlanItem.count({ where: { contentPlanId: planId } });
  await prisma.contentPlanItem.create({
    data: {
      contentPlanId: planId,
      title,
      rationale: String(formData.get("rationale") ?? "").trim() || null,
      scheduledFor: new Date(dateStr + "T09:00:00"),
      sortOrder: count,
    },
  });
  const plan = await prisma.contentPlan.findUniqueOrThrow({ where: { id: planId } });
  await logActivity({ actorId: user.id, action: "plan.item_add", entityType: "contentPlan", entityId: planId });
  revalidatePath(`/prospects/${plan.businessId}/plans/${planId}`);
}

export async function updatePlanItem(itemId: string, formData: FormData) {
  await requireUser();
  const dateStr = String(formData.get("scheduledFor") ?? "");
  const item = await prisma.contentPlanItem.update({
    where: { id: itemId },
    data: {
      title: String(formData.get("title") ?? "").trim() || undefined,
      rationale: String(formData.get("rationale") ?? "").trim() || null,
      scheduledFor: dateStr ? new Date(dateStr + "T09:00:00") : undefined,
    },
  });
  const plan = await prisma.contentPlan.findUniqueOrThrow({ where: { id: item.contentPlanId } });
  revalidatePath(`/prospects/${plan.businessId}/plans/${plan.id}`);
}

export async function removePlanItem(itemId: string) {
  await requireUser();
  const item = await prisma.contentPlanItem.delete({ where: { id: itemId } });
  const plan = await prisma.contentPlan.findUniqueOrThrow({ where: { id: item.contentPlanId } });
  revalidatePath(`/prospects/${plan.businessId}/plans/${plan.id}`);
}

export async function movePlanItem(itemId: string, direction: "up" | "down") {
  await requireUser();
  const item = await prisma.contentPlanItem.findUniqueOrThrow({ where: { id: itemId } });
  const siblings = await prisma.contentPlanItem.findMany({
    where: { contentPlanId: item.contentPlanId },
    orderBy: { sortOrder: "asc" },
  });
  const idx = siblings.findIndex((s) => s.id === itemId);
  const swapWith = direction === "up" ? siblings[idx - 1] : siblings[idx + 1];
  if (!swapWith) return;
  await prisma.$transaction([
    prisma.contentPlanItem.update({ where: { id: item.id }, data: { sortOrder: swapWith.sortOrder } }),
    prisma.contentPlanItem.update({ where: { id: swapWith.id }, data: { sortOrder: item.sortOrder } }),
  ]);
  const plan = await prisma.contentPlan.findUniqueOrThrow({ where: { id: item.contentPlanId } });
  revalidatePath(`/prospects/${plan.businessId}/plans/${plan.id}`);
}

/** Send the plan to the client for approval via a private link. */
export async function sendPlanForApproval(planId: string) {
  const user = await requireUser();
  const plan = await prisma.contentPlan.findUniqueOrThrow({
    where: { id: planId },
    include: { items: true, business: true },
  });
  if (plan.items.filter((i) => i.status !== "DROPPED").length === 0) throw new Error("Add at least one topic first");
  if (plan.status === "APPROVED") throw new Error("Plan is already approved");

  const link = await issueClientLink("PLAN_APPROVAL", { businessId: plan.businessId, contentPlanId: plan.id });
  const contact = await primaryContact(plan.businessId, "EMAIL");
  const channel = contact ? "EMAIL" : "EMAIL";
  await queueNamedTemplate({
    templateName: PLAN_TEMPLATES[channel === "EMAIL" ? "email" : "sms"],
    businessId: plan.businessId,
    contactId: contact?.id ?? null,
    userName: user.name,
    userId: user.id,
    extra: { plan_link: link, plan_month: monthLabel(plan.periodStart) },
  });
  await prisma.contentPlan.update({
    where: { id: planId },
    data: { status: "AWAITING_APPROVAL", sentAt: new Date() },
  });
  await prisma.business.update({
    where: { id: plan.businessId },
    data: { nextAction: `Plan sent — awaiting approval for ${monthLabel(plan.periodStart)}`, nextActionAt: new Date(Date.now() + 48 * 3600_000) },
  });
  await logActivity({ actorId: user.id, action: "plan.sent", entityType: "contentPlan", entityId: planId });
  revalidatePath(`/prospects/${plan.businessId}/plans/${planId}`);
  revalidatePath(`/prospects/${plan.businessId}`);
}

export async function archivePlan(planId: string) {
  const user = await requireUser();
  const plan = await prisma.contentPlan.update({ where: { id: planId }, data: { status: "ARCHIVED" } });
  await prisma.clientLink.updateMany({
    where: { contentPlanId: planId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await logActivity({ actorId: user.id, action: "plan.archived", entityType: "contentPlan", entityId: planId });
  revalidatePath(`/prospects/${plan.businessId}`);
  redirect(`/prospects/${plan.businessId}?tab=plans`);
}

// ---- client-side (token-gated, no login — the link is the capability) ----

export async function approvePlanByToken(token: string, formData: FormData) {
  const link = await prisma.clientLink.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { contentPlan: true },
  });
  if (!link || link.revokedAt || (link.expiresAt && link.expiresAt < new Date())) throw new Error("This link is no longer valid");
  const plan = link.contentPlan;
  if (!plan) throw new Error("Link does not point to a plan");
  const decision = String(formData.get("decision") ?? "approve");
  const note = String(formData.get("note") ?? "").trim() || null;

  if (decision === "changes") {
    await prisma.contentPlan.update({
      where: { id: plan.id },
      data: { status: "DRAFT", clientNote: note },
    });
    await prisma.business.update({
      where: { id: plan.businessId },
      data: { nextAction: `Client requested changes to the ${monthLabel(plan.periodStart)} plan`, nextActionAt: new Date() },
    });
    redirect(`/c/${token}?done=changes`);
  }

  await prisma.contentPlan.update({
    where: { id: plan.id },
    data: { status: "APPROVED", approvedAt: new Date(), clientNote: note },
  });
  await prisma.business.update({
    where: { id: plan.businessId },
    data: { nextAction: `Plan approved — start production for ${monthLabel(plan.periodStart)}`, nextActionAt: new Date() },
  });
  redirect(`/c/${token}?done=approved`);
}

// ---- production ----

/** Create the article for a plan item and kick off research via n8n. */
export async function startPlanItemArticle(itemId: string) {
  const user = await requireUser();
  const item = await prisma.contentPlanItem.findUniqueOrThrow({
    where: { id: itemId },
    include: { contentPlan: true },
  });
  if (item.articleId) return;
  const topic = await prisma.topic.create({
    data: {
      businessId: item.contentPlan.businessId,
      title: item.title,
      rationale: item.rationale,
      status: "APPROVED",
      origin: "plan",
      createdById: user.id,
      decidedById: user.id,
      decidedAt: new Date(),
    },
  });
  const article = await prisma.article.create({
    data: {
      businessId: item.contentPlan.businessId,
      topicId: topic.id,
      title: item.title,
      stage: "RESEARCH",
      isFreeOffer: false,
      scheduledFor: item.scheduledFor,
      createdById: user.id,
    },
  });
  await enqueueJob("n8n_research", { businessId: item.contentPlan.businessId, articleId: article.id }, { idempotencyKey: `research:${article.id}` });
  await prisma.contentPlanItem.update({ where: { id: itemId }, data: { articleId: article.id, status: "IN_PRODUCTION" } });
  await logActivity({ actorId: user.id, action: "plan.item_start", entityType: "contentPlanItem", entityId: itemId, meta: { articleId: article.id } });
  revalidatePath(`/prospects/${item.contentPlan.businessId}/plans/${item.contentPlanId}`);
}

/** Mark a plan item as dropped. */
export async function dropPlanItem(itemId: string) {
  await requireUser();
  const item = await prisma.contentPlanItem.update({ where: { id: itemId }, data: { status: "DROPPED" } });
  const plan = await prisma.contentPlan.findUniqueOrThrow({ where: { id: item.contentPlanId } });
  revalidatePath(`/prospects/${plan.businessId}/plans/${plan.id}`);
}

/**
 * Release a scheduled article to the customer — the manual confirmation step.
 * Requires the article to be APPROVED; creates the private link and (optionally)
 * queues a notification message.
 */
export async function releasePlanItem(itemId: string, notify: boolean) {
  const user = await requireUser();
  const item = await prisma.contentPlanItem.findUniqueOrThrow({
    where: { id: itemId },
    include: { contentPlan: true },
  });
  const article = item.articleId
    ? await prisma.article.findUniqueOrThrow({ where: { id: item.articleId } })
    : null;
  if (!article) throw new Error("No article for this plan item yet");
  if (article.stage !== "APPROVED") throw new Error("Article must be approved before release");

  // private article link
  const versionId = article.currentVersionId;
  if (!versionId) throw new Error("Article has no content yet");
  const { newToken, hashToken: hash } = await import("@/lib/crypto");
  const token = newToken();
  await prisma.privateLink.create({
    data: {
      tokenHash: hash(token),
      articleId: article.id,
      articleVersionId: versionId,
      label: `Plan release — ${monthLabel(item.contentPlan.periodStart)}`,
      createdById: user.id,
    },
  });
  const articleUrl = `${process.env.APP_BASE_URL ?? "http://localhost:3000"}/a/${token}`;

  await prisma.article.update({ where: { id: article.id }, data: { stage: "DELIVERED", deliveredAt: new Date() } });
  await prisma.contentPlanItem.update({ where: { id: itemId }, data: { status: "DELIVERED" } });

  if (notify) {
    const contact = await primaryContact(item.contentPlan.businessId, "EMAIL");
    await queueNamedTemplate({
      templateName: DELIVERED_TEMPLATES.email,
      businessId: item.contentPlan.businessId,
      contactId: contact?.id ?? null,
      userName: user.name,
      userId: user.id,
      extra: { article_link: articleUrl, article_title: article.title },
    });
  }
  await logActivity({ actorId: user.id, action: "plan.item_released", entityType: "contentPlanItem", entityId: itemId, meta: { articleId: article.id, notify } });
  revalidatePath(`/prospects/${item.contentPlan.businessId}/plans/${item.contentPlanId}`);
  revalidatePath(`/prospects/${item.contentPlan.businessId}`);
  revalidatePath(`/articles/${article.id}`);
}
