# Nexa CRM

A lightweight CRM + content-production system for an Australian SEO-article business.
It covers the full prospecting → outreach → customer loop: find renovation businesses,
verify they're a fit (inactive blog + weak organic visibility), produce a free article
via n8n/OpenAI, deliver it over a private link, send a templated introduction, and
manage replies and follow-ups in a shared inbox.

Won deals convert to customers: monthly content plans the client approves via a
private link, articles released on schedule with manual confirmation, and
quotes/invoices with GST, bank-transfer tracking and part payments — all from
the same business record.

## Stack

- **Next.js 16** (App Router, TypeScript) — UI + API in one app, deploys to Vercel free tier
- **Supabase Postgres** via Prisma 7
- **Supabase Auth** — email + password team logins, full access for everyone
- **Tailwind v4 + shadcn/ui + Tiptap** — polished desktop UI + article editor
- **n8n** (self-hosted, Docker) — AI pipelines: business profile, topics, research, draft
- **OpenAI** — the model behind n8n (configurable, `OPENAI_MODEL`)
- **DataForSEO** — discovery + organic rank checks (~A$0.003 per top-50 check)
- **Gmail (OAuth)** — shared inbox + outbound sends
- **SMS** — adapter interface; simulated until Twilio/ClickSend is configured

## Setup

```bash
cp .env.example .env            # add your Supabase connection strings and secrets
npm install
npm run db:migrate
npm run db:seed                 # dev login, built-in templates + default packages
npm run dev
```

Login: `tomy` / `tomy` (seed account — change it). A bare username signs in as `name@nexa.test`; full emails work too.
New teammates create accounts on `/login`; everyone has full access.

Create a Supabase project, then copy its Transaction pooler string (port 6543) to
`DATABASE_URL` and its Session pooler string (port 5432) to `DIRECT_URL` in
`.env`. Prisma migrations and seeds use `DIRECT_URL`; app queries use
`DATABASE_URL`. Keep the database password URL-encoded if it contains special characters.

## Background jobs

All background work is a `Job` row — resumable, idempotent, retryable.

- **Local dev:** hit `POST /api/internal/tick` with header `x-internal-secret: $INTERNAL_API_SECRET`
  (or let GitHub Actions do it — see below).
- **Prod:** `.github/workflows/tick.yml` pings the endpoint every ~10 min.
  Set repo secret `INTERNAL_API_SECRET` and variable `APP_BASE_URL`.
- **n8n:** `docker compose up -d n8n` → http://localhost:5678 → import
  `n8n/workflows/nexa-ai-poller.json` → activate. It polls `/api/n8n/jobs/next`
  and posts results to `/api/n8n/callback`. Needs `OPENAI_API_KEY` in `.env`.
  No inbound ports — if the machine is off, jobs visibly queue.

## Integrations (fill in .env when ready — app runs labelled-simulation mode without them)

| Key | What |
|---|---|
| `GOOGLE_CLIENT_ID/SECRET` + `/api/integrations/gmail/connect` | Gmail shared inbox (OAuth, unverified app — see docs/architecture.md) |
| `DATAFORSEO_LOGIN/PASSWORD` | Prospect discovery + organic rank checks |
| `OPENAI_API_KEY` | n8n research/drafting |
| `SMS_PROVIDER=twilio|clicksend` + creds | Real SMS. Inbound replies need a dedicated number pointed at `/api/webhooks/sms` |
| `MAILGUN_*` | Reserved — for when a sending domain exists |

## Test

```bash
npm test                 # vitest unit + integration tests
npx playwright test      # e2e journeys (needs `npx playwright install chromium` once)
npm run build
```

## Docs

- `docs/architecture.md` — how the pieces fit, cost forecast, decisions
- `docs/requirements.md` — living spec + implementation status
