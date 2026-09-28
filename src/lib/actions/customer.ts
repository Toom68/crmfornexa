"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { normalizeDomain, normalizeUrl } from "@/lib/utils";
import type { BillingPreference, SubscriptionStatus } from "@/generated/prisma/enums";

function packageIdFrom(formData: FormData): string {
  const raw = String(formData.get("packageId") ?? "").trim();
  return raw === "adhoc" ? "" : raw;
}

/** Convert a won prospect into a customer (optionally with a package subscription). */
export async function convertToCustomer(businessId: string, formData: FormData) {
  const user = await requireUser();
  const packageId = packageIdFrom(formData);
  const billingPreference = (String(formData.get("billingPreference") ?? "INVOICE_APPROVAL") as BillingPreference);

  // Validate the package before touching anything — ad-hoc means no subscription.
  const pkg = packageId
    ? await prisma.articlePackage.findUniqueOrThrow({ where: { id: packageId } })
    : null;

  const business = await prisma.business.update({
    where: { id: businessId },
    data: {
      isCustomer: true,
      customerSince: new Date(),
      ...(pkg
        ? { nextAction: "Plan their first month of content", nextActionAt: new Date(Date.now() + 3600_000) }
        : { nextAction: null, nextActionAt: null }), // ad-hoc — clear stale outreach follow-ups
    },
  });

  if (pkg) {
    await prisma.subscription.create({
      data: {
        businessId,
        packageId: pkg.id,
        status: "ACTIVE",
        billingPreference,
      },
    });
  }

  await logActivity({ actorId: user.id, action: "customer.convert", entityType: "business", entityId: businessId, meta: { packageId: packageId || "ad-hoc" } });
  revalidatePath(`/prospects/${businessId}`);
  revalidatePath("/customers");
  redirect(`/prospects/${business.id}?tab=plans`);
}

/** Add a subscription to an existing customer (or change their package). */
export async function subscribeCustomer(businessId: string, formData: FormData) {
  const user = await requireUser();
  const packageId = packageIdFrom(formData);
  if (!packageId) throw new Error("Pick a package");
  const billingPreference = (String(formData.get("billingPreference") ?? "INVOICE_APPROVAL") as BillingPreference);
  const pkg = await prisma.articlePackage.findUniqueOrThrow({ where: { id: packageId } });

  // one active subscription per business — replace it
  await prisma.subscription.updateMany({
    where: { businessId, status: "ACTIVE" },
    data: { status: "CANCELLED", endDate: new Date() },
  });
  await prisma.subscription.create({
    data: { businessId, packageId: pkg.id, status: "ACTIVE", billingPreference },
  });
  await prisma.business.update({ where: { id: businessId }, data: { isCustomer: true, customerSince: new Date() } });
  await logActivity({ actorId: user.id, action: "subscription.create", entityType: "business", entityId: businessId, meta: { packageId } });
  revalidatePath(`/prospects/${businessId}`);
  revalidatePath("/customers");
}

export async function setSubscriptionStatus(subscriptionId: string, status: SubscriptionStatus) {
  const user = await requireUser();
  const sub = await prisma.subscription.update({
    where: { id: subscriptionId },
    data: { status, endDate: status === "CANCELLED" || status === "PAUSED" ? new Date() : null },
  });
  await logActivity({ actorId: user.id, action: `subscription.${status.toLowerCase()}`, entityType: "business", entityId: sub.businessId });
  revalidatePath(`/prospects/${sub.businessId}`);
  revalidatePath("/customers");
}

/** Create a brand-new customer directly (never went through prospecting). */
export async function createCustomer(formData: FormData) {
  const user = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  const website = String(formData.get("website") ?? "").trim();
  if (!name) throw new Error("Name is required");
  const domain = website ? normalizeDomain(website) : null;
  const packageId = packageIdFrom(formData);

  if (domain) {
    const existing = await prisma.business.findUnique({ where: { domain } });
    if (existing) {
      // already known — just flag them as a customer
      await prisma.business.update({ where: { id: existing.id }, data: { isCustomer: true, customerSince: existing.customerSince ?? new Date() } });
      if (packageId) {
        await subscribeCustomer(existing.id, formData);
      }
      redirect(`/prospects/${existing.id}?tab=plans`);
    }
  }

  const business = await prisma.business.create({
    data: {
      name,
      website: website ? normalizeUrl(website) : null,
      domain,
      phone: String(formData.get("phone") ?? "") || null,
      email: String(formData.get("email") ?? "") || null,
      suburb: String(formData.get("suburb") ?? "") || null,
      city: String(formData.get("city") ?? "") || null,
      state: String(formData.get("state") ?? "") || null,
      categories: String(formData.get("categories") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
      source: "direct",
      isCustomer: true,
      customerSince: new Date(),
      salesStage: "WON",
      contacts: String(formData.get("email") ?? "")
        ? {
            create: {
              email: String(formData.get("email")),
              name: String(formData.get("contactName") ?? "") || null,
              isPrimary: true,
              source: "manual",
              permissionBasis: "inferred_business",
            },
          }
        : undefined,
    },
  });
  if (packageId) {
    await subscribeCustomer(business.id, formData);
  }
  await logActivity({ actorId: user.id, action: "customer.create", entityType: "business", entityId: business.id });
  revalidatePath("/customers");
  redirect(`/prospects/${business.id}?tab=plans`);
}
