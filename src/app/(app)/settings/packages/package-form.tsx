import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function PackageForm({
  action,
  defaults,
}: {
  action: (formData: FormData) => Promise<void>;
  defaults?: { name: string; articlesPerMonth: number; priceCents: number; description: string | null };
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <form action={action} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Package name</Label>
            <Input id="name" name="name" defaultValue={defaults?.name} placeholder="Growth — 4 articles/month" required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="articlesPerMonth">Articles per month</Label>
              <Input
                id="articlesPerMonth"
                name="articlesPerMonth"
                type="number"
                min={1}
                step={1}
                defaultValue={defaults?.articlesPerMonth ?? 4}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="priceDollars">Price per month ($)</Label>
              <Input
                id="priceDollars"
                name="priceDollars"
                type="number"
                min={0}
                step="0.01"
                defaultValue={defaults ? (defaults.priceCents / 100).toFixed(2) : "1600.00"}
                required
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              name="description"
              rows={3}
              defaultValue={defaults?.description ?? ""}
              placeholder="What the customer gets — shown on quotes."
            />
          </div>
          <Button type="submit">{defaults ? "Save package" : "Create package"}</Button>
        </form>
      </CardContent>
    </Card>
  );
}
