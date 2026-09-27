# Requirements & implementation status

Living document — update as features land so work can resume without re-planning.

## Business context

Australian business producing SEO articles (AI research/draft + human edit) for
kitchen/bathroom renovation businesses in Melbourne & Sydney. Sells individual
articles and monthly packages (pricing/quantities/name/domain: configurable, undecided).
Small team, everyone full access, individual accounts, desktop-first UI.

## Confirmed decisions

- First release = full prospecting→outreach loop (not just prospect finding).
- Intro offer = personalised message + completed free article via private link.
- Topic is AI-suggested, team-approved before drafting. Articles manually reviewed for now.
- Email or SMS chosen per prospect. One shared inbox. Manual send control.
- Follow-up reminder at 24h, configurable, incl. weekends.
- Clients self-publish; delivery formats = copyable text, .docx, website HTML.
- n8n for research/production; CRM owns records, edits, approvals, delivery.
- Business record is the centre; separate sales + article pipelines.
- Sales: New prospect → Preparing outreach → Contacted → Interested → Proposal → Won/Lost.
- Articles: Topic proposed → approved → Research → Draft → Human edit → Client review → Revisions → Approved → Delivered.
- Providers chosen: Gmail OAuth (unverified app), OpenAI, DataForSEO, Vercel hosting.
  SMS provider undecided (adapter + simulated mode); Mailgun deferred until a domain exists.

## Precision rules (enforced in code/tests)

- "Not found in the results checked" ≠ "does not rank".
- "Publication date unknown" ≠ "inactive blog".
- Failed inspection is never a negative signal.
- No-blog prospects score below inactive-blog prospects.
- Evidence URLs retained on all findings.
- No invented prices/qualifications/testimonials/guarantees; claims flagged for verification.
- Simulated sends and sample data are always labelled.

## Status

### Done — phase 0 + phase 1 core (this repo)

- [x] Next.js 16 + TS + Tailwind v4 + shadcn/ui app shell (Today/Prospects/Articles/Inbox/Settings)
- [x] better-auth credential accounts; first-run account creation; team list
- [x] Postgres schema (Prisma 7) — businesses, contacts, findings, topics, articles+versions,
      private links (hashed tokens), feedback, templates, messages, jobs, settings, activity log
- [x] Job queue: DB-backed, idempotent, retry w/ backoff; `/api/internal/tick` + GH Actions cron
- [x] Business records: manual add w/ domain dedup, stages, assignee, next action, notes, contacts (source+permission basis)
- [x] Discovery: category×city via DataForSEO Maps + deep organic; hits review → import/skip w/ dedup
- [x] Qualification: website/blog inspection (RSS/sitemap/page dates), organic rank check, scoring + reasons + evidence
- [x] Editable business profile (n8n synthesis + manual fields); topic suggest/approve/reject/manual
- [x] Article pipeline: research→draft via n8n (auto-chained), Tiptap editor, immutable versions, regenerate-as-new-version
- [x] Private links: unguessable+hashed+revocable, read/copy/.docx/.html downloads, feedback bound to version
- [x] Outreach: templates w/ merge fields, compose→queue→send, Gmail OAuth connect+callback, simulated sends labelled
- [x] Inbound: Gmail history poll → attach to business/contact via thread/in-reply-to/from; SMS webhook (Twilio+ClickSend shapes) w/ STOP opt-out
- [x] Unsubscribe links (HMAC-signed, no login); opted-out contacts blocked from sends
- [x] Today view: unanswered replies, due follow-ups, articles in flight, failed jobs
- [x] Settings: business rules (follow-up hours, inactive threshold, top-N, depth, categories, cities), integrations status, template CRUD
- [x] Tests: 17 vitest units/integration (scoring precision, inspection w/ live fixture, crypto, templates, unsubscribe) + 4 Playwright journeys
- [x] n8n poller workflow JSON (importable, no inbound ports, error path reports back for safe retry)

### Phase 1 remaining work / gaps

- [ ] Real provider wiring needs credentials: GOOGLE_* (OAuth app in GCP), DATAFORSEO_*, OPENAI_* — all documented in README/.env.example
- [ ] n8n workflow needs one-time import + activate in the n8n UI
- [ ] Gmail poll needs a schedule — currently runs on tick (GH Actions every ~10 min) and via "Check for replies" button
- [ ] SMS: pick provider (Twilio recommended: AU number ~A$8/mo, ~5c/SMS) when ready; simulated until then
- [ ] Positive-reply detection is manual (inbox flags "Reply received — choose the next step")
- [ ] Rate limiting on public feedback endpoint (low risk; add before heavy use)
- [ ] Multi-browser e2e coverage is chromium-only for now

### Phase 2 (customers & packages)

- [ ] Individual purchases + monthly packages (configurable prices/quantities)
- [ ] Client-approved topic plans + content calendar, advance production
- [ ] Scheduled release with manual confirmation (schema has `scheduledFor`)

### Phase 3 (billing)

- [ ] Quotes + invoices issued from CRM
- [ ] Bank transfer tracking + Stripe payment links
- [ ] Optional authorised recurring card billing (per customer)
- [ ] Basic reporting: outreach, replies, conversions, delivery, operating cost (Job.costCents already tracked)
