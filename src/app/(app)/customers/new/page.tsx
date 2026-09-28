import Link from "next/link";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { createCustomer } from "@/lib/actions/customer";
import { formatMoney } from "@/lib/billing";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function NewCustomerPage() {
  const packages = await prisma.articlePackage.findMany({
    where: { isActive: true },
    orderBy: { priceCents: "asc" },
  });

  return (
    <div>
      <PageHeader
        title="Add a customer"
        description={
          <Link href="/customers" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="mr-1 inline h-3.5 w-3.5" />Back to customers
          </Link>
        }
      />
      <div className="mx-auto max-w-2xl px-8 py-8">
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium">Their details</CardTitle></CardHeader>
          <CardContent>
            <form action={createCustomer} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs text-muted-foreground">Business name *</Label>
                  <Input name="name" required placeholder="e.g. Harbour Kitchens" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Website</Label>
                  <Input name="website" placeholder="harbourkitchens.com.au" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Contact name</Label>
                  <Input name="contactName" placeholder="e.g. Sam" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Email</Label>
                  <Input name="email" type="email" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Phone</Label>
                  <Input name="phone" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Suburb</Label>
                  <Input name="suburb" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">City</Label>
                    <Input name="city" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">State</Label>
                    <Input name="state" placeholder="VIC" />
                  </div>
                </div>
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs text-muted-foreground">Categories</Label>
                  <Input name="categories" placeholder="kitchen renovation, bathroom renovation" />
                </div>
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs text-muted-foreground">Package</Label>
                  <Select
                    name="packageId"
                    defaultValue="adhoc"
                    items={{
                      adhoc: "Ad-hoc (no monthly package)",
                      ...Object.fromEntries(packages.map((p) => [p.id, `${p.name} — ${formatMoney(p.priceCents)}/mo · ${p.articlesPerMonth} articles`])),
                    }}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="adhoc">Ad-hoc (no monthly package)</SelectItem>
                      {packages.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name} — {formatMoney(p.priceCents)}/mo · {p.articlesPerMonth} articles
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button type="submit" className="w-full">Add customer</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
