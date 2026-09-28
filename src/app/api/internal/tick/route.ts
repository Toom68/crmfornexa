import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { tick, enqueueJob } from "@/lib/jobs";
import "@/lib/jobs-register";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorised(req: Request): boolean {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) return false;
  return req.headers.get("x-internal-secret") === secret;
}

export async function POST(req: Request) {
  if (!authorised(req)) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  // Bootstrap the hourly customer scan if it isn't already scheduled.
  const scanQueued = await prisma.job.findFirst({
    where: { type: "customer_scan", status: { in: ["PENDING", "RUNNING"] } },
  });
  if (!scanQueued) {
    await enqueueJob("customer_scan", {}, { idempotencyKey: `customer_scan:${Date.now()}`, maxAttempts: 2 });
  }
  const summary = await tick(45_000);
  return NextResponse.json({ ok: true, ...summary });
}

// Allow a GET ping for uptime checks without running work.
export async function GET(req: Request) {
  if (!authorised(req)) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  return NextResponse.json({ ok: true });
}
