import { PageHeader } from "@/components/page-header";
import { PackageForm } from "../package-form";
import { createPackage } from "@/lib/actions/packages";

export default function NewPackagePage() {
  return (
    <div>
      <PageHeader title="New package" />
      <div className="max-w-2xl p-8">
        <PackageForm action={createPackage} />
      </div>
    </div>
  );
}
