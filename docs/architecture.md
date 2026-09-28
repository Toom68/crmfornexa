# Architecture

## Overview

```
┌────────────┐   cron tick     ┌──────────────────────────────┐
│ GitHub     │ ──────────────▶ │  Next.js app (Vercel)        │
│ Actions    │  POST /api/     │  UI + API + private links    │
└────────────┘  internal/tick  │  Supabase Postgres       │
                               │         ▲                    │
┌────────────┐  poll+webhook   │  /api/n8n/jobs/next          │
│ n8n        │ ◀────────────── │  /api/n8n/callback           │
│ (own PC,   │  + OpenAI       │  /api/webhooks/sms           │
│  Docker)   │ ──────────────▶ │  Gmail OAuth                 │
└────────────┘                 └──────────────────────────────┘
```

- **Vercel Hobby ($0)** hosts the app: UI, API, private article pages, inbound webhooks.
- **Supabase Postgres** is the source of truth in development and production. Prisma uses the transaction pooler for app queries and the session pooler for migrations.
- **GitHub Actions cron (~10 min)** → `/api/internal/tick` claims due `Job` rows:
  Gmail poll, website inspections, rank checks, queued sends, retry sweep. Bounded
  to the ~60 s serverless limit; long work is delegated to n8n.
- **n8n on the owner's machine** polls `/api/n8n/jobs/next` (outbound only — no
  inbound ports/domain needed) and posts results to `/api/n8n/callback`.
  If the machine is off, jobs queue visibly. Upgrade path: same container on a $5 VPS.

## Key decisions

- **Job-table everything.** Every side effect is a `Job` row with an idempotency
  key and bounded retries. n8n output never overwrites human edits — it only ever
  creates a *new* `ArticleVersion`. Retries can't duplicate sends.
- **Adapters at provider boundaries.** Email (`Gmail` now, `Mailgun` reserved),
  SMS (`simulated`/`twilio`/`clicksend`), SERP (`DataForSEO`). Swapping is a config change.
- **Gmail via OAuth, unverified app.** Gmail scopes are "restricted": full
  verification needs a paid security assessment. As a *published/unverified* app,
  each team member clicks through one warning; tokens persist (the 7-day expiry
  only applies to *Testing* status). Hard cap 100 users — fine internally.
  Escape hatches: Google Workspace internal app, or the Mailgun adapter.
- **Private links are capabilities.** 192-bit random token in the URL; only its
  SHA-256 is stored. Revocable, expirable, and rendered in a layout that exposes
  no internal data.
- **Precise evidence model.** `NOT_FOUND_IN_DEPTH` ≠ doesn't rank;
  `UNKNOWN_LAST_POST` ≠ inactive blog; `FETCH_FAILED` never scores negatively;
  `NO_BLOG` scores below `INACTIVE_BLOG`. Maps/local results are discovery-only
  and never count as an organic ranking. All findings keep evidence URLs.
- **Compliance by construction.** Contacts carry `source` + `permissionBasis`;
  every email carries an HMAC-signed unsubscribe link; STOP opts out of SMS;
  sends are manual/reviewed; simulated data is always labelled.

## Cost forecast (phase-1 volume: 10–50 prospects/wk)

| Item | Cost |
|---|---|
| Vercel Hobby, Supabase free tier, n8n self-hosted, GitHub Actions | $0 |
| DataForSEO | ~$1–5/mo |
| OpenAI (mini-class models, ~40 articles/mo) | ~$3–15/mo |
| Gmail | $0 |
| SMS when enabled (Twilio AU number + ~200 msgs) | ~A$15–20/mo |
| Domain (only when moving to Mailgun) | ~A$20/yr |

## Deploy (Vercel)

1. Create a Supabase project and set its transaction pooler URL as `DATABASE_URL` and session pooler URL as `DIRECT_URL` in Vercel.
2. Set `APP_BASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `APP_SECRET`,
   `INTERNAL_API_SECRET`, `CRM_N8N_SECRET` + provider keys.
3. `prisma migrate deploy` (locally against the prod URL, or a CI step).
4. Add GitHub repo secret `INTERNAL_API_SECRET` + variable `APP_BASE_URL`.
5. Gmail OAuth redirect URI must match `APP_BASE_URL` + `/api/integrations/gmail/callback`.
