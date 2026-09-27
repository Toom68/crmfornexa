import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

function normaliseAU(mobile: string): string {
  const digits = mobile.replace(/[^\d+]/g, "");
  if (digits.startsWith("+61")) return "0" + digits.slice(3);
  if (digits.startsWith("61")) return "0" + digits.slice(2);
  return digits;
}

/**
 * Inbound SMS webhook — accepts Twilio (From/Body) and ClickSend-style payloads.
 * Configure the provider's inbound URL to POST here.
 */
export async function POST(req: Request) {
  let from = "";
  let body = "";
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const form = await req.formData();
    from = String(form.get("From") ?? form.get("from") ?? "");
    body = String(form.get("Body") ?? form.get("body") ?? "");
  } else {
    const json = (await req.json().catch(() => ({}))) as Record<string, string>;
    // ClickSend sends { from, body, ... } (possibly wrapped)
    const inner = (json as { sms?: Record<string, string> }).sms ?? json;
    from = inner.from ?? inner.mobilenumber ?? "";
    body = inner.body ?? inner.message ?? "";
  }
  if (!from || !body) return NextResponse.json({ ok: false }, { status: 400 });

  const local = normaliseAU(from);
  const candidates = [from, local, `+61${local.slice(1)}`];
  const contact = await prisma.contact.findFirst({
    where: { OR: candidates.map((p) => ({ phone: { contains: p.slice(-8) } })) },
  });
  const business = contact ? await prisma.business.findUnique({ where: { id: contact.businessId } }) : null;

  // STOP opt-out — honour regardless of matching a record
  if (/^\s*(stop|unsubscribe|optout|opt out)\b/i.test(body) && contact) {
    await prisma.contact.update({
      where: { id: contact.id },
      data: { optedOut: true, optedOutAt: new Date() },
    });
  }

  if (!business) return NextResponse.json({ ok: true, matched: false });

  await prisma.message.create({
    data: {
      businessId: business.id,
      contactId: contact?.id ?? null,
      channel: "SMS",
      direction: "INBOUND",
      status: "RECEIVED",
      bodyText: body,
      provider: process.env.SMS_PROVIDER ?? "unknown",
    },
  });
  await prisma.business.update({
    where: { id: business.id },
    data: { nextAction: "SMS reply received — choose the next step", nextActionAt: new Date() },
  });
  return NextResponse.json({ ok: true, matched: true });
}
