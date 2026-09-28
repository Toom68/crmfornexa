import Link from "next/link";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArticleStageBadge } from "@/components/stage-badge";
import { formatRelative } from "@/lib/utils";
import type { ArticleStage } from "@/generated/prisma/enums";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const STAGES: { value: ArticleStage; label: string }[] = [
  { value: "TOPIC_APPROVED", label: "Writing" },
  { value: "HUMAN_EDIT", label: "My edit" },
  { value: "CLIENT_REVIEW", label: "Client review" },
  { value: "APPROVED", label: "Ready" },
  { value: "DELIVERED", label: "Delivered" },
];

export default async function ArticlesPage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string }>;
}) {
  const { stage } = await searchParams;
  const stageFilter = stage && stage !== "all" ? (stage as ArticleStage) : undefined;
  const includeStages = stageFilter
    ? [stageFilter]
    : ["TOPIC_APPROVED", "RESEARCH", "DRAFT", "HUMAN_EDIT", "CLIENT_REVIEW", "REVISIONS", "APPROVED", "DELIVERED"] as ArticleStage[];

  const [articles, allCounts] = await Promise.all([
    prisma.article.findMany({
      where: { stage: { in: includeStages } },
      orderBy: { updatedAt: "desc" },
      take: 200,
      include: {
        business: true,
        versions: { orderBy: { version: "desc" }, take: 1 },
        links: { where: { revokedAt: null } },
      },
    }),
    prisma.article.groupBy({ by: ["stage"], _count: true }),
  ]);
  const countFor = (s: ArticleStage) => allCounts.find((c) => c.stage === s)?._count ?? 0;
  const totalCount = allCounts.reduce((n, c) => n + c._count, 0);

  return (
    <div>
      <PageHeader title="Articles" description="Free articles in the works, and those already delivered" />
      <div className="p-8">
        <div className="mb-5 flex flex-wrap gap-1.5">
          <StageChip href="/articles" active={!stageFilter} label="All" count={totalCount} />
          {STAGES.map((s) => (
            <StageChip
              key={s.value}
              href={`/articles?stage=${s.value}`}
              active={stageFilter === s.value}
              label={s.label}
              count={countFor(s.value)}
            />
          ))}
        </div>

        {articles.length === 0 ? (
          <div className="rounded-xl border bg-card px-8 py-14 text-center">
            <h2 className="font-heading text-xl font-semibold">No articles here yet</h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              Articles start when you approve a topic on a prospect — every free article
              you send lives here with its versions and private links.
            </p>
            <Button className="mt-6" variant="outline" render={<Link href="/prospects" />}>
              Pick a prospect to start with<ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border bg-card">
            {articles.map((a) => (
              <Link
                key={a.id}
                href={`/articles/${a.id}`}
                className="group flex items-center gap-4 border-b px-5 py-4 transition-colors last:border-b-0 hover:bg-accent/50"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{a.title}</span>
                    {a.isFreeOffer && <Badge variant="outline">free</Badge>}
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {a.business.name} · v{a.versions[0]?.version ?? 0}
                    {a.links.length > 0 ? ` · ${a.links.length} live link${a.links.length === 1 ? "" : "s"}` : ""}
                  </p>
                </div>
                <ArticleStageBadge stage={a.stage} />
                <span className="hidden w-20 shrink-0 text-right text-xs text-muted-foreground sm:block">
                  {formatRelative(a.updatedAt)}
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StageChip({
  href,
  active,
  label,
  count,
}: {
  href: string;
  active: boolean;
  label: string;
  count: number;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
      )}
    >
      {label}
      <span className={cn("text-[11px]", active ? "text-primary-foreground/80" : "text-muted-foreground/70")}>
        {count}
      </span>
    </Link>
  );
}
