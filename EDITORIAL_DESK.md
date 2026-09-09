# Editorial Desk v1

## Operation

- Review: `/admin-editorial` (existing Supabase admin login).
- Public editions: `/desk`; THOUGHTS has independent Series and Topic filters.
- Five independent VPS Docker cron stages run in Asia/Seoul terms: 06:00 scan, 06:30 rank, 07:00 research, 07:30 write, 08:00 edit and deliver. No Windows scheduled tasks.
- Each stage writes a root-only checkpoint. The 08:00 editor claims the database lease immediately before final validation and draft submission; an upstream failure leaves no publishable draft and sends a bounded failure notice.
- Only the owner can approve and then publish. Editing clears approval. Published editions are immutable in v1.
- Worker API can submit drafts and read published editorial memory. It cannot approve/publish or access members. The Supabase service key remains on Vercel.
- Existing Vercel daily brief, Korea close and member digest are unchanged. This Desk is a separate public editorial series; evaluate overlap during the initial four-week manual-review period.

## Source and quality boundaries

Curated feed list: `research-lab/config/desk-feeds.json`; allowed domains: `desk-source-policy.json`.
On 2026-09-08 the initial live check collected 105 feed items and retrieved 34 recent, deduplicated originals. One BIS URL returned 404 and is disabled, retained in configuration for replacement tracking. Corporate press releases are evidence of the company's statements, not independent proof of its projections.

Candidate score: 35% market impact, 30% structural importance, 15% surprise, 20% reader relevance. A score below 70, missing primary/independent sources, duplicates or declared conflicts holds a candidate. Source dates are limited to 14 days; matching a quoted substring is provenance verification, not a guarantee of factual correctness. An editor model checks claims, followed by mandatory human review.

Daily body: 800–1,200 characters including spaces. Weekly: 1,600–4,000. Existing public article titles support duplicate checks and related links; semantic duplication and factual judgments still require review.

Friday measures **news coverage momentum**, not social sentiment. The worker queries Google News RSS across macro, markets, Bitcoin and AI, clusters similar headlines, and ranks up to 15 signals using observed headline count, publisher diversity and recency. These signals identify where media attention is concentrating; they do not establish that a reported claim is true. Every factual claim must still trace to retrieved primary evidence. Google News selection is algorithmic and may vary by language, region and availability, so the Friday draft labels the signal accordingly. `DESK_SIGNALS_FILE` remains available for additional RSS-compatible signals.

Sunday needs at least three **published** editions from Monday–Saturday. It supplements those prior views with freshly retrieved evidence. Unapproved drafts are never quoted as KK's views.

## Persistence and security

Migration: `db/migrations/015_editorial_desk.sql` (014 is already used by Korea close). `016_editorial_stage_lease.sql` is an optional forward-compatible renewal function; the current five-stage scheduler does not require it.
Tables: `editorial_runs`, `editorial_drafts`, `editorial_events`. RLS enabled, no direct anon/member grants. RPC execution is service-only. Transactions lock rows; a 90-minute attempt lease fences stale workers; one edition per KST date prevents duplicates. Events retain snapshots of all revisions. A canonical content hash is stable across PostgreSQL JSONB key ordering.

Vercel configuration:

- Existing `SUPABASE_SERVICE_ROLE_KEY`, optional existing `SUPABASE_URL`/`ADMIN_UID`.
- `EDITORIAL_WORKER_TOKEN`: independent 256-bit shared token with VPS.
- `EDITORIAL_PUBLISH_ENABLED=true`: enables the owner's explicit publish action, never unattended publishing.

VPS configuration: `EDITORIAL_WORKER_TOKEN`, `EDITORIAL_SITE_URL`, `OPENROUTER_API_KEY`, four `DESK_*_MODEL` values, `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`. Google News needs no API credential. No member DB credentials. Root-only env file. At 08:00 a successful run sends the title and review link to KK; a failed stage sends a bounded failure notice.

## Validation and deployment

Live end-to-end validation on 2026-09-09: 31 retrieved sources, five ranked candidates, selected score 85.5, exact-passage research passed, 928-character draft passed deterministic validation, editor passed, Telegram delivery returned success, and the draft was stored for approval. The public API still returned zero articles before owner publication.

From the repository root: `node --test research-lab/test/*.test.js`.
Real PostgreSQL transaction tests: set `PGLITE_MODULE` to an installed `@electric-sql/pglite/dist/index.js`, then run `node research-lab/test/desk-sql.integration.mjs`. No production DB is used by these tests.
Local synthetic UI: same variable, `node research-lab/test/preview-desk.mjs`, then `http://127.0.0.1:8765/admin-editorial`. It binds loopback and uses ephemeral PostgreSQL, with an explicitly mocked login. It is excluded from Vercel/Docker builds.

Docker build from repo root: `docker build -t kk-editorial:VERSION -f research-lab/deploy/Dockerfile .`.
The compose definition is under `research-lab/deploy/compose.yaml`; supply its `.env` outside version control before starting. Never copy `.env` into an image or Git.

Rollback: stop the dedicated editorial container, set `EDITORIAL_PUBLISH_ENABLED=false` and redeploy, or restore the prior Vercel deployment. Retain editorial tables/events and releases; no destructive rollback SQL. Existing content and other cron jobs are unaffected.

## Four-week review

Check success/hold counts, source failures, human correction volume and duplicate topics in runs/events; review OpenRouter billing separately. 08:00 readiness is an initial target, not a guaranteed SLA. Do not enable auto-publication on the basis of passing software tests.
