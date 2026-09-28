import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { PackageForm } from "../package-form";
import { updatePackage, setPackageActive } from "@/lib/actions/packages";
import { formatMoney } from "@/lib/billing";

export const dynamic = "force-dynamic";

export default async function EditPackagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pkg = await prisma.articlePackage.findUnique({
    where: { id },
    include: { _count: { select: { subscriptions: { where: { status: "ACTIVE" } } } } },
  });
  if (!pkg) notFound();

  return (
    <div>
      <PageHeader
        title="Edit package"
        description={`${formatMoney(pkg.priceCents, pkg.currency)} / month${pkg._count.subscriptions > 0 ? ` · used by ${pkg._count.subscriptions} active customer${pkg._count.subscriptions === 1 ? "" : "s"}` : ""}`}
        actions={
          <form action={setPackageActive.bind(null, pkg.id, !pkg.isActive)}>
            <Button type="submit" variant="outline">{pkg.isActive ? "Deactivate" : "Reactivate"}</Button>
          </form>
        }
      />
      <div className="max-w-2xl p-8">
        <PackageForm
          action={updatePackage.bind(null, pkg.id)}
          defaults={{
            name: pkg.name,
            articlesPerMonth: pkg.articlesPerMonth,
            priceCents: pkg.priceCents,
            description: pkg.description,
          }}
        />
      </div>
    </div>
  );
}
