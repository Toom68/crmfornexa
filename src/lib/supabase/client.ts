"use client";

import { createBrowserClient } from "@supabase/ssr";

/** Supabase client for browser code — session lives in cookies shared with the server. */
export function supabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
