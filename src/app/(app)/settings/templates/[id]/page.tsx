import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { TemplateForm } from "../template-form";
import { saveTemplate, deleteTemplate } from "@/lib/actions/templates";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function TemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const template = await prisma.messageTemplate.findUnique({ where: { id } });
  if (!template) notFound();

  return (
    <div>
      <PageHeader
        title={template.name}
        description={`${template.channel.toLowerCase()} template`}
        actions={
          <form action={deleteTemplate.bind(null, template.id)}>
            <Button type="submit" variant="destructive" size="sm">Delete</Button>
          </form>
        }
      />
      <div className="max-w-2xl p-8">
        <TemplateForm
          action={saveTemplate.bind(null, template.id)}
          defaults={{ name: template.name, channel: template.channel, subject: template.subject, body: template.body }}
        />
      </div>
    </div>
  );
}
