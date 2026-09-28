import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Landing point for Supabase email links (signup confirmation, password
 * reset, magic link). Supabase appends ?code= to the Site URL — exchange
 * it for a session cookie, then continue.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next");

  if (code) {
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const target = next?.startsWith("/") ? next : "/today";
      return NextResponse.redirect(new URL(target, url.origin));
    }
  }
  return NextResponse.redirect(new URL("/login?error=confirm", url.origin));
}
