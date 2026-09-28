"use client";

import { useState } from "react";
import { updateBusiness } from "@/lib/actions/business";
import { generateProfile } from "@/lib/actions/article";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles } from "lucide-react";

interface Profile {
  summary?: string;
  services?: string[];
  serviceAreas?: string[];
  differentiators?: string[];
  notesForWriter?: string;
}

export function ProfileEditor({
  businessId,
  profile,
  siteSummary,
}: {
  businessId: string;
  profile: Record<string, unknown> | null;
  siteSummary: string | null;
}) {
  const p = (profile ?? {}) as Profile;
  const [summary, setSummary] = useState(p.summary ?? siteSummary ?? "");
  const [services, setServices] = useState((p.services ?? []).join(", "));
  const [areas, setAreas] = useState((p.serviceAreas ?? []).join(", "));
  const [diffs, setDiffs] = useState((p.differentiators ?? []).join(", "));
  const [notes, setNotes] = useState(p.notesForWriter ?? "");

  async function save() {
    const profileJson = JSON.stringify({
      summary, services: splitList(services), serviceAreas: splitList(areas),
      differentiators: splitList(diffs), notesForWriter: notes,
    });
    const fd = new FormData();
    fd.set("profile", profileJson);
    await updateBusiness(businessId, fd);
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium">Business profile</CardTitle>
        <form action={generateProfile.bind(null, businessId)}>
          <Button type="submit" size="sm" variant="secondary"><Sparkles className="mr-1.5 h-3.5 w-3.5" />Generate from website</Button>
        </form>
      </CardHeader>
      <CardContent className="space-y-3">
        {!profile && (
          <p className="text-xs text-muted-foreground">
            No profile yet — generate one from the website (uses AI once the site is inspected) or fill this in manually.
          </p>
        )}
        <div className="space-y-1.5">
          <Label className="text-xs">Summary</Label>
          <Textarea rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Services</Label>
            <Input value={services} onChange={(e) => setServices(e.target.value)} placeholder="comma separated" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Service areas</Label>
            <Input value={areas} onChange={(e) => setAreas(e.target.value)} placeholder="comma separated" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Differentiators</Label>
          <Input value={diffs} onChange={(e) => setDiffs(e.target.value)} placeholder="comma separated" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Notes for the writer</Label>
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <Button size="sm" variant="secondary" onClick={save}>Save profile</Button>
      </CardContent>
    </Card>
  );
}

function splitList(s: string): string[] {
  return s.split(",").map((x) => x.trim()).filter(Boolean);
}
