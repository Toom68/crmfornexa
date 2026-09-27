import { prisma } from "./db";
import {
  registerJobHandler,
  registerN8nApplier,
  enqueueJob,
  type JobContext,
} from "./jobs";
import { inspectWebsite } from "./inspect";
import { scoreProspect } from "./qualify";
import { getSetting } from "./settings";
import { dataforseoConfigured, domainPosition, googleMapsSearch, googleOrganic } from "./providers/dataforseo";
import { pollGmail, type ParsedInbound } from "./providers/gmail";
import { sendEmail } from "./providers/email";
import { sendSms } from "./providers/sms";
import { normalizeDomain } from "./utils";
import type { InspectionStatus } from "@/generated/prisma/enums";

// ---------------------------------------------------------------- inspection

registerJobHandler("inspect_website", async ({ payload }: JobContext) => {
  const business = await prisma.business.findUniqueOrThrow({ where: { id: payload.businessId as string } });
  if (!business.website) throw new Error("Business has no website");
  const result = await inspectWebsite(business.website);
  const inactiveDays = await getSetting<number>("prospecting.inactiveBlogDays");

  let status: InspectionStatus;
  if (!result.ok) status = "FETCH_FAILED";
  else if (!result.blogUrl && result.postDates.length === 0) status = "NO_BLOG";
  else if (result.postDates.length === 0) status = "UNKNOWN_LAST_POST";
  else {
    const days = (Date.now() - result.postDates[0].getTime()) / 86_400_000;
    status = days >= inactiveDays ? "INACTIVE_BLOG" : "ACTIVE_BLOG";
  }

  await prisma.websiteInspection.create({
    data: {
      businessId: business.id,
      status,
      blogUrl: result.blogUrl,
      lastPostAt: result.postDates[0] ?? null,
      lastPostSource: result.lastPostSource,
      siteTitle: result.siteTitle,
      siteSummary: result.siteSummary,
      evidence: result.evidence as object,
      error: result.error,
    },
  });
  await requalify(business.id);
});

// ---------------------------------------------------------------- rank check

registerJobHandler("rank_check", async ({ payload }: JobContext) => {
  const business = await prisma.business.findUniqueOrThrow({ where: { id: payload.businessId as string } });
  if (!business.domain) throw new Error("Business has no domain to check");
  if (!dataforseoConfigured()) throw new Error("DataForSEO is not configured — add credentials in .env");

  const depth = await getSetting<number>("prospecting.rankDepth");
  const keyword = payload.keyword as string;
  const location = payload.location as string;
  const device = (payload.device as string) ?? "desktop";

  const serp = await googleOrganic({ keyword, locationName: location, device: device as "desktop" | "mobile", depth });
  const { position, topUrls, organicCount } = domainPosition(serp.items, business.domain);

  await prisma.rankingObservation.create({
    data: {
      businessId: business.id,
      keyword,
      location,
      device,
      source: "dataforseo",
      status: position ? "FOUND" : "NOT_FOUND_IN_DEPTH",
      position,
      depth,
      serpSnapshot: { topUrls, organicCount, checkedDepth: depth } as object,
    },
  });
  await requalify(business.id);
  return { costCents: Math.ceil(depth / 10) }; // ~1 unit per page-equivalent for the cost ledger
});

async function requalify(businessId: string) {
  const [inspection, rank] = await Promise.all([
    prisma.websiteInspection.findFirst({ where: { businessId }, orderBy: { inspectedAt: "desc" } }),
    prisma.rankingObservation.findFirst({ where: { businessId }, orderBy: { checkedAt: "desc" } }),
  ]);
  const [inactiveBlogDays, rankTopN] = await Promise.all([
    getSetting<number>("prospecting.inactiveBlogDays"),
    getSetting<number>("prospecting.rankTopN"),
  ]);
  const { score, status, reasons } = scoreProspect({
    rankStatus: rank?.status,
    position: rank?.position,
    rankTopN,
    inspectionStatus: inspection?.status,
    lastPostAt: inspection?.lastPostAt,
    inactiveBlogDays,
  });
  await prisma.business.update({
    where: { id: businessId },
    data: { qualificationScore: score, qualificationStatus: status, qualificationSummary: reasons.join(" · ") },
  });
}

// ---------------------------------------------------------------- discovery

registerJobHandler("discovery_run", async ({ payload }: JobContext) => {
  const run = await prisma.discoveryRun.findUniqueOrThrow({ where: { id: payload.runId as string } });
  if (!dataforseoConfigured()) throw new Error("DataForSEO is not configured — add credentials in .env");

  const keyword = `${run.category} ${run.city}`;
  const locationName = `${run.city}, Australia`;
  let count = 0;

  // Source 1: Google Maps/local listings (discovery only — never a rank signal)
  const maps = await googleMapsSearch({ keyword, locationName, depth: 60 });
  for (const item of maps) {
    if (!item.title) continue;
    await prisma.discoveryHit.create({
      data: {
        runId: run.id,
        name: item.title,
        website: item.url ?? null,
        domain: item.url ? normalizeDomain(item.url) : null,
        phone: item.phone ?? null,
        address: item.address ?? null,
        raw: item as object,
      },
    });
    count++;
  }

  // Source 2: deep organic results — catches businesses that rank but poorly
  const serp = await googleOrganic({ keyword, locationName, depth: 50 });
  for (const item of serp.items.filter((i) => i.type === "organic" && i.url)) {
    const domain = item.domain ? normalizeDomain(item.domain) : normalizeDomain(item.url!);
    if (!domain) continue;
    const dupe = await prisma.discoveryHit.findFirst({ where: { runId: run.id, domain } });
    if (dupe) continue;
    await prisma.discoveryHit.create({
      data: {
        runId: run.id,
        name: item.title ?? domain,
        website: item.url ?? null,
        domain,
        sourcePosition: item.rank_absolute,
        raw: item as object,
      },
    });
    count++;
  }

  await prisma.discoveryRun.update({
    where: { id: run.id },
    data: { status: "done", resultCount: count },
  });
  return { note: `${count} candidates discovered` };
});

// ---------------------------------------------------------------- messaging

registerJobHandler("send_message", async ({ payload }: JobContext) => {
  const message = await prisma.message.findUniqueOrThrow({
    where: { id: payload.messageId as string },
    include: { contact: true, business: true },
  });
  if (message.status === "SENT" || message.status === "DELIVERED" || message.status === "SIMULATED") {
    return; // idempotent — never double-send
  }
  const to = message.channel === "EMAIL" ? message.contact?.email ?? message.business.email : message.contact?.phone ?? message.business.phone;
  if (!to) throw new Error("No destination address/number on contact or business");

  if (message.contact?.optedOut) throw new Error("Contact has opted out");

  let simulated = false;
  let providerMessageId = "";
  let providerThreadId: string | undefined;
  let rfcMessageId: string | undefined;
  let provider = "";

  if (message.channel === "EMAIL") {
    const res = await sendEmail({
      to,
      subject: message.subject ?? "",
      text: message.bodyText,
      html: message.bodyHtml ?? undefined,
      inReplyTo: message.inReplyTo ?? undefined,
    });
    simulated = res.simulated;
    providerMessageId = res.providerMessageId;
    providerThreadId = res.threadId;
    rfcMessageId = res.rfcMessageId;
    provider = simulated ? "simulated" : "gmail";
  } else {
    const res = await sendSms(to, message.bodyText);
    simulated = res.simulated;
    providerMessageId = res.providerMessageId;
    provider = simulated ? "simulated" : (process.env.SMS_PROVIDER ?? "simulated");
  }

  await prisma.message.update({
    where: { id: message.id },
    data: {
      status: simulated ? "SIMULATED" : "SENT",
      sentAt: new Date(),
      provider,
      providerMessageId,
      providerThreadId,
      rfcMessageId,
    },
  });

  // Move the prospect forward and schedule the follow-up reminder.
  const followupHours = await getSetting<number>("followup.hours");
  const advance = message.direction === "OUTBOUND" && ["NEW_PROSPECT", "PREPARING_OUTREACH"].includes(message.business.salesStage);
  await prisma.business.update({
    where: { id: message.businessId },
    data: {
      salesStage: advance ? "CONTACTED" : message.business.salesStage,
      nextAction: "Follow up — no reply yet",
      nextActionAt: new Date(Date.now() + followupHours * 3_600_000),
    },
  });
  await prisma.activityLog.create({
    data: {
      actorId: message.sentById,
      action: simulated ? "message.simulated" : "message.sent",
      entityType: "message",
      entityId: message.id,
      meta: { businessId: message.businessId, channel: message.channel },
    },
  });
});

// ---------------------------------------------------------------- gmail poll

registerJobHandler("gmail_poll", async () => {
  const inbound = await pollGmail();
  let stored = 0;
  for (const msg of inbound) {
    if (await storeInboundEmail(msg)) stored++;
  }
  return { note: `${stored} new messages` };
});

export async function storeInboundEmail(msg: ParsedInbound): Promise<boolean> {
  // Dedup by provider message id
  const dupe = await prisma.message.findFirst({ where: { providerMessageId: msg.providerMessageId } });
  if (dupe) return false;

  const fromEmail = msg.from.toLowerCase();
  const contact = await prisma.contact.findFirst({ where: { email: { equals: fromEmail, mode: "insensitive" } } });
  let business = contact ? await prisma.business.findUnique({ where: { id: contact.businessId } }) : null;

  // Fall back to thread matching
  if (!business && msg.threadId) {
    const prev = await prisma.message.findFirst({ where: { providerThreadId: msg.threadId } });
    if (prev) business = await prisma.business.findUnique({ where: { id: prev.businessId } });
  }
  // Fall back to In-Reply-To
  if (!business && msg.inReplyTo) {
    const prev = await prisma.message.findFirst({ where: { rfcMessageId: msg.inReplyTo } });
    if (prev) business = await prisma.business.findUnique({ where: { id: prev.businessId } });
  }
  if (!business) return false; // unknown sender — not attached to any record, skip for now

  await prisma.message.create({
    data: {
      businessId: business.id,
      contactId: contact?.id ?? null,
      channel: "EMAIL",
      direction: "INBOUND",
      status: "RECEIVED",
      subject: msg.subject ?? null,
      bodyText: msg.text,
      bodyHtml: msg.html ?? null,
      provider: "gmail",
      providerMessageId: msg.providerMessageId,
      providerThreadId: msg.threadId ?? null,
      rfcMessageId: msg.rfcMessageId ?? null,
      inReplyTo: msg.inReplyTo ?? null,
      createdAt: msg.date ?? new Date(),
    },
  });
  await prisma.business.update({
    where: { id: business.id },
    data: {
      nextAction: "Reply received — choose the next step",
      nextActionAt: new Date(),
    },
  });
  return true;
}

// ---------------------------------------------------------------- n8n result appliers

registerN8nApplier("n8n_profile", async (job, result) => {
  const { businessId } = job.payload as { businessId: string };
  await prisma.business.update({
    where: { id: businessId },
    data: { profile: result as object },
  });
});

registerN8nApplier("n8n_topics", async (job, result) => {
  const { businessId } = job.payload as { businessId: string };
  const topics = (result as { topics?: { title: string; rationale?: string; intentNote?: string }[] })?.topics ?? [];
  for (const t of topics.slice(0, 5)) {
    if (!t.title) continue;
    await prisma.topic.create({
      data: { businessId, title: t.title, rationale: t.rationale, intentNote: t.intentNote, origin: "ai" },
    });
  }
});

registerN8nApplier("n8n_research", async (job, result) => {
  const { articleId, businessId } = job.payload as { articleId: string; businessId: string };
  await prisma.article.update({
    where: { id: articleId },
    data: { researchBrief: result as object, stage: "DRAFT" },
  });
  // Chain: research done → draft next. Idempotent per article draft run.
  await enqueueJob("n8n_draft", { businessId, articleId }, { idempotencyKey: `draft:${articleId}:${Date.now()}` });
});

registerN8nApplier("n8n_draft", async (job, result) => {
  const { articleId } = job.payload as { articleId: string };
  const article = await prisma.article.findUniqueOrThrow({
    where: { id: articleId },
    include: { versions: { orderBy: { version: "desc" }, take: 1 } },
  });
  const r = result as { title?: string; contentHtml?: string; meta?: unknown };
  const version = (article.versions[0]?.version ?? 0) + 1;
  // Always a NEW version — retries/regenerations never overwrite human edits.
  const v = await prisma.articleVersion.create({
    data: {
      articleId,
      version,
      title: r.title ?? article.title,
      contentHtml: r.contentHtml ?? "",
      meta: (r.meta as object) ?? undefined,
      origin: "AI_DRAFT",
    },
  });
  await prisma.article.update({
    where: { id: articleId },
    data: { stage: "HUMAN_EDIT", currentVersionId: v.id, title: r.title ?? article.title },
  });
});
