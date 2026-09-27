"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { enqueueJob } from "@/lib/jobs";
import { logActivity } from "@/lib/activity";
import { normalizeDomain, normalizeUrl } from "@/lib/utils";
import type { SalesStage } from "@/generated/prisma/enums";

export async function createBusiness(formData: FormData) {
  const user = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  const website = String(formData.get("website") ?? "").trim();
  if (!name) throw new Error("Name is required");
  const domain = website ? normalizeDomain(website) : null;

  if (domain) {
    const existing = await prisma.business.findUnique({ where: { domain } });
    if (existing) redirect(`/prospects/${existing.id}?duplicate=1`);
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
      categories: String(formData.get("categories") ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      source: "manual",
    },
  });
  if (String(formData.get("email") ?? "")) {
    await prisma.contact.create({
      data: {
        businessId: business.id,
        email: String(formData.get("email")),
        isPrimary: true,
        source: "manual",
        permissionBasis: "inferred_business",
      },
    });
  }
  await logActivity({ actorId: user.id, action: "business.create", entityType: "business", entityId: business.id });
  redirect(`/prospects/${business.id}`);
}

export async function updateBusiness(businessId: string, formData: FormData) {
  const user = await requireUser();
  const website = String(formData.get("website") ?? "").trim();
  await prisma.business.update({
    where: { id: businessId },
    data: {
      name: String(formData.get("name") ?? "").trim() || undefined,
      website: website ? normalizeUrl(website) : null,
      domain: website ? normalizeDomain(website) : null,
      phone: String(formData.get("phone") ?? "") || null,
      email: String(formData.get("email") ?? "") || null,
      suburb: String(formData.get("suburb") ?? "") || null,
      city: String(formData.get("city") ?? "") || null,
      state: String(formData.get("state") ?? "") || null,
      categories: String(formData.get("categories") ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      profile: formData.get("profile")
        ? (JSON.parse(String(formData.get("profile"))) as object)
        : undefined,
    },
  });
  await logActivity({ actorId: user.id, action: "business.update", entityType: "business", entityId: businessId });
  revalidatePath(`/prospects/${businessId}`);
}

export async function setSalesStage(businessId: string, formData: FormData) {
  const user = await requireUser();
  const stage = String(formData.get("stage") ?? "") as SalesStage;
  if (!stage) return;
  await prisma.business.update({ where: { id: businessId }, data: { salesStage: stage } });
  await logActivity({ actorId: user.id, action: "business.stage_change", entityType: "business", entityId: businessId, meta: { stage } });
  revalidatePath(`/prospects/${businessId}`);
}

export async function setNextAction(businessId: string, formData: FormData) {
  const user = await requireUser();
  const at = String(formData.get("nextActionAt") ?? "");
  await prisma.business.update({
    where: { id: businessId },
    data: {
      nextAction: String(formData.get("nextAction") ?? "") || null,
      nextActionAt: at ? new Date(at) : null,
      assignedToId: String(formData.get("assignedToId") ?? "") || null,
    },
  });
  await logActivity({ actorId: user.id, action: "business.next_action", entityType: "business", entityId: businessId });
  revalidatePath(`/prospects/${businessId}`);
}

export async function addNote(businessId: string, formData: FormData) {
  const user = await requireUser();
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return;
  await prisma.businessNote.create({ data: { businessId, authorId: user.id, body } });
  revalidatePath(`/prospects/${businessId}`);
}

export async function addContact(businessId: string, formData: FormData) {
  const user = await requireUser();
  const email = String(formData.get("email") ?? "").trim() || null;
  const phone = String(formData.get("phone") ?? "").trim() || null;
  if (!email && !phone) throw new Error("Contact needs an email or phone");
  await prisma.contact.create({
    data: {
      businessId,
      name: String(formData.get("name") ?? "") || null,
      role: String(formData.get("role") ?? "") || null,
      email,
      phone,
      source: String(formData.get("source") ?? "manual"),
      permissionBasis: String(formData.get("permissionBasis") ?? "inferred_business"),
    },
  });
  await logActivity({ actorId: user.id, action: "contact.create", entityType: "business", entityId: businessId });
  revalidatePath(`/prospects/${businessId}`);
}

/** Queue inspection + rank check for a business. */
export async function qualifyBusiness(businessId: string, formData: FormData) {
  const user = await requireUser();
  const business = await prisma.business.findUniqueOrThrow({ where: { id: businessId } });
  if (business.website) {
    await enqueueJob("inspect_website", { businessId }, { idempotencyKey: `inspect:${businessId}:${Date.now()}` });
  }
  const keyword = String(formData.get("keyword") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim() ||
    (business.city ? `${business.city}, Australia` : "");
  if (keyword && location && business.domain) {
    await enqueueJob("rank_check", { businessId, keyword, location }, { idempotencyKey: `rank:${businessId}:${keyword}:${location}:${Date.now()}` });
  }
  await prisma.business.update({ where: { id: businessId }, data: { qualificationStatus: "QUEUED" } });
  await logActivity({ actorId: user.id, action: "business.qualify_queued", entityType: "business", entityId: businessId });
  revalidatePath(`/prospects/${businessId}`);
}

export async function startDiscoveryRun(formData: FormData) {
  const user = await requireUser();
  const category = String(formData.get("category") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  if (!category || !city) throw new Error("Category and city are required");
  const run = await prisma.discoveryRun.create({
    data: { category, city, source: "dataforseo_maps+organic", keyword: `${category} ${city}`, createdById: user.id },
  });
  await enqueueJob("discovery_run", { runId: run.id }, { idempotencyKey: `discovery:${run.id}` });
  redirect(`/prospects/discover/${run.id}`);
}

export async function importDiscoveryHit(hitId: string) {
  const user = await requireUser();
  const hit = await prisma.discoveryHit.findUniqueOrThrow({ where: { id: hitId } });
  const domain = hit.domain ?? (hit.website ? normalizeDomain(hit.website) : null);

  if (domain) {
    const existing = await prisma.business.findUnique({ where: { domain } });
    if (existing) {
      await prisma.discoveryHit.update({
        where: { id: hitId },
        data: { status: "duplicate", businessId: existing.id },
      });
      redirect(`/prospects/${existing.id}`);
    }
  }
  const run = await prisma.discoveryRun.findUnique({ where: { id: hit.runId } });
  const business = await prisma.business.create({
    data: {
      name: hit.name,
      website: hit.website ? normalizeUrl(hit.website) : null,
      domain,
      phone: hit.phone,
      address: hit.address,
      suburb: hit.suburb,
      city: run?.city ?? null,
      categories: run?.category ? [run.category] : [],
      source: `discovery:${hit.runId}`,
    },
  });
  await prisma.discoveryHit.update({
    where: { id: hitId },
    data: { status: "imported", businessId: business.id },
  });
  await logActivity({ actorId: user.id, action: "business.imported", entityType: "business", entityId: business.id, meta: { hitId } });
  revalidatePath(`/prospects/discover/${hit.runId}`);
}

export async function rejectDiscoveryHit(hitId: string) {
  await requireUser();
  const hit = await prisma.discoveryHit.update({ where: { id: hitId }, data: { status: "rejected" } });
  revalidatePath(`/prospects/discover/${hit.runId}`);
}
