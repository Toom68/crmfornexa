import Link from "next/link";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { SalesStageBadge, QualBadge, SampleBadge } from "@/components/stage-badge";
import { formatRelative } from "@/lib/utils";
import type { SalesStage, QualificationStatus } from "@/generated/prisma/enums";
import { Plus, Radar } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ProspectsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; stage?: string; qual?: string }>;
}) {
  const { q, stage, qual } = await searchParams;
  const businesses = await prisma.business.findMany({
    where: {
      name: q ? { contains: q, mode: "insensitive" } : undefined,
      salesStage: stage ? (stage as SalesStage) : undefined,
      qualificationStatus: qual ? (qual as QualificationStatus) : undefined,
    },
    orderBy: [{ qualificationScore: "desc" }, { updatedAt: "desc" }],
    take: 200,
    include: { assignedTo: true, _count: { select: { articles: true, messages: true } } },
  });

  return (
    <div>
      <PageHeader
        title="Prospects"
        description="Businesses you're researching or talking to"
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
        <form className="mb-4 flex gap-2" action="/prospects" method="get">
          <Input name="q" placeholder="Search name…" defaultValue={q} className="max-w-xs" />
          <Select name="stage" defaultValue={stage ?? "all"}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All stages</SelectItem>
              {["NEW_PROSPECT","PREPARING_OUTREACH","CONTACTED","INTERESTED","PROPOSAL","WON","LOST","DO_NOT_CONTACT"].map((s) => (
                <SelectItem key={s} value={s}>{s.replaceAll("_", " ").toLowerCase()}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select name="qual" defaultValue={qual ?? "all"}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All quality</SelectItem>
              {["STRONG","MODERATE","LOW","UNCHECKED","QUEUED","DISQUALIFIED"].map((s) => (
                <SelectItem key={s} value={s}>{s.replaceAll("_", " ").toLowerCase()}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="submit" variant="secondary">Filter</Button>
        </form>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Business</TableHead>
                <TableHead>City</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Match</TableHead>
                <TableHead>Next action</TableHead>
                <TableHead>Owner</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {businesses.map((b) => (
                <TableRow key={b.id}>
                  <TableCell>
                    <Link href={`/prospects/${b.id}`} className="font-medium hover:underline">
                      {b.name}
                    </Link>
                    {b.isSample && <span className="ml-2"><SampleBadge /></span>}
                    <div className="text-xs text-muted-foreground">{b.domain}</div>
                  </TableCell>
                  <TableCell className="text-sm">{b.city ?? "—"}</TableCell>
                  <TableCell><SalesStageBadge stage={b.salesStage} /></TableCell>
                  <TableCell><QualBadge status={b.qualificationStatus} /></TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {b.nextAction ? `${b.nextAction} · ${formatRelative(b.nextActionAt)}` : "—"}
                  </TableCell>
                  <TableCell className="text-sm">{b.assignedTo?.name ?? "—"}</TableCell>
                </TableRow>
              ))}
              {businesses.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                    No prospects yet — run a discovery or add a business manually.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
