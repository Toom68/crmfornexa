import { prisma } from "./db";
import { supabaseServer } from "./supabase/server";

/**
 * Current session user or null — for server components/actions.
 * The Supabase auth identity is mapped onto (and lazily creates) the app's
 * User row that business data references (sentBy, assignee, activity…).
 */
export async function currentUser() {
  const supabase = await supabaseServer();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser?.email) return null;

  const byAuth = await prisma.user.findUnique({ where: { authUserId: authUser.id } });
  if (byAuth) return byAuth;

  // Adopt a pre-provisioned row with the same email, else create one.
  const name =
    (authUser.user_metadata?.name as string | undefined) ?? authUser.email.split("@")[0];
  return prisma.user.upsert({
    where: { email: authUser.email },
    update: { authUserId: authUser.id },
    create: { authUserId: authUser.id, email: authUser.email, name },
  });
}

export async function requireUser() {
  const user = await currentUser();
  if (!user) throw new Error("unauthenticated");
  return user;
}
