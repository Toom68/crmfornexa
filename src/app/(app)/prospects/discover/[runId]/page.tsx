import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { importDiscoveryHit, rejectDiscoveryHit } from "@/lib/actions/business";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function DiscoveryRunPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  const run = await prisma.discoveryRun.findUnique({
    where: { id: runId },
    include: { hits: { orderBy: { createdAt: "asc" } }, _count: { select: { hits: true } } },
  });
  if (!run) notFound();

  const newHits = run.hits.filter((h) => h.status === "new");
  const done = run.hits.filter((h) => h.status !== "new");

  return (
    <div>
      <PageHeader
        title={`${run.category} · ${run.city}`}
        description={`Discovered ${formatDateTime(run.createdAt)} — ${run.status}, ${run._count.hits} candidates. Import the ones worth qualifying.`}
      />
      <div className="p-8">
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Business</TableHead>
                <TableHead>Website</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Found at</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...newHits, ...done].map((h) => (
                <TableRow key={h.id} className={h.status !== "new" ? "opacity-60" : ""}>
                  <TableCell className="font-medium">{h.name}</TableCell>
                  <TableCell className="text-sm">
                    {h.website ? (
                      <a href={h.website} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                        {h.domain ?? h.website}
                      </a>
                    ) : "—"}
                  </TableCell>
                  <TableCell className="text-sm">{h.phone ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {h.sourcePosition ? `organic #${h.sourcePosition}` : "maps"}
                  </TableCell>
                  <TableCell>
                    {h.status === "imported" && h.businessId ? (
                      <Link href={`/prospects/${h.businessId}`} className="text-sm text-primary hover:underline">
                        imported →
                      </Link>
                    ) : (
                      <Badge variant="secondary">{h.status}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {h.status === "new" && (
                      <div className="flex justify-end gap-2">
                        <form action={importDiscoveryHit.bind(null, h.id)}>
                          <Button size="sm" variant="default">Import</Button>
                        </form>
                        <form action={rejectDiscoveryHit.bind(null, h.id)}>
                          <Button size="sm" variant="ghost">Skip</Button>
                        </form>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
