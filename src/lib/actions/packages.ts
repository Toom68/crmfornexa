"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { logActivity } from "@/lib/activity";

function readForm(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const articlesPerMonth = Number(formData.get("articlesPerMonth") ?? 0);
  const priceDollars = Number(formData.get("priceDollars") ?? 0);
  const description = String(formData.get("description") ?? "").trim();
  if (!name) throw new Error("Package name is required");
  if (!Number.isFinite(articlesPerMonth) || articlesPerMonth < 1) throw new Error("Articles per month must be at least 1");
  if (!Number.isFinite(priceDollars) || priceDollars < 0) throw new Error("Price must be zero or more");
  return {
    name,
    articlesPerMonth: Math.round(articlesPerMonth),
    priceCents: Math.round(priceDollars * 100),
    description: description || null,
  };
}

export async function createPackage(formData: FormData) {
  const user = await requireUser();
  const pkg = await prisma.articlePackage.create({ data: readForm(formData) });
  await logActivity({ actorId: user.id, action: "package.create", entityType: "package", entityId: pkg.id });
  revalidatePath("/settings/packages");
  redirect(`/settings/packages/${pkg.id}`);
}

export async function updatePackage(packageId: string, formData: FormData) {
  const user = await requireUser();
  await prisma.articlePackage.update({ where: { id: packageId }, data: readForm(formData) });
  await logActivity({ actorId: user.id, action: "package.update", entityType: "package", entityId: packageId });
  revalidatePath("/settings/packages");
  revalidatePath(`/settings/packages/${packageId}`);
}

export async function setPackageActive(packageId: string, active: boolean) {
  await requireUser();
  await prisma.articlePackage.update({ where: { id: packageId }, data: { isActive: active } });
  revalidatePath("/settings/packages");
  revalidatePath(`/settings/packages/${packageId}`);
}
