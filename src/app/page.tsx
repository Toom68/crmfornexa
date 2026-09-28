import { redirect } from "next/navigation";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; next?: string }>;
}) {
  // Supabase email links land wherever Site URL points — if it's the root,
  // forward the code to the callback handler that exchanges it.
  const { code, next } = await searchParams;
  if (code) redirect(`/auth/callback?code=${encodeURIComponent(code)}${next ? `&next=${encodeURIComponent(next)}` : ""}`);
  redirect("/today");
}
