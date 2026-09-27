import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashToken } from "@/lib/crypto";
import { htmlToDocx, htmlToStandalonePage } from "@/lib/docx";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const format = new URL(req.url).searchParams.get("format") ?? "docx";
  const link = await prisma.privateLink.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { articleVersion: true },
  });
  if (!link || link.revokedAt || (link.expiresAt && link.expiresAt < new Date())) {
    return new NextResponse("Link expired", { status: 404 });
  }
  const v = link.articleVersion;
  const safeName = v.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60) || "article";

  if (format === "html") {
    const page = htmlToStandalonePage(v.title, v.contentHtml);
    return new NextResponse(page, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename="${safeName}.html"`,
      },
    });
  }
  const buf = await htmlToDocx(v.title, v.contentHtml);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${safeName}.docx"`,
    },
  });
}
