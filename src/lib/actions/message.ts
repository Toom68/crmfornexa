"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { enqueueJob } from "@/lib/jobs";
import { logActivity } from "@/lib/activity";
import { renderTemplate } from "@/lib/templates";
import { buildTemplateVars, queueMessage } from "@/lib/outbound";

/** Compose + queue a message. Sending is a reviewed, manual step — the job sends it. */
export async function sendMessage(businessId: string, formData: FormData) {
  const user = await requireUser();
  const channel = String(formData.get("channel") ?? "EMAIL") as "EMAIL" | "SMS";
  const contactId = String(formData.get("contactId") ?? "") || null;
  const templateId = String(formData.get("templateId") ?? "") || null;
  const vars = await buildTemplateVars(businessId, contactId, user.name);
  const subject = renderTemplate(String(formData.get("subject") ?? ""), vars);
  const body = renderTemplate(String(formData.get("body") ?? ""), vars);
  const message = await queueMessage({
    businessId,
    contactId,
    channel,
    subject,
    body,
    templateId,
    sentById: user.id,
  });

  // Only advance the pipeline on first contact — never move a contacted
  // prospect (or a customer) back to "preparing outreach".
  await prisma.business
    .updateMany({
      where: { id: businessId, salesStage: "NEW_PROSPECT" },
      data: { salesStage: "PREPARING_OUTREACH" },
    })
    .catch(() => undefined);

  await logActivity({ actorId: user.id, action: "message.queued", entityType: "message", entityId: message.id, meta: { businessId, channel } });
  revalidatePath(`/prospects/${businessId}`);
  revalidatePath("/inbox");
}

/** Enqueue an immediate poll — used by the "check inbox now" button and tests. */
export async function pollInboxNow() {
  const user = await requireUser();
  await enqueueJob("gmail_poll", {}, { idempotencyKey: `gmail_poll:${Date.now()}`, maxAttempts: 1 });
  await logActivity({ actorId: user.id, action: "inbox.poll", entityType: "system", entityId: "gmail" });
  revalidatePath("/inbox");
}
