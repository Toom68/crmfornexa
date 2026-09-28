import Link from "next/link";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { formatMoney } from "@/lib/billing";

export const dynamic = "force-dynamic";

export default async function PackagesPage() {
  const packages = await prisma.articlePackage.findMany({
    orderBy: { priceCents: "asc" },
    include: { _count: { select: { subscriptions: { where: { status: "ACTIVE" } } } } },
  });
  return (
    <div>
      <PageHeader
        title="Packages"
        description="What you sell — monthly article packages with customisable prices and quantities"
        actions={<Button render={<Link href="/settings/packages/new" />}><Plus className="mr-2 h-4 w-4" />New package</Button>}
      />
      <div className="grid max-w-4xl gap-3 p-8">
        {packages.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No packages yet — create your first one to start selling monthly plans.
            </CardContent>
          </Card>
        )}
        {packages.map((p) => (
          <Link key={p.id} href={`/settings/packages/${p.id}`}>
            <Card className="hover:bg-accent/50">
              <CardContent className="flex items-center justify-between py-4">
                <div>
                  <p className="font-medium">{p.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {p.articlesPerMonth} article{p.articlesPerMonth === 1 ? "" : "s"} / month · {formatMoney(p.priceCents, p.currency)} / month
                    {p._count.subscriptions > 0 ? ` · ${p._count.subscriptions} active customer${p._count.subscriptions === 1 ? "" : "s"}` : ""}
                  </p>
                </div>
                {!p.isActive && <Badge variant="secondary">inactive</Badge>}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
