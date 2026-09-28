"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { enqueueJob } from "@/lib/jobs";
import { logActivity } from "@/lib/activity";
import { newToken, hashToken } from "@/lib/crypto";

export async function generateProfile(businessId: string) {
  const user = await requireUser();
  await enqueueJob("n8n_profile", { businessId }, { idempotencyKey: `profile:${businessId}:${Date.now()}` });
  await logActivity({ actorId: user.id, action: "profile.generate", entityType: "business", entityId: businessId });
  revalidatePath(`/prospects/${businessId}`);
}

export async function suggestTopics(businessId: string) {
  const user = await requireUser();
  await enqueueJob("n8n_topics", { businessId }, { idempotencyKey: `topics:${businessId}:${Date.now()}` });
  await logActivity({ actorId: user.id, action: "topics.suggest", entityType: "business", entityId: businessId });
  revalidatePath(`/prospects/${businessId}`);
}

export async function addManualTopic(businessId: string, formData: FormData) {
  const user = await requireUser();
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;
  await prisma.topic.create({
    data: { businessId, title, rationale: String(formData.get("rationale") ?? "") || null, origin: "manual", createdById: user.id },
  });
  revalidatePath(`/prospects/${businessId}`);
}

export async function decideTopic(topicId: string, decision: "APPROVED" | "REJECTED") {
  const user = await requireUser();
  const topic = await prisma.topic.update({
    where: { id: topicId },
    data: { status: decision, decidedById: user.id, decidedAt: new Date() },
  });
  await logActivity({ actorId: user.id, action: `topic.${decision.toLowerCase()}`, entityType: "topic", entityId: topicId });
  revalidatePath(`/prospects/${topic.businessId}`);
}

/** Create an article from an approved topic and kick off research → draft via n8n. */
export async function createArticleFromTopic(topicId: string) {
  const user = await requireUser();
  const topic = await prisma.topic.findUniqueOrThrow({ where: { id: topicId } });
  const isFreeOffer = (await prisma.article.count({ where: { businessId: topic.businessId, isFreeOffer: true } })) === 0;
  const article = await prisma.article.create({
    data: {
      businessId: topic.businessId,
      topicId,
      title: topic.title,
      stage: "RESEARCH",
      isFreeOffer,
      createdById: user.id,
    },
  });
  await enqueueJob("n8n_research", { businessId: topic.businessId, articleId: article.id }, { idempotencyKey: `research:${article.id}` });
  await logActivity({ actorId: user.id, action: "article.create", entityType: "article", entityId: article.id });
  redirect(`/articles/${article.id}`);
}

/** Save a human edit — always a new version, never an overwrite. */
export async function saveArticleEdit(articleId: string, title: string, contentHtml: string, contentJson?: unknown) {
  const user = await requireUser();
  const article = await prisma.article.findUniqueOrThrow({
    where: { id: articleId },
    include: { versions: { orderBy: { version: "desc" }, take: 1 } },
  });
  const v = await prisma.articleVersion.create({
    data: {
      articleId,
      version: (article.versions[0]?.version ?? 0) + 1,
      title,
      contentHtml,
      contentJson: (contentJson as object) ?? undefined,
      meta: article.versions[0]?.meta ?? undefined,
      origin: "HUMAN_EDIT",
      createdById: user.id,
    },
  });
  await prisma.article.update({ where: { id: articleId }, data: { currentVersionId: v.id, title } });
  await logActivity({ actorId: user.id, action: "article.edited", entityType: "article", entityId: articleId, meta: { version: v.version } });
  revalidatePath(`/articles/${articleId}`);
}

export async function setArticleStage(articleId: string, stage: "HUMAN_EDIT" | "APPROVED" | "DELIVERED" | "REVISIONS" | "CLIENT_REVIEW") {
  const user = await requireUser();
  const article = await prisma.article.update({
    where: { id: articleId },
    data: { stage, deliveredAt: stage === "DELIVERED" ? new Date() : undefined },
  });
  // Keep the customer content plan in step: a plan item whose article is approved
  // becomes READY for its scheduled release; delivering marks it DELIVERED.
  await prisma.contentPlanItem.updateMany({
    where: { articleId, status: "IN_PRODUCTION" },
    data: { status: stage === "APPROVED" || stage === "DELIVERED" ? "READY" : "IN_PRODUCTION" },
  });
  await prisma.contentPlanItem.updateMany({
    where: { articleId, status: { not: "DROPPED" } },
    data: stage === "DELIVERED" ? { status: "DELIVERED" } : { status: undefined },
  });
  await logActivity({ actorId: user.id, action: `article.stage_${stage.toLowerCase()}`, entityType: "article", entityId: articleId });
  revalidatePath(`/articles/${articleId}`);
  revalidatePath(`/prospects/${article.businessId}`);
}

/** Create (or reuse) a private link for an article's current version. Returns the full URL. */
export async function ensurePrivateLink(articleId: string, userId?: string): Promise<string> {
  const article = await prisma.article.findUniqueOrThrow({ where: { id: articleId } });
  const versionId = article.currentVersionId;
  if (!versionId) throw new Error("Article has no content yet");
  const existing = await prisma.privateLink.findFirst({
    where: { articleId, articleVersionId: versionId, revokedAt: null },
  });
  const base = process.env.APP_BASE_URL ?? "http://localhost:3000";
  if (existing) {
    // Reconstruct the URL only if we still know the token — we store only hashes,
    // so rotate instead: mark a new link when we can't recover the token.
    // To keep this simple the URL is shown once at creation; creating a fresh
    // link is always safe and cheap.
  }
  const token = newToken();
  await prisma.privateLink.create({
    data: {
      tokenHash: hashToken(token),
      articleId,
      articleVersionId: versionId,
      createdById: userId ?? null,
    },
  });
  return `${base}/a/${token}`;
}

export async function revokePrivateLink(linkId: string) {
  const user = await requireUser();
  const link = await prisma.privateLink.update({ where: { id: linkId }, data: { revokedAt: new Date() } });
  await logActivity({ actorId: user.id, action: "link.revoked", entityType: "privateLink", entityId: linkId });
  revalidatePath(`/articles/${link.articleId}`);
}
