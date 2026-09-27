import { NextResponse } from "next/server";
import { nextN8nJob } from "@/lib/jobs";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

function authorised(req: Request): boolean {
  const secret = process.env.CRM_N8N_SECRET;
  return Boolean(secret) && req.headers.get("x-n8n-secret") === secret;
}

/** n8n's poller workflow calls this to claim the next pending AI job. */
export async function GET(req: Request) {
  if (!authorised(req)) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const job = await nextN8nJob();
  if (!job) return NextResponse.json({ job: null });

  // Hydrate the payload with the business + article context n8n needs.
  const payload = (job.payload ?? {}) as Record<string, unknown>;
  const businessId = payload.businessId as string | undefined;
  let business = null;
  if (businessId) {
    business = await prisma.business.findUnique({
      where: { id: businessId },
      include: { contacts: true, inspections: { orderBy: { inspectedAt: "desc" }, take: 1 } },
    });
  }
  let article = null;
  if (payload.articleId) {
    article = await prisma.article.findUnique({
      where: { id: payload.articleId as string },
      include: { topic: true, versions: { orderBy: { version: "desc" }, take: 1 } },
    });
  }
  const settings = await prisma.setting.findMany();
  return NextResponse.json({
    job: { id: job.id, type: job.type, attempts: job.attempts },
    payload,
    context: { business, article, settings: Object.fromEntries(settings.map((s) => [s.key, s.value])) },
  });
}
