import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { hashToken } from "@/lib/crypto";
import { CopyArticleButton } from "./copy-button";

export const dynamic = "force-dynamic";

async function resolveLink(token: string) {
  const link = await prisma.privateLink.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      articleVersion: true,
      article: { include: { business: { select: { name: true } } } },
    },
  });
  if (!link || link.revokedAt || (link.expiresAt && link.expiresAt < new Date())) return null;
  // track views (best-effort)
  prisma.privateLink
    .update({ where: { id: link.id }, data: { viewCount: { increment: 1 }, lastViewedAt: new Date() } })
    .catch(() => undefined);
  return link;
}

export default async function PrivateArticlePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ feedback?: string }>;
}) {
  const { token } = await params;
  const { feedback } = await searchParams;
  const link = await resolveLink(token);
  if (!link) notFound();

  const v = link.articleVersion;
  const meta = (v.meta ?? {}) as { metaDescription?: string };

  return (
    <div className="min-h-screen bg-[#fafaf8]">
      <div className="mx-auto max-w-2xl px-6 py-12">
        <header className="mb-10 border-b pb-6">
          <p className="text-xs font-medium uppercase tracking-widest text-stone-500">
            Prepared for {link.article.business.name}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-stone-900">{v.title}</h1>
          {meta.metaDescription && <p className="mt-2 text-sm text-stone-500">{meta.metaDescription}</p>}
        </header>

        <article
          className="prose prose-stone max-w-none text-[15px] leading-7"
          dangerouslySetInnerHTML={{ __html: v.contentHtml }}
        />

        <footer className="mt-12 space-y-4 border-t pt-6">
          <div className="flex flex-wrap gap-2">
            <CopyArticleButton html={v.contentHtml} />
            <a
              href={`/a/${token}/download?format=docx`}
              className="rounded-md bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-700"
            >
              Download Word (.docx)
            </a>
            <a
              href={`/a/${token}/download?format=html`}
              className="rounded-md border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-100"
            >
              Download HTML
            </a>
          </div>

          {feedback === "thanks" ? (
            <p className="rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-800">
              Thanks — your feedback has been sent to the team.
            </p>
          ) : (
            <form method="POST" action={`/a/${token}/feedback`} className="space-y-2">
              <label className="block text-sm font-medium text-stone-700">
                Feedback for the team <span className="font-normal text-stone-400">(optional)</span>
              </label>
              <input name="name" placeholder="Your name" className="w-full rounded-md border border-stone-300 px-3 py-1.5 text-sm" />
              <textarea
                name="body"
                rows={3}
                placeholder="Anything you'd like changed or added…"
                className="w-full rounded-md border border-stone-300 px-3 py-1.5 text-sm"
              />
              <button type="submit" className="rounded-md border border-stone-300 px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-100">
                Send feedback
              </button>
            </form>
          )}
          <p className="text-xs text-stone-400">This is a private link — please don&apos;t share it publicly.</p>
        </footer>
      </div>
    </div>
  );
}
