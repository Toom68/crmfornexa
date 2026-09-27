"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import type { MessageChannel } from "@/generated/prisma/enums";

export async function saveTemplate(templateId: string | null, formData: FormData) {
  const user = await requireUser();
  const data = {
    name: String(formData.get("name") ?? "").trim(),
    channel: String(formData.get("channel") ?? "EMAIL") as MessageChannel,
    subject: String(formData.get("subject") ?? "") || null,
    body: String(formData.get("body") ?? ""),
  };
  if (!data.name || !data.body) throw new Error("Name and body are required");
  if (templateId) {
    await prisma.messageTemplate.update({ where: { id: templateId }, data });
    await logActivity({ actorId: user.id, action: "template.update", entityType: "messageTemplate", entityId: templateId });
  } else {
    const t = await prisma.messageTemplate.create({ data: { ...data, createdById: user.id } });
    await logActivity({ actorId: user.id, action: "template.create", entityType: "messageTemplate", entityId: t.id });
  }
  revalidatePath("/settings/templates");
}

export async function deleteTemplate(templateId: string) {
  const user = await requireUser();
  await prisma.messageTemplate.delete({ where: { id: templateId } }).catch(() => undefined);
  await logActivity({ actorId: user.id, action: "template.delete", entityType: "messageTemplate", entityId: templateId });
  revalidatePath("/settings/templates");
}
