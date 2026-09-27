import { NextResponse } from "next/server";
import { gmailAuthUrl, gmailConfigured } from "@/lib/providers/gmail";
import { currentUser } from "@/lib/auth";
import crypto from "crypto";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.redirect(new URL("/login", process.env.APP_BASE_URL ?? "http://localhost:3000"));
  if (!gmailConfigured()) {
    return NextResponse.json(
      { error: "Set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_OAUTH_REDIRECT_URI in .env first" },
      { status: 400 },
    );
  }
  const state = crypto.randomBytes(16).toString("hex");
  const url = gmailAuthUrl(state);
  if (!url) return NextResponse.json({ error: "OAuth client unavailable" }, { status: 500 });
  return NextResponse.redirect(url);
}
