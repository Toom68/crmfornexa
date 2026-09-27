import { NextResponse } from "next/server";
import { connectGmail } from "@/lib/providers/gmail";
import { currentUser } from "@/lib/auth";
import { logActivity } from "@/lib/activity";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await currentUser();
  const base = process.env.APP_BASE_URL ?? "http://localhost:3000";
  if (!user) return NextResponse.redirect(new URL("/login", base));
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  if (error || !code) {
    return NextResponse.redirect(new URL(`/settings?gmail=error:${error ?? "no_code"}`, base));
  }
  try {
    const account = await connectGmail(code, user.id);
    await logActivity({ actorId: user.id, action: "gmail.connected", entityType: "emailAccount", entityId: account.id, meta: { email: account.email } });
    return NextResponse.redirect(new URL("/settings?gmail=connected", base));
  } catch (err) {
    const msg = encodeURIComponent(err instanceof Error ? err.message : "failed");
    return NextResponse.redirect(new URL(`/settings?gmail=error:${msg}`, base));
  }
}
