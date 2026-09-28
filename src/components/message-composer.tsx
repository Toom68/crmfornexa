"use client";

import { useState } from "react";
import { sendMessage } from "@/lib/actions/message";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

type Contact = { id: string; name: string | null; email: string | null; phone: string | null; optedOut: boolean };
type Template = { id: string; name: string; channel: string; subject: string | null; body: string };

export function MessageComposer({
  businessId,
  contacts,
  templates,
  hasReadyArticle,
}: {
  businessId: string;
  contacts: Contact[];
  templates: Template[];
  hasReadyArticle: boolean;
}) {
  const [channel, setChannel] = useState<"EMAIL" | "SMS">("EMAIL");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const usable = contacts.filter((c) => !c.optedOut && (channel === "EMAIL" ? c.email : c.phone));

  function applyTemplate(id: string | null) {
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    setChannel(t.channel as "EMAIL" | "SMS");
    setSubject(t.subject ?? "");
    setBody(t.body);
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-sm font-medium">Send a message</CardTitle></CardHeader>
      <CardContent>
        <form action={sendMessage.bind(null, businessId)} className="space-y-3">
          <input type="hidden" name="channel" value={channel} />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Channel</Label>
              <Select value={channel} onValueChange={(v) => setChannel(v as "EMAIL" | "SMS")}>
                <SelectTrigger><SelectValue>{(v: string) => (v === "EMAIL" ? "Email" : "SMS")}</SelectValue></SelectTrigger>
                <SelectContent>
                  <SelectItem value="EMAIL">Email</SelectItem>
                  <SelectItem value="SMS">SMS</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">To</Label>
              <Select name="contactId">
                <SelectTrigger>
                  <SelectValue placeholder="Pick a contact">
                    {(v: string) => {
                      const c = contacts.find((x) => x.id === v);
                      return c ? (c.name ?? (channel === "EMAIL" ? c.email : c.phone)) : "Pick a contact";
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {usable.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name ?? (channel === "EMAIL" ? c.email : c.phone)} — {channel === "EMAIL" ? c.email : c.phone}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Template</Label>
            <Select onValueChange={applyTemplate}>
              <SelectTrigger>
                <SelectValue placeholder="Start from a template…">
                  {(v: string) => templates.find((t) => t.id === v)?.name ?? "Start from a template…"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {channel === "EMAIL" && (
            <div className="space-y-1.5">
              <Label className="text-xs">Subject</Label>
              <Input name="subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs">Body</Label>
            <Textarea name="body" rows={8} value={body} onChange={(e) => setBody(e.target.value)} />
            <p className="text-xs text-muted-foreground">
              Merge fields: {"{{business_name}} {{contact_name}} {{article_title}} {{article_link}} {{sender_name}} {{unsubscribe_url}}"}
            </p>
            {body.includes("{{article_link}}") && !hasReadyArticle && (
              <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
                This template references an article link, but no approved free article exists yet — the field will be left blank.
              </p>
            )}
          </div>
          <Button type="submit">Queue for sending</Button>
        </form>
      </CardContent>
    </Card>
  );
}
