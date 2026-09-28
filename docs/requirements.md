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
- Customers: a WON prospect is converted (package or ad-hoc) and keeps one workspace.
  Clients approve monthly topic plans via private link; articles release on scheduled
  dates only with manual team confirmation. Bank transfer now; Stripe/card later.
  GST 10% by default (configurable to 0). Part payments supported.

## Precision rules (enforced in code/tests)

- "Not found in the results checked" ≠ "does not rank".
- "Publication date unknown" ≠ "inactive blog".
- Failed inspection is never a negative signal.
- No-blog prospects score below inactive-blog prospects.
- Evidence URLs retained on all findings.
- No invented prices/qualifications/testimonials/guarantees; claims flagged for verification.
- Simulated sends are always labelled.

## Status

### Done — phase 0 + phase 1 core (this repo)

- [x] Next.js 16 + TS + Tailwind v4 + shadcn/ui app shell (Today/Prospects/Articles/Inbox/Settings)
- [x] Supabase Auth email+password accounts; sign-up on /login; team list
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
- [x] Tests: 29 vitest units/integration (scoring precision, billing cents math, inspection w/ live fixture, crypto, templates, unsubscribe) + 8 Playwright journeys (incl. customer conversion, plan approval send, invoice part-payment)
- [x] n8n poller workflow JSON (importable, no inbound ports, error path reports back for safe retry)
- [x] UI overhaul (warm identity, workflow-first): Fraunces display font + cream/terracotta palette,
      fixed broken sans font variable; "what to do next" banner + pipeline stepper on prospect page
      (src/lib/workflow.ts is the single source of truth, reused by Today queue + lists);
      Today page = one prioritised work queue; stage filter chips replace dropdowns; chat-style
      message threads; URL-addressable tabs (?tab=); sidebar live counts; useful empty states
- [x] Select fixes: Base UI selects displayed raw values (e.g. "all", "PREPARING_OUTREACH") —
      server pages pass `items`, client composers use children functions
- [x] e2e cleans up its own rows after running (previously left "E2E Bathrooms" junk in the DB)

### Done — phase 2 + phase 3 (customers, plans, billing)

- [x] Customer lifecycle: `Business.isCustomer`/`customerSince`; converting a WON prospect
      (package or ad-hoc) opens Plans + Billing tabs on the same record — messages/notes/contacts shared
- [x] `/customers` card grid: package, plan status, next delivery, payment pill; summary strip
      (active packages, monthly value, outstanding); `/customers/new` direct-create
- [x] Packages: `ArticlePackage` CRUD at `/settings/packages` (name, articles/month, price)
- [x] Subscriptions: `Subscription` per customer (ACTIVE/PAUSED/CANCELLED), `billingPreference`
      = invoice-approval now / card auto-pay reserved for Stripe
- [x] Content plans: `ContentPlan`+`ContentPlanItem` per month; prefill from topics; reorder/drop;
      send-for-approval queues a templated email with a client link
- [x] Client-facing `/c/[token]`: token-gated plan approval + change requests, quote accept/decline,
      invoice view + bank details. Raw tokens never stored (sha256 hash); links rotate on re-send
- [x] Scheduled release is manual: plan items reach READY when the article is APPROVED; "Release &
      notify" (only from the scheduled date) flips article+item to DELIVERED, issues a private link,
      queues the delivery email
- [x] Billing: `Quote`, `Invoice`, `Payment`; Q-0001/INV-0001 numbering; GST on subtotal
      (`billing.taxRateBps`, default 10%, set 0 to disable); part payments; outstanding/overdue;
      invoice void; quote→invoice conversion
- [x] `src/lib/billing.ts`: integer-cents math + validation (unit-tested); line-items editor component
- [x] Bank details + payment instructions from settings (`billing.*`); Stripe deferred —
      `PaymentMethod.CARD` + `cardPaymentUrl`-shaped fields reserved, no schema change needed
- [x] `customer_scan` hourly job (self-rescheduling): stamps SENT→OVERDUE invoices past due date,
      expires stale quotes + revokes their links
- [x] Customer duties in the shared workflow (`src/lib/workflow.ts`): chase_payment, release_article,
      nudge_plan, plan_next_month, prepare_invoice — surfaces in Today queue, sidebar badge, banners
- [x] Built-in templates for plan approval, quote, invoice, payment receipt, article delivery
- [x] Bug fix: messaging a WON/customer no longer resets them to a prospect stage
- [x] Bug fix: Base UI `Button` defaults `type="button"` — ~30 form-action buttons across the app
      (send plan/quote/invoice, approve/reject topics, article stage changes, release, discovery
      import, inbox poll, etc.) were dead on click; all given explicit `type="submit"`

### Phase 1 remaining work / gaps

- [ ] Real provider wiring needs credentials: GOOGLE_* (OAuth app in GCP), DATAFORSEO_*, OPENAI_* — all documented in README/.env.example
- [ ] n8n workflow needs one-time import + activate in the n8n UI
- [ ] Gmail poll needs a schedule — currently runs on tick (GH Actions every ~10 min) and via "Check for replies" button
- [ ] SMS: pick provider (Twilio recommended: AU number ~A$8/mo, ~5c/SMS) when ready; simulated until then
- [ ] Positive-reply detection is manual (inbox flags "Reply received — choose the next step")
- [ ] Rate limiting on public feedback endpoint (low risk; add before heavy use)
- [ ] Multi-browser e2e coverage is chromium-only for now

### Phase 2/3 remaining work / gaps

- [ ] Stripe/card payments: payment links on invoices + authorised recurring card billing
      (schema already has `PaymentMethod.CARD`, `billingPreference=AUTO_CHARGE`, `cardPaymentUrl` slot)
- [ ] Plan generation n8n workflow: "Start writing" currently creates an article shell per item;
      wiring it into a bulk research/draft pipeline is the next n8n build
- [ ] Monthly invoice auto-drafting: `generateMonthlyInvoice` is a manual button per subscription;
      could be scheduled via customer_scan once the shape is proven
- [ ] Basic reporting: outreach, replies, conversions, delivery, operating cost (Job.costCents already tracked)
