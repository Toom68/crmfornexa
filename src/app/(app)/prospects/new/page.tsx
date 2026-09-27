import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { createBusiness } from "@/lib/actions/business";

export default function NewProspectPage() {
  return (
    <div>
      <PageHeader title="Add a business" description="Paste a website or type the details manually" />
      <div className="max-w-2xl p-8">
        <Card>
          <CardContent className="pt-6">
            <form action={createBusiness} className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="name">Business name *</Label>
                <Input id="name" name="name" required />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="website">Website</Label>
                <Input id="website" name="website" placeholder="https://…" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" name="phone" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="suburb">Suburb</Label>
                <Input id="suburb" name="suburb" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="city">City</Label>
                <Input id="city" name="city" placeholder="Melbourne" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="state">State</Label>
                <Input id="state" name="state" placeholder="VIC" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="categories">Categories (comma separated)</Label>
                <Input id="categories" name="categories" placeholder="kitchen renovation, bathroom renovation" />
              </div>
              <div className="col-span-2">
                <Button type="submit">Create business</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
