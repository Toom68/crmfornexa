import { PageHeader } from "@/components/page-header";
import { TemplateForm } from "../template-form";
import { saveTemplate } from "@/lib/actions/templates";

export default function NewTemplatePage() {
  return (
    <div>
      <PageHeader title="New template" />
      <div className="max-w-2xl p-8">
        <TemplateForm action={saveTemplate.bind(null, null)} />
      </div>
    </div>
  );
}
