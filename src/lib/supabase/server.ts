import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/** Supabase client bound to the incoming request's cookies (server components / actions / route handlers). */
export async function supabaseServer() {
  const store = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return store.getAll();
        },
        setAll(list) {
          // Server components can't write cookies — the proxy refreshes
          // sessions on every request, so a failed set here is harmless.
          try {
            for (const { name, value, options } of list) store.set(name, value, options);
          } catch {}
        },
      },
    },
  );
}
