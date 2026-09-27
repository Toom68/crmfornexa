import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { SalesStageBadge, QualBadge, SampleBadge, ArticleStageBadge } from "@/components/stage-badge";
import { formatDate, formatDateTime, formatRelative } from "@/lib/utils";
import {
  setSalesStage, setNextAction, addNote, addContact, qualifyBusiness, updateBusiness,
} from "@/lib/actions/business";
import { suggestTopics, addManualTopic, decideTopic, createArticleFromTopic } from "@/lib/actions/article";
import { MessageComposer } from "@/components/message-composer";
import { ProfileEditor } from "@/components/profile-editor";
import { ExternalLink, Sparkles, CheckCircle2, XCircle } from "lucide-react";
import type { SalesStage } from "@/generated/prisma/enums";

export const dynamic = "force-dynamic";

const STAGE_ORDER: SalesStage[] = [
  "NEW_PROSPECT", "PREPARING_OUTREACH", "CONTACTED", "INTERESTED", "PROPOSAL", "WON", "LOST", "DO_NOT_CONTACT",
];

export default async function BusinessPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const business = await prisma.business.findUnique({
    where: { id },
    include: {
      contacts: true,
      assignedTo: true,
      notes: { orderBy: { createdAt: "desc" }, include: { author: true } },
      inspections: { orderBy: { inspectedAt: "desc" }, take: 3 },
      rankingObservations: { orderBy: { checkedAt: "desc" }, take: 5 },
      topics: { orderBy: { createdAt: "desc" } },
      articles: { orderBy: { updatedAt: "desc" }, include: { versions: { orderBy: { version: "desc" }, take: 1 } } },
      messages: { orderBy: { createdAt: "desc" }, take: 50, include: { contact: true, sentBy: true } },
    },
  });
  if (!business) notFound();

  const [users, templates] = await Promise.all([
    prisma.user.findMany({ orderBy: { name: "asc" } }),
    prisma.messageTemplate.findMany({ orderBy: { name: "asc" } }),
  ]);

  const latestInspection = business.inspections[0];

  return (
    <div>
      <PageHeader
        title={
          business.name
        }
        description={business.domain ?? undefined}
        actions={
          <div className="flex items-center gap-2">
            {business.isSample && <SampleBadge />}
            {business.website && (
              <Button variant="ghost" size="sm" render={<a href={business.website} target="_blank" rel="noreferrer" />}>
                <ExternalLink className="mr-1.5 h-3.5 w-3.5" />Site
              </Button>
            )}
          </div>
        }
      />
      <div className="grid gap-6 p-8 lg:grid-cols-[1fr_360px]">
        {/* left column */}
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            <SalesStageBadge stage={business.salesStage} />
            <QualBadge status={business.qualificationStatus} />
            {business.qualificationScore > 0 && (
              <span className="text-sm text-muted-foreground">score {business.qualificationScore}</span>
            )}
            <form action={setSalesStage.bind(null, business.id)} className="flex items-center gap-2">
              <Select name="stage" defaultValue={business.salesStage}>
                <SelectTrigger className="h-8 w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STAGE_ORDER.map((s) => (
                    <SelectItem key={s} value={s}>{s.replaceAll("_", " ").toLowerCase()}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" variant="outline" type="submit">Move stage</Button>
            </form>
          </div>
          {business.qualificationSummary && (
            <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
              {business.qualificationSummary}
            </p>
          )}

          <Tabs defaultValue="overview">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="findings">Findings</TabsTrigger>
              <TabsTrigger value="messages">Messages ({business.messages.length})</TabsTrigger>
              <TabsTrigger value="articles">Articles ({business.articles.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-4 space-y-4">
              <ProfileEditor
                businessId={business.id}
                profile={business.profile as Record<string, unknown> | null}
                siteSummary={latestInspection?.siteSummary ?? null}
              />
              <Card>
                <CardHeader><CardTitle className="text-sm font-medium">Notes</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <form action={addNote.bind(null, business.id)} className="flex gap-2">
                    <Input name="body" placeholder="Add a note…" />
                    <Button type="submit" variant="secondary">Add</Button>
                  </form>
                  {business.notes.map((n) => (
                    <div key={n.id} className="rounded-md border p-3 text-sm">
                      <div className="mb-1 text-xs text-muted-foreground">
                        {n.author?.name ?? "system"} · {formatRelative(n.createdAt)}
                      </div>
                      {n.body}
                    </div>
                  ))}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="findings" className="mt-4 space-y-4">
              <Card>
                <CardHeader className="flex-row items-center justify-between">
                  <CardTitle className="text-sm font-medium">Run checks</CardTitle>
                </CardHeader>
                <CardContent>
                  <form action={qualifyBusiness.bind(null, business.id)} className="grid gap-3 sm:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Keyword</Label>
                      <Input name="keyword" placeholder={`${(business.categories as string[])[0] ?? "kitchen renovation"}`} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Location</Label>
                      <Input name="location" defaultValue={business.city ? `${business.city}, Australia` : ""} />
                    </div>
                    <div className="flex items-end">
                      <Button type="submit" variant="secondary">Check website + ranking</Button>
                    </div>
                  </form>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-sm font-medium">Website & blog</CardTitle></CardHeader>
                <CardContent>
                  {!latestInspection && <p className="text-sm text-muted-foreground">Not inspected yet.</p>}
                  {latestInspection && (
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{latestInspection.status.replaceAll("_", " ")}</Badge>
                        <span className="text-xs text-muted-foreground">{formatRelative(latestInspection.inspectedAt)}</span>
                      </div>
                      {latestInspection.blogUrl && (
                        <p>Blog: <a className="text-primary hover:underline" href={latestInspection.blogUrl} target="_blank" rel="noreferrer">{latestInspection.blogUrl}</a></p>
                      )}
                      {latestInspection.lastPostAt && (
                        <p>Last post: {formatDate(latestInspection.lastPostAt)} ({latestInspection.lastPostSource})</p>
                      )}
                      {latestInspection.error && <p className="text-destructive">{latestInspection.error}</p>}
                      {(latestInspection.evidence as { url: string; note: string }[] | null)?.map((e, i) => (
                        <div key={i} className="text-xs text-muted-foreground">
                          · {e.note} — <a className="text-primary hover:underline" href={e.url} target="_blank" rel="noreferrer">{e.url}</a>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-sm font-medium">Organic ranking checks</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {business.rankingObservations.length === 0 && (
                    <p className="text-sm text-muted-foreground">No checks yet.</p>
                  )}
                  {business.rankingObservations.map((r) => (
                    <div key={r.id} className="rounded-md border p-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">“{r.keyword}” · {r.location}</span>
                        <Badge variant={r.status === "ERROR" ? "destructive" : "outline"}>
                          {r.status === "FOUND" ? `#${r.position}` : r.status === "NOT_FOUND_IN_DEPTH" ? `not in top ${r.depth} checked` : "check failed"}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatDateTime(r.checkedAt)} · {r.device} · {r.source}
                      </p>
                      {(r.serpSnapshot as { topUrls?: { url: string; rank: number }[] } | null)?.topUrls && (
                        <details className="mt-2 text-xs text-muted-foreground">
                          <summary className="cursor-pointer">Top results seen (evidence)</summary>
                          <ul className="mt-1 list-inside list-disc">
                            {(r.serpSnapshot as { topUrls: { url: string; rank: number }[] }).topUrls.map((u, i) => (
                              <li key={i}>#{u.rank} {u.url}</li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="messages" className="mt-4 space-y-4">
              <MessageComposer
                businessId={business.id}
                contacts={business.contacts.map((c) => ({ id: c.id, name: c.name, email: c.email, phone: c.phone, optedOut: c.optedOut }))}
                templates={templates.map((t) => ({ id: t.id, name: t.name, channel: t.channel, subject: t.subject, body: t.body }))}
                hasReadyArticle={business.articles.some((a) => a.isFreeOffer && ["APPROVED", "DELIVERED"].includes(a.stage))}
              />
              <div className="space-y-2">
                {business.messages.map((m) => (
                  <div key={m.id} className={`rounded-md border p-3 text-sm ${m.direction === "INBOUND" ? "bg-accent/40" : ""}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {m.direction === "INBOUND" ? "← received" : "→ sent"} {m.channel.toLowerCase()}
                        {m.status === "SIMULATED" && <Badge variant="outline" className="ml-2 border-amber-400 text-amber-600">simulated</Badge>}
                      </span>
                      <span className="text-xs text-muted-foreground">{formatDateTime(m.sentAt ?? m.createdAt)}</span>
                    </div>
                    {m.subject && <p className="mt-1 font-medium">{m.subject}</p>}
                    <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{m.bodyText}</p>
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="articles" className="mt-4 space-y-4">
              <Card>
                <CardHeader className="flex-row items-center justify-between">
                  <CardTitle className="text-sm font-medium">Topics</CardTitle>
                  <form action={suggestTopics.bind(null, business.id)}>
                    <Button size="sm" variant="secondary"><Sparkles className="mr-1.5 h-3.5 w-3.5" />Suggest topics</Button>
                  </form>
                </CardHeader>
                <CardContent className="space-y-3">
                  <form action={addManualTopic.bind(null, business.id)} className="flex gap-2">
                    <Input name="title" placeholder="Add a topic manually…" />
                    <Button variant="outline" type="submit">Add</Button>
                  </form>
                  {business.topics.map((t) => (
                    <div key={t.id} className="rounded-md border p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium">{t.title}</p>
                          {t.rationale && <p className="mt-1 text-xs text-muted-foreground">{t.rationale}</p>}
                          {t.intentNote && <p className="mt-1 text-xs italic text-muted-foreground">Intent: {t.intentNote}</p>}
                        </div>
                        <Badge variant={t.status === "APPROVED" ? "default" : t.status === "REJECTED" ? "destructive" : "secondary"}>
                          {t.status.toLowerCase()}
                        </Badge>
                      </div>
                      {t.status === "PROPOSED" && (
                        <div className="mt-2 flex gap-2">
                          <form action={decideTopic.bind(null, t.id, "APPROVED")}>
                            <Button size="sm" variant="outline"><CheckCircle2 className="mr-1 h-3.5 w-3.5" />Approve</Button>
                          </form>
                          <form action={decideTopic.bind(null, t.id, "REJECTED")}>
                            <Button size="sm" variant="ghost"><XCircle className="mr-1 h-3.5 w-3.5" />Reject</Button>
                          </form>
                        </div>
                      )}
                      {t.status === "APPROVED" && !business.articles.some((a) => a.topicId === t.id) && (
                        <form action={createArticleFromTopic.bind(null, t.id)} className="mt-2">
                          <Button size="sm">Start article →</Button>
                        </form>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
              {business.articles.map((a) => (
                <Link key={a.id} href={`/articles/${a.id}`} className="block rounded-md border p-4 hover:bg-accent">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{a.title}</span>
                    <div className="flex items-center gap-2">
                      {a.isFreeOffer && <Badge variant="outline">free</Badge>}
                      <ArticleStageBadge stage={a.stage} />
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">updated {formatRelative(a.updatedAt)}</p>
                </Link>
              ))}
            </TabsContent>
          </Tabs>
        </div>

        {/* right column */}
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-sm font-medium">Next action</CardTitle></CardHeader>
            <CardContent>
              <form action={setNextAction.bind(null, business.id)} className="space-y-3">
                <Input name="nextAction" defaultValue={business.nextAction ?? ""} placeholder="What happens next?" />
                <Input name="nextActionAt" type="datetime-local"
                  defaultValue={business.nextActionAt ? new Date(business.nextActionAt.getTime() - business.nextActionAt.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ""} />
                <Select name="assignedToId" defaultValue={business.assignedToId ?? "none"}>
                  <SelectTrigger><SelectValue placeholder="Assignee" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unassigned</SelectItem>
                    {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button type="submit" size="sm" variant="secondary">Save</Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm font-medium">Details</CardTitle></CardHeader>
            <CardContent>
              <form action={updateBusiness.bind(null, business.id)} className="space-y-2.5 text-sm">
                <div className="space-y-1"><Label className="text-xs">Name</Label><Input name="name" defaultValue={business.name} /></div>
                <div className="space-y-1"><Label className="text-xs">Website</Label><Input name="website" defaultValue={business.website ?? ""} /></div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1"><Label className="text-xs">Email</Label><Input name="email" defaultValue={business.email ?? ""} /></div>
                  <div className="space-y-1"><Label className="text-xs">Phone</Label><Input name="phone" defaultValue={business.phone ?? ""} /></div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1"><Label className="text-xs">Suburb</Label><Input name="suburb" defaultValue={business.suburb ?? ""} /></div>
                  <div className="space-y-1"><Label className="text-xs">City</Label><Input name="city" defaultValue={business.city ?? ""} /></div>
                  <div className="space-y-1"><Label className="text-xs">State</Label><Input name="state" defaultValue={business.state ?? ""} /></div>
                </div>
                <div className="space-y-1"><Label className="text-xs">Categories</Label><Input name="categories" defaultValue={(business.categories as string[]).join(", ")} /></div>
                <Button type="submit" size="sm" variant="secondary">Save details</Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-sm font-medium">Contacts</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {business.contacts.map((c) => (
                <div key={c.id} className="rounded-md border p-2.5 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{c.name ?? c.email ?? c.phone}</span>
                    {c.isPrimary && <Badge variant="secondary">primary</Badge>}
                    {c.optedOut && <Badge variant="destructive">opted out</Badge>}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {c.email} {c.phone} {c.role && `· ${c.role}`}
                  </div>
                  <div className="text-xs text-muted-foreground">source: {c.source} · basis: {c.permissionBasis}</div>
                </div>
              ))}
              <Separator />
              <form action={addContact.bind(null, business.id)} className="space-y-2">
                <Input name="name" placeholder="Name" />
                <Input name="email" type="email" placeholder="Email" />
                <Input name="phone" placeholder="Phone" />
                <Input name="role" placeholder="Role (e.g. owner)" />
                <Select name="permissionBasis" defaultValue="inferred_business">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inferred_business">Published business contact</SelectItem>
                    <SelectItem value="express">Gave us permission</SelectItem>
                    <SelectItem value="replied">They contacted us</SelectItem>
                    <SelectItem value="unknown">Unknown</SelectItem>
                  </SelectContent>
                </Select>
                <Button type="submit" size="sm" variant="secondary">Add contact</Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
