import Link from "next/link";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SalesStageBadge, QualBadge } from "@/components/stage-badge";
import { formatRelative } from "@/lib/utils";
import { nextStepFor } from "@/lib/workflow";
import type { SalesStage } from "@/generated/prisma/enums";
import { Plus, Radar, Search, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const STAGES: { value: SalesStage; label: string }[] = [
  { value: "NEW_PROSPECT", label: "New" },
  { value: "PREPARING_OUTREACH", label: "Preparing" },
  { value: "CONTACTED", label: "Contacted" },
  { value: "INTERESTED", label: "Interested" },
  { value: "PROPOSAL", label: "Proposal" },
  { value: "WON", label: "Won" },
  { value: "LOST", label: "Lost" },
];

export default async function ProspectsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; stage?: string }>;
}) {
  const { q, stage } = await searchParams;
  const stageFilter = stage && stage !== "all" ? (stage as SalesStage) : undefined;

  const businesses = await prisma.business.findMany({
    where: {
      name: q ? { contains: q, mode: "insensitive" } : undefined,
      salesStage: stageFilter,
    },
    orderBy: { updatedAt: "desc" },
    take: 200,
    include: {
      assignedTo: { select: { name: true } },
      topics: { select: { id: true, status: true, title: true } },
      articles: { select: { id: true, topicId: true, stage: true, title: true, isFreeOffer: true, updatedAt: true } },
    },
  });
  const allCounts = await prisma.business.groupBy({ by: ["salesStage"], _count: true });
  const countFor = (s: SalesStage) => allCounts.find((c) => c.salesStage === s)?._count ?? 0;
  const totalCount = allCounts.reduce((n, c) => n + c._count, 0);

  const rows = businesses
    .map((b) => ({ b, step: nextStepFor(b) }))
    .sort((a, z) => a.step.rank - z.step.rank);

  const buildHref = (s?: string) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (s && s !== "all") params.set("stage", s);
    const qs = params.toString();
    return `/prospects${qs ? `?${qs}` : ""}`;
  };

  return (
    <div>
      <PageHeader
        title="Prospects"
        description="Renovation businesses you're researching or talking to"
        actions={
          <>
            <Button variant="outline" render={<Link href="/prospects/discover" />}>
              <Radar className="mr-2 h-4 w-4" />Discover
            </Button>
            <Button render={<Link href="/prospects/new" />}>
              <Plus className="mr-2 h-4 w-4" />Add business
            </Button>
          </>
        }
      />
      <div className="p-8">
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <form action="/prospects" method="get" className="relative">
            {stageFilter && <input type="hidden" name="stage" value={stageFilter} />}
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              name="q"
              defaultValue={q ?? ""}
              placeholder="Search by name…"
              className="w-64 pl-9"
            />
          </form>
          <div className="flex flex-wrap gap-1.5">
            <StageChip href={buildHref()} active={!stageFilter} label="All" count={totalCount} />
            {STAGES.map((s) => (
              <StageChip
                key={s.value}
                href={buildHref(s.value)}
                active={stageFilter === s.value}
                label={s.label}
                count={countFor(s.value)}
              />
            ))}
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="rounded-xl border bg-card px-8 py-14 text-center">
            <h2 className="font-heading text-xl font-semibold">
              {q || stageFilter ? "Nothing matches that" : "No prospects yet"}
            </h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              {q || stageFilter
                ? "Try a different search or clear the filters."
                : "Find renovation businesses automatically with Discover, or add one by hand."}
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <Button render={<Link href="/prospects/discover" />}>
                <Radar className="mr-2 h-4 w-4" />Discover businesses
              </Button>
              <Button variant="outline" render={<Link href="/prospects/new" />}>
                <Plus className="mr-2 h-4 w-4" />Add a business
              </Button>
            </div>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border bg-card">
            {rows.map(({ b, step }) => (
              <Link
                key={b.id}
                href={`/prospects/${b.id}`}
                className="group flex items-center gap-4 border-b px-5 py-4 transition-colors last:border-b-0 hover:bg-accent/50"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-medium">{b.name}</span>

                    <SalesStageBadge stage={b.salesStage} />
                    <QualBadge status={b.qualificationStatus} />
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    <span className="font-medium text-foreground/80">Next: </span>
                    {step.title}
                    {b.city ? ` · ${b.city}` : ""}
                  </p>
                </div>
                <div className="hidden shrink-0 text-right text-xs text-muted-foreground md:block">
                  {b.assignedTo ? <div className="font-medium text-foreground/70">{b.assignedTo.name}</div> : null}
                  <div>{formatRelative(b.nextActionAt && b.nextActionAt <= new Date() ? b.nextActionAt : b.updatedAt)}</div>
                </div>
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
