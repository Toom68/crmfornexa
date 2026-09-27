import { prisma } from "./db";

export async function logActivity(opts: {
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  meta?: unknown;
}) {
  await prisma.activityLog.create({
    data: {
      actorId: opts.actorId ?? null,
      action: opts.action,
      entityType: opts.entityType,
      entityId: opts.entityId,
      meta: (opts.meta as object) ?? undefined,
    },
  });
}
