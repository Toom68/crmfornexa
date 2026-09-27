"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useState } from "react";

export function TemplateForm({
  action,
  defaults,
}: {
  action: (formData: FormData) => Promise<void>;
  defaults?: { name: string; channel: string; subject: string | null; body: string };
}) {
  const [channel, setChannel] = useState(defaults?.channel ?? "EMAIL");
  return (
    <Card>
      <CardContent className="pt-6">
        <form action={action} className="space-y-4">
          <input type="hidden" name="channel" value={channel} />
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input name="name" defaultValue={defaults?.name} required />
          </div>
          <div className="space-y-1.5">
            <Label>Channel</Label>
            <Select value={channel} onValueChange={(v) => setChannel(v ?? "EMAIL")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="EMAIL">Email</SelectItem>
                <SelectItem value="SMS">SMS</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {channel === "EMAIL" && (
            <div className="space-y-1.5">
              <Label>Subject</Label>
              <Input name="subject" defaultValue={defaults?.subject ?? ""} />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Body</Label>
            <Textarea name="body" rows={10} defaultValue={defaults?.body} required />
          </div>
          <Button type="submit">Save template</Button>
        </form>
      </CardContent>
    </Card>
  );
}
