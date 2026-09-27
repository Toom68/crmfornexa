import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashToken } from "@/lib/crypto";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await prisma.privateLink.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { article: true },
  });
  const base = process.env.APP_BASE_URL ?? "http://localhost:3000";
  if (!link || link.revokedAt || (link.expiresAt && link.expiresAt < new Date())) {
    return new NextResponse("Link expired", { status: 404 });
  }
  const form = await req.formData();
  const body = String(form.get("body") ?? "").trim();
  const name = String(form.get("name") ?? "").trim() || null;
  if (body) {
    await prisma.feedback.create({
      data: {
        privateLinkId: link.id,
        articleVersionId: link.articleVersionId,
        contactName: name,
        body,
      },
    });
    await prisma.business.update({
      where: { id: link.article.businessId },
      data: { nextAction: "Client left feedback on an article", nextActionAt: new Date() },
    });
    await prisma.article.update({
      where: { id: link.articleId },
      data: { stage: "REVISIONS" },
    });
  }
  return NextResponse.redirect(`${base}/a/${token}?feedback=thanks`, 303);
}
