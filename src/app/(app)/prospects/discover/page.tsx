import Link from "next/link";
import { prisma } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import { dataforseoConfigured } from "@/lib/providers/dataforseo";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { startDiscoveryRun } from "@/lib/actions/business";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function DiscoverPage() {
  const [categories, cities, runs, configured] = await Promise.all([
    getSetting<string[]>("prospecting.categories"),
    getSetting<string[]>("prospecting.cities"),
    prisma.discoveryRun.findMany({ orderBy: { createdAt: "desc" }, take: 20, include: { _count: { select: { hits: true } } } }),
    Promise.resolve(dataforseoConfigured()),
  ]);

  return (
    <div>
      <PageHeader title="Discover prospects" description="Find renovation businesses in a city, then check whether they're a fit" />
      <div className="grid max-w-4xl gap-6 p-8 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium">New search</CardTitle></CardHeader>
          <CardContent>
            {!configured && (
              <p className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
                DataForSEO isn&apos;t configured — add DATAFORSEO_LOGIN/PASSWORD to .env. You can still add businesses manually.
              </p>
            )}
            <form action={startDiscoveryRun} className="space-y-4">
              <div className="space-y-1.5">
                <Label>Service category</Label>
                <Select name="category" required>
                  <SelectTrigger><SelectValue placeholder="Pick a category" /></SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>City</Label>
                <Select name="city" required>
                  <SelectTrigger><SelectValue placeholder="Pick a city" /></SelectTrigger>
                  <SelectContent>
                    {cities.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" disabled={!configured}>Run discovery</Button>
            </form>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium">Recent runs</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {runs.length === 0 && <p className="text-sm text-muted-foreground">No runs yet.</p>}
            {runs.map((r) => (
              <Link key={r.id} href={`/prospects/discover/${r.id}`} className="block rounded-md border p-3 hover:bg-accent">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{r.category} · {r.city}</span>
                  <span className="text-xs text-muted-foreground">{formatDateTime(r.createdAt)}</span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {r.status} · {r._count.hits} candidates
                </p>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
