import { prisma } from "./db";
import type { Job } from "@/generated/prisma/client";

export type JobContext = { job: Job; payload: Record<string, unknown> };
export type JobResult = { costCents?: number; note?: string; result?: unknown } | void;
export type JobHandler = (ctx: JobContext) => Promise<JobResult>;

const handlers = new Map<string, JobHandler>();

export function registerJobHandler(type: string, handler: JobHandler) {
  handlers.set(type, handler);
}

/** Job types executed by n8n (pulled via /api/n8n/jobs/next), not by the tick. */
export const N8N_JOB_TYPES = ["n8n_profile", "n8n_topics", "n8n_research", "n8n_draft"] as const;

export async function enqueueJob(
  type: string,
  payload: Record<string, unknown>,
  opts: { runAt?: Date; idempotencyKey?: string; maxAttempts?: number } = {},
) {
  if (opts.idempotencyKey) {
    const existing = await prisma.job.findUnique({ where: { idempotencyKey: opts.idempotencyKey } });
    if (existing) return existing;
  }
  return prisma.job.create({
    data: {
      type,
      payload: payload as object,
      runAt: opts.runAt ?? new Date(),
      idempotencyKey: opts.idempotencyKey,
      maxAttempts: opts.maxAttempts ?? 3,
    },
  });
}

/** Claim + execute due jobs until `budgetMs` elapses or the queue is empty. */
export async function tick(budgetMs = 45_000): Promise<{ ran: number; remaining: number }> {
  const started = Date.now();
  let ran = 0;
  while (Date.now() - started < budgetMs) {
    const job = await prisma.job.findFirst({
      where: {
        status: "PENDING",
        runAt: { lte: new Date() },
        NOT: { type: { in: [...N8N_JOB_TYPES] } },
      },
      orderBy: { runAt: "asc" },
    });
    if (!job) break;
    const claimed = await prisma.job.updateMany({
      where: { id: job.id, status: "PENDING" },
      data: { status: "RUNNING", lockedAt: new Date(), attempts: { increment: 1 } },
    });
    if (claimed.count === 0) continue;
    await runJob({ ...job, status: "RUNNING" as const });
    ran++;
  }
  const remaining = await prisma.job.count({
    where: { status: "PENDING", runAt: { lte: new Date() }, NOT: { type: { in: [...N8N_JOB_TYPES] } } },
  });
  return { ran, remaining };
}

async function runJob(job: Job) {
  const handler = handlers.get(job.type);
  if (!handler) {
    await prisma.job.update({
      where: { id: job.id },
      data: { status: "FAILED", error: `No handler registered for job type "${job.type}"` },
    });
    return;
  }
  try {
    const out = await handler({ job, payload: (job.payload ?? {}) as Record<string, unknown> });
    await prisma.job.update({
      where: { id: job.id },
      data: {
        status: "SUCCEEDED",
        progress: 100,
        progressNote: out?.note,
        result: (out?.result as object) ?? undefined,
        costCents: { increment: out?.costCents ?? 0 },
        error: null,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const attemptsLeft = job.attempts + 1 < job.maxAttempts;
    await prisma.job.update({
      where: { id: job.id },
      data: {
        // backoff: 2^attempts minutes
        status: attemptsLeft ? "PENDING" : "FAILED",
        runAt: attemptsLeft ? new Date(Date.now() + Math.pow(2, job.attempts + 1) * 60_000) : job.runAt,
        error: message,
        progressNote: attemptsLeft ? `Retrying: ${message}` : job.progressNote,
      },
    });
  }
}

/** Called by n8n's poller — hands out the oldest pending n8n job and marks it running. */
export async function nextN8nJob() {
  const job = await prisma.job.findFirst({
    where: { status: "PENDING", type: { in: [...N8N_JOB_TYPES] } },
    orderBy: { createdAt: "asc" },
  });
  if (!job) return null;
  const claimed = await prisma.job.updateMany({
    where: { id: job.id, status: "PENDING" },
    data: { status: "RUNNING", lockedAt: new Date(), attempts: { increment: 1 } },
  });
  if (claimed.count === 0) return null;
  return prisma.job.findUnique({ where: { id: job.id } });
}

/**
 * Applies an n8n result. The callback never overwrites human edits —
 * article outputs always create a NEW ArticleVersion.
 */
export async function completeN8nJob(
  jobId: string,
  outcome: { ok: boolean; result?: unknown; error?: string; costCents?: number },
) {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) throw new Error("job not found");
  if (!outcome.ok) {
    const attemptsLeft = job.attempts < job.maxAttempts;
    await prisma.job.update({
      where: { id: job.id },
      data: {
        status: attemptsLeft ? "PENDING" : "FAILED",
        runAt: attemptsLeft ? new Date(Date.now() + Math.pow(2, job.attempts) * 60_000) : job.runAt,
        error: outcome.error ?? "n8n reported failure",
      },
    });
    return { applied: false };
  }
  const apply = n8nResultAppliers[job.type];
  if (apply) await apply(job, outcome.result);
  await prisma.job.update({
    where: { id: job.id },
    data: {
      status: "SUCCEEDED",
      progress: 100,
      result: (outcome.result as object) ?? undefined,
      costCents: { increment: outcome.costCents ?? 0 },
      error: null,
    },
  });
  return { applied: true };
}

/** Result appliers registered by feature modules (n8n callbacks). */
type N8nApplier = (job: Job, result: unknown) => Promise<void>;
const n8nResultAppliers: Record<string, N8nApplier> = {};
export function registerN8nApplier(type: string, applier: N8nApplier) {
  n8nResultAppliers[type] = applier;
}
