import { NextResponse } from "next/server";
import { completeN8nJob } from "@/lib/jobs";
import "@/lib/jobs-register";

export const dynamic = "force-dynamic";

function authorised(req: Request): boolean {
  const secret = process.env.CRM_N8N_SECRET;
  return Boolean(secret) && req.headers.get("x-n8n-secret") === secret;
}

/** n8n posts results here: { jobId, ok, result?, error?, costCents? } */
export async function POST(req: Request) {
  if (!authorised(req)) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const body = (await req.json()) as {
    jobId?: string;
    ok?: boolean;
    result?: unknown;
    error?: string;
    costCents?: number;
  };
  if (!body.jobId) return NextResponse.json({ error: "jobId required" }, { status: 400 });
  try {
    const out = await completeN8nJob(body.jobId, {
      ok: body.ok ?? false,
      result: body.result,
      error: body.error,
      costCents: body.costCents,
    });
    return NextResponse.json(out);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "failed" }, { status: 500 });
  }
}
