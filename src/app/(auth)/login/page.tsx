import { LoginForm } from "./login-form";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  // If there are no users yet this is a first run — show create-account copy.
  const userCount = await prisma.user.count();
  return (
    <div className="flex min-h-screen items-center justify-center bg-accent/40 p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-primary font-heading text-lg font-bold text-primary-foreground">
            N
          </div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Nexa</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {userCount === 0 ? "Create the first account to get started" : "Welcome back"}
          </p>
        </div>
        <LoginForm firstRun={userCount === 0} />
      </div>
    </div>
  );
}
