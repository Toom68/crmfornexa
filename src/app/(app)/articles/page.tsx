import Link from "next/link";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ArticleStageBadge } from "@/components/stage-badge";
import { formatRelative } from "@/lib/utils";
import type { ArticleStage } from "@/generated/prisma/enums";

export const dynamic = "force-dynamic";

const STAGES: ArticleStage[] = [
  "TOPIC_PROPOSED","TOPIC_APPROVED","RESEARCH","DRAFT","HUMAN_EDIT","CLIENT_REVIEW","REVISIONS","APPROVED","DELIVERED",
];

export default async function ArticlesPage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string }>;
}) {
  const { stage } = await searchParams;
  const articles = await prisma.article.findMany({
    where: { stage: stage ? (stage as ArticleStage) : undefined },
    orderBy: { updatedAt: "desc" },
    take: 200,
    include: {
      business: true,
      topic: true,
      versions: { orderBy: { version: "desc" }, take: 1 },
      links: { where: { revokedAt: null } },
    },
  });

  return (
    <div>
      <PageHeader
        title="Articles"
        description="Topic approval through to delivery"
        actions={
          <form className="flex gap-2" action="/articles" method="get">
            <Select name="stage" defaultValue={stage ?? "all"}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All stages</SelectItem>
                {STAGES.map((s) => <SelectItem key={s} value={s}>{s.replaceAll("_", " ").toLowerCase()}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button type="submit" variant="secondary">Filter</Button>
          </form>
        }
      />
      <div className="p-8">
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Business</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Link</TableHead>
                <TableHead>Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {articles.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>
                    <Link href={`/articles/${a.id}`} className="font-medium hover:underline">{a.title}</Link>
                    {a.isFreeOffer && <Badge variant="outline" className="ml-2">free</Badge>}
                  </TableCell>
                  <TableCell>
                    <Link href={`/prospects/${a.businessId}`} className="text-sm text-muted-foreground hover:underline">
                      {a.business.name}
                    </Link>
                  </TableCell>
                  <TableCell><ArticleStageBadge stage={a.stage} /></TableCell>
                  <TableCell className="text-sm">v{a.versions[0]?.version ?? 0}</TableCell>
                  <TableCell className="text-sm">{a.links.length > 0 ? `${a.links.length} active` : "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatRelative(a.updatedAt)}</TableCell>
                </TableRow>
              ))}
              {articles.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                    No articles yet — approve a topic on a prospect to start one.
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
