import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyUnsubscribeToken } from "@/lib/templates";

export const dynamic = "force-dynamic";

/** GET /unsubscribe?t=<token> — one-click email opt-out (Spam Act friendly). */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("t") ?? "";
  const contactId = verifyUnsubscribeToken(token);
  if (!contactId) {
    return new NextResponse(html("That unsubscribe link isn't valid."), {
      headers: { "Content-Type": "text/html" },
    });
  }
  const contact = await prisma.contact.findUnique({ where: { id: contactId } });
  if (contact && !contact.optedOut) {
    await prisma.contact.update({
      where: { id: contact.id },
      data: { optedOut: true, optedOutAt: new Date() },
    });
    await prisma.activityLog.create({
      data: {
        action: "contact.opted_out",
        entityType: "contact",
        entityId: contact.id,
        meta: { via: "unsubscribe_link" },
      },
    });
  }
  return new NextResponse(html("Done — you won't receive further messages from us."), {
    headers: { "Content-Type": "text/html" },
  });
}

function html(message: string) {
  return `<!doctype html><html><body style="font-family:system-ui;max-width:480px;margin:80px auto;text-align:center"><h2>${message}</h2><p style="color:#666">Nexa Content Studio</p></body></html>`;
}
