import Link from "next/link";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const templates = await prisma.messageTemplate.findMany({ orderBy: [{ channel: "asc" }, { name: "asc" }] });
  return (
    <div>
      <PageHeader
        title="Message templates"
        description="Merge fields: {{business_name}} {{contact_name}} {{article_title}} {{article_link}} {{sender_name}} {{unsubscribe_url}}"
        actions={<Button render={<Link href="/settings/templates/new" />}><Plus className="mr-2 h-4 w-4" />New template</Button>}
      />
      <div className="grid max-w-4xl gap-3 p-8">
        {templates.map((t) => (
          <Link key={t.id} href={`/settings/templates/${t.id}`}>
            <Card className="hover:bg-accent/50">
              <CardContent className="flex items-center justify-between py-4">
                <div>
                  <p className="font-medium">{t.name}</p>
                  {t.subject && <p className="text-sm text-muted-foreground">{t.subject}</p>}
                </div>
                <div className="flex items-center gap-2">
                  {t.isBuiltIn && <Badge variant="secondary">built-in</Badge>}
                  <Badge variant="outline">{t.channel.toLowerCase()}</Badge>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
