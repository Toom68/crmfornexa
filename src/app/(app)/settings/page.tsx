import Link from "next/link";
import { prisma } from "@/lib/db";
import { getAllSettings, setSetting } from "@/lib/settings";
import { requireUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { gmailConfigured } from "@/lib/providers/gmail";
import { dataforseoConfigured } from "@/lib/providers/dataforseo";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

export const dynamic = "force-dynamic";

async function saveSettings(formData: FormData) {
  "use server";
  await requireUser();
  const updates: Record<string, unknown> = {
    "business.name": String(formData.get("business.name") ?? ""),
    "business.fromName": String(formData.get("business.fromName") ?? ""),
    "outreach.senderSignature": String(formData.get("outreach.senderSignature") ?? ""),
    "followup.hours": Number(formData.get("followup.hours") ?? 24),
    "prospecting.inactiveBlogDays": Number(formData.get("prospecting.inactiveBlogDays") ?? 90),
    "prospecting.rankTopN": Number(formData.get("prospecting.rankTopN") ?? 10),
    "prospecting.rankDepth": Number(formData.get("prospecting.rankDepth") ?? 50),
    "prospecting.categories": String(formData.get("prospecting.categories") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    "prospecting.cities": String(formData.get("prospecting.cities") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    "billing.abn": String(formData.get("billing.abn") ?? ""),
    "billing.bsb": String(formData.get("billing.bsb") ?? ""),
    "billing.accountNumber": String(formData.get("billing.accountNumber") ?? ""),
    "billing.accountName": String(formData.get("billing.accountName") ?? ""),
    "billing.paymentInstructions": String(formData.get("billing.paymentInstructions") ?? ""),
    "billing.taxRateBps": Math.round(Number(formData.get("billing.taxRatePercent") ?? 10) * 100),
    "billing.invoiceDueDays": Number(formData.get("billing.invoiceDueDays") ?? 14),
    "billing.adhocArticlePriceCents": Math.round(Number(formData.get("billing.adhocArticlePriceDollars") ?? 350) * 100),
  };
  for (const [k, v] of Object.entries(updates)) await setSetting(k, v);
  revalidatePath("/settings");
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ gmail?: string }>;
}) {
  const { gmail: gmailStatus } = await searchParams;
  const [s, gmailAccount, users, jobStats] = await Promise.all([
    getAllSettings(),
    prisma.emailAccount.findFirst({ where: { provider: "gmail", status: "active" } }),
    prisma.user.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.job.groupBy({ by: ["status"], _count: true }),
  ]);

  return (
    <div>
      <PageHeader title="Settings" description="Business rules, integrations and team" />
      <div className="grid max-w-5xl gap-6 p-8 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium">Business & rules</CardTitle></CardHeader>
          <CardContent>
            <form action={saveSettings} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label className="text-xs">Business name</Label><Input name="business.name" defaultValue={String(s["business.name"])} /></div>
                <div className="space-y-1.5"><Label className="text-xs">From name</Label><Input name="business.fromName" defaultValue={String(s["business.fromName"])} /></div>
              </div>
              <div className="space-y-1.5"><Label className="text-xs">Sender signature</Label><Input name="outreach.senderSignature" defaultValue={String(s["outreach.senderSignature"])} /></div>
              <Separator />
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5"><Label className="text-xs">Follow-up after (hours)</Label><Input name="followup.hours" type="number" defaultValue={String(s["followup.hours"])} /></div>
                <div className="space-y-1.5"><Label className="text-xs">Blog inactive ≥ days</Label><Input name="prospecting.inactiveBlogDays" type="number" defaultValue={String(s["prospecting.inactiveBlogDays"])} /></div>
                <div className="space-y-1.5"><Label className="text-xs">Weak = outside top N</Label><Input name="prospecting.rankTopN" type="number" defaultValue={String(s["prospecting.rankTopN"])} /></div>
              </div>
              <div className="space-y-1.5"><Label className="text-xs">Rank check depth (results)</Label><Input name="prospecting.rankDepth" type="number" defaultValue={String(s["prospecting.rankDepth"])} /></div>
              <div className="space-y-1.5"><Label className="text-xs">Service categories</Label><Input name="prospecting.categories" defaultValue={(s["prospecting.categories"] as string[]).join(", ")} /></div>
              <div className="space-y-1.5"><Label className="text-xs">Cities</Label><Input name="prospecting.cities" defaultValue={(s["prospecting.cities"] as string[]).join(", ")} /></div>
              <Separator />
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5"><Label className="text-xs">GST rate (%)</Label><Input name="billing.taxRatePercent" type="number" step="0.1" min="0" defaultValue={String(Number(s["billing.taxRateBps"]) / 100)} /></div>
                <div className="space-y-1.5"><Label className="text-xs">Invoice due after (days)</Label><Input name="billing.invoiceDueDays" type="number" defaultValue={String(s["billing.invoiceDueDays"])} /></div>
                <div className="space-y-1.5"><Label className="text-xs">Ad-hoc article price ($)</Label><Input name="billing.adhocArticlePriceDollars" type="number" step="0.01" min="0" defaultValue={(Number(s["billing.adhocArticlePriceCents"]) / 100).toFixed(2)} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label className="text-xs">ABN (on invoices)</Label><Input name="billing.abn" defaultValue={String(s["billing.abn"])} /></div>
                <div className="space-y-1.5"><Label className="text-xs">Account name</Label><Input name="billing.accountName" defaultValue={String(s["billing.accountName"])} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label className="text-xs">BSB</Label><Input name="billing.bsb" defaultValue={String(s["billing.bsb"])} placeholder="062-000" /></div>
                <div className="space-y-1.5"><Label className="text-xs">Account number</Label><Input name="billing.accountNumber" defaultValue={String(s["billing.accountNumber"])} /></div>
              </div>
              <div className="space-y-1.5"><Label className="text-xs">Payment instructions (shown on invoices)</Label><Input name="billing.paymentInstructions" defaultValue={String(s["billing.paymentInstructions"])} /></div>
              <Button type="submit">Save settings</Button>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-sm font-medium">Integrations</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              {gmailStatus?.startsWith("error") && (
                <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
                  Gmail connection failed: {decodeURIComponent(gmailStatus.slice(6))}
                </p>
              )}
              {gmailStatus === "connected" && (
                <p className="rounded-md border border-green-300 bg-green-50 p-2 text-xs text-green-800">Gmail connected.</p>
              )}
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <p className="font-medium">Gmail (shared inbox)</p>
                  <p className="text-xs text-muted-foreground">
                    {gmailAccount ? `Connected: ${gmailAccount.email}` : gmailConfigured() ? "Credentials set — not connected yet" : "Set GOOGLE_CLIENT_ID/SECRET in .env"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {gmailAccount && <Badge>connected</Badge>}
                  <Button size="sm" variant="outline" disabled={!gmailConfigured()} render={<a href="/api/integrations/gmail/connect" />}>
                    {gmailAccount ? "Reconnect" : "Connect"}
                  </Button>
                </div>
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <p className="font-medium">DataForSEO (discovery & rank checks)</p>
                  <p className="text-xs text-muted-foreground">{dataforseoConfigured() ? "Configured" : "Set DATAFORSEO_LOGIN/PASSWORD in .env"}</p>
                </div>
                {dataforseoConfigured() && <Badge>ready</Badge>}
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <p className="font-medium">SMS</p>
                  <p className="text-xs text-muted-foreground">provider: {String(s["sms.provider"])} — inbound replies need a dedicated number pointed at /api/webhooks/sms</p>
                </div>
                <Badge variant="secondary">{process.env.SMS_PROVIDER === "twilio" || process.env.SMS_PROVIDER === "clicksend" ? "ready" : "simulated"}</Badge>
              </div>
              <div className="rounded-md border p-3">
                <p className="font-medium">n8n (article production)</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Self-hosted via docker compose. n8n polls <code>/api/n8n/jobs/next</code> and posts to <code>/api/n8n/callback</code>.
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Jobs:{" "}
                  {jobStats.map((j) => `${j.status.toLowerCase()} ${j._count}`).join(" · ") || "none"}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-sm font-medium">Packages</CardTitle>
              <Button size="sm" variant="outline" render={<Link href="/settings/packages" />}>Manage</Button>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Monthly article packages — quantities and prices are fully customisable.
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-sm font-medium">Message templates</CardTitle>
              <Button size="sm" variant="outline" render={<Link href="/settings/templates" />}>Manage</Button>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Email and SMS templates with merge fields — used in the message composer on each prospect.
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm font-medium">Team</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {users.map((u) => (
                <div key={u.id} className="flex items-center justify-between rounded-md border p-2.5">
                  <div>
                    <p className="font-medium">{u.name}</p>
                    <p className="text-xs text-muted-foreground">{u.email}</p>
                  </div>
                  <Badge variant="secondary">full access</Badge>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">
                Everyone has full access. New teammates create an account on the{" "}
                <Link href="/login" className="text-primary hover:underline">login page</Link>.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
