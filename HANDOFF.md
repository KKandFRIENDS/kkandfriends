# KK & Friends — Handoff & Current State (2026-07-24)

A complete snapshot so a fresh session (or another account) can continue work.
Read this first, then `PLAN.md` (roadmap) and `MEMBERSHIP_SETUP.md` (owner setup +
SQL migration instructions). The **next task** (daily market-news auto-post to the
lounge + opt-in alerts) is fully spec'd at the bottom — start there.

---

## 1. What this is

`www.kkandfriends.com` — an invite-first, verified community for Korean
financial-market professionals. **Positioning:** "verified professional, chosen
identity" (real name OR persistent pseudonym; KK personally reviews every
application). Free through 2026. Bilingual KR/EN.

**Status: fully built & live.** Public marketing site + KK's public THOUGHTS
columns (24) + a members-only system (login, profiles, admission review, lounge,
directory, events, notifications, nominations, weekly digest, moderation,
analytics). Founding-member invites are the current go-to-market step.

## 2. Architecture

- **Static site on Vercel** (`vercel.json` → `cleanUrls: true`). All pages/assets
  at the repo root; `/community` serves `community.html`, etc. **No framework.**
  (A Next.js re-platform was tried and reverted — its clean-URL rewrites 404'd.)
- **Serverless functions** in `/api/*.js` (Vercel Node functions).
- **Supabase** = backend: Postgres + Auth (Google + Kakao OAuth) + RLS + Storage.
  Project ref `pahdwduqxxiugqjkbhvq`. All client access uses the **anon key + RLS**
  (`config.js`); privileged server actions use the **service_role key** (env, never
  in the repo).
- **Resend** = transactional email (domain verified). **Telegram bot** = push
  notifications (shared with kk-researchlab; used by deploy-notify + new-application
  alerts).
- **Client** = ES modules; shared auth in `js/auth.js`, safe Markdown in
  `js/markdown.js`, member styles in `member.css`.

### Deploy / branch model (IMPORTANT)
- Production (`www.kkandfriends.com`) deploys from the **`main`** branch on Vercel.
- Dev branch for this work: **`claude/kkandfriends-website-plan-x7qzc5`**.
- Ship = commit → push feature branch → **also push to `main`** (`git push origin
  HEAD:main`) → Vercel auto-deploys (~1–2 min). KK has authorized deploying this
  session's work directly to `main`.

## 3. Key config & IDs

- Supabase URL: `https://pahdwduqxxiugqjkbhvq.supabase.co`
- Admin (KK) UID: `6ac6cf72-1c88-4626-9124-27a6a2792e1e`  ← in `config.js` + `is_admin()`
- Admin email: `kim.kiseok.1969@gmail.com`
- `config.js` (committed, public): `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `ADMIN_UID`.

### Vercel env vars (already set unless noted)
| Var | Used by | Notes |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | digest, notify-approval, notify-application | server-only |
| `RESEND_API_KEY`, `RESEND_FROM` | all emails | domain verified |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | deploy-notify, notify-application | shared bot/chat |
| `CRON_SECRET` | `/api/cron/digest` | `?key=` for manual browser test |
| `ADMIN_EMAIL` | notify-application | optional; falls back to KK's email |
| `ADMIN_TOKEN` | `api/admin/waitlist.js` | legacy waitlist admin |
| `VERCEL_WEBHOOK_SECRET` | deploy-notify | Vercel webhook HMAC |
| `SITE_URL` | emails | defaults to https://www.kkandfriends.com |

## 4. Pages

**Public:** `index` (home), `community`, `membership`, `thoughts` (column list),
`posts/<slug>.html` (24 columns), `terms`, `privacy`, `join` (apply/onboard).
**Members (login+approved):** `voices` (라운지/lounge — the members' post feed),
`write` (composer), `members` (directory), `events`, `notifications`, `nominate`,
`me` (profile). **Admin (KK only):** `admin-members` (review), `admin-reports`,
`admin-nominations`, `admin-analytics`. `unsubscribe` (digest opt-out).
`apply.html` is legacy (URL `/apply` 302→`/join`).

## 5. APIs (`/api`)

- `cron/daily-brief.js` — **daily global-market brief → lounge + alerts** (cron
  `0 22 * * 0-4` = Mon–Fri 07:00 KST). Claude (`claude-opus-5`) writes it from
  free Yahoo quotes + Google/CNBC RSS headlines (`lib/market-sources.js`),
  service_role inserts it into `member_posts` as KK, then fans out on-site
  notifications + a Telegram teaser. `?dry=1` previews, `?force=1` overrides the
  weekend/once-a-day guards. Setup: `DAILY_BRIEF_SETUP.md`.
- `cron/digest.js` — weekly digest email (Vercel cron `0 0 * * 1` = Mon 09:00 KST).
- `notify-approval.js` — emails a member when KK approves them.
- `notify-application.js` — **emails + Telegrams KK on each new application** (newest).
- `deploy-notify.js` — Vercel deploy webhook → Telegram.
- `waitlist.js`, `admin/waitlist.js` — legacy pre-launch waitlist (superseded by /join).

## 6. DB migrations (`db/migrations/`) — ALL APPLIED in Supabase

`001_comments` (comments/likes) · `002_members` (profiles, new-user trigger, RLS,
`is_admin()`/`is_member()`, approve/decline RPCs) · `003_backfill_profiles` ·
`004_member_posts` (lounge posts + `set_post_hidden` + members-only comments +
`public_member_profiles` view) · `005_notifications` (on-site notif + triggers) ·
`006_events` · `007_harden_profiles_view` · `008_email_digest` (opt-in +
unsub token) · `009_reports` (moderation) · `010_storage_post_images` (Storage
bucket) · `011_nominations` · `012_daily_brief` (⚠️ **KK must run this one** —
`profiles.daily_brief_optin`, `daily_brief` notification type, `daily_briefs`
per-day lock).
> New migrations run **manually** in Supabase SQL editor. Reuse
> `is_admin()`, `is_member()`, `touch_updated_at()` from earlier migrations.

## 7. Locked product decisions

- Single **verified free membership** (no paid tiers; revisit pricing 2027).
- Lounge (Voices) posts are **members-only** (candor thesis) — never publicly
  teased. KK's **THOUGHTS are public** (that's the public "proof of life").
- Members choose **real name OR persistent pseudonym**.
- Login = **Google + Kakao** (both live). Telegram *login* was **cancelled**.

## 8. Conventions / gotchas

- **Mobile reveal bug (fixed, don't reintroduce):** content hidden via scroll
  reveal (GSAP ScrollTrigger / IntersectionObserver `.fade-in`) got stuck at
  `opacity:0` on mobile Safari. Rule: **never gate content visibility behind a
  scroll trigger without a load-time / mobile fallback.** `thoughts/community/
  membership` now reveal on load; `index` reveals all `.fade-in` on mobile.
- Logo `KK_and_FRIENDS.png` is 256px/100KB (was 5.6MB) — keep it small.
- Homepage has a "Latest columns" strip + a hardcoded `INTEL_CARDS` array (in
  `index.html`) that must be updated when a new THOUGHTS column publishes.
- Publishing a THOUGHTS column = create `posts/YYYYMMDD_slug.html` from an
  existing post as template + add a card to `thoughts.html` + update homepage
  strip/INTEL_CARDS + `sitemap.xml`, then deploy.
- SEO: `robots.txt`, `sitemap.xml`, OG/Twitter tags on public pages, JSON-LD on
  `index` + the founding post.

---

# 9. SHIPPED (2026-07-25) — Daily global-market brief → lounge + opt-in alerts

Every weekday 07:00 KST a cron publishes a global-market brief to the lounge as
KK and alerts opted-in members.

**KK's decisions (2026-07-25):** AI-written in KK's voice from RSS headlines +
index/rate/FX/commodity quotes · **weekdays only** (Mon–Fri) 07:00 KST · alerts =
on-site 🔔 + Telegram (**email deliberately excluded** — daily mail is fatiguing)
· opt-in defaults **ON** · members-only lounge post (re-confirmed, not a public
THOUGHTS column).

**Files:** `api/cron/daily-brief.js` · `lib/market-sources.js` ·
`db/migrations/012_daily_brief.sql` · `DAILY_BRIEF_SETUP.md` · `vercel.json`
(cron + `maxDuration: 60`) · `/me` opt-in toggle · `/notifications` 📈 row ·
`package.json` (`@anthropic-ai/sdk`).

**Remaining for KK (see `DAILY_BRIEF_SETUP.md`):** run migration 012, add
`AI_GATEWAY_API_KEY` in Vercel, redeploy, then test `?dry=1` → `?force=1`.

**LLM route (2026-07-25):** KK's card was rejected at console.anthropic.com, so
the writing step goes through **Vercel AI Gateway** (`https://ai-gateway.vercel.sh`,
Anthropic-Messages-compatible, model `anthropic/claude-opus-5`, no markup, free
tier $5/30 days ≫ our ~$1.2/mo). `AI_GATEWAY_API_KEY` wins when set;
`ANTHROPIC_API_KEY` still works as the direct route with no code change. The
`create()` helper sheds unsupported params on a 400 (effort/betas → plain →
no-thinking) so an unattended run degrades instead of dying.

**Gotchas learned:**
- `js/markdown.js` has **no table support** — the prompt forbids `|` tables and
  mandates bullets for the numbers block.
- Numbers are formatted **server-side** and the model is told to copy the strings
  verbatim; it never does arithmetic, so it cannot invent a price.
- Idempotency is a `daily_briefs` PK on the KST date, taken **before** the model
  call (so a double fire costs nothing and can't double-notify); it's released on
  failure so a retry works.
- Vercel Hobby: crons fire *within* the hour, `maxDuration` caps at 60s, and only
  **2 crons** are allowed — digest + brief now fills that quota.
- Sources verified live 2026-07-25: 11/11 Yahoo quotes, 24 headlines.

### Original design notes (kept for reference)

**A. Content source.** Two options — pick per KK:
1. **AI-generated brief** (recommended, matches KK's voice): a daily Vercel cron
   calls an LLM (Anthropic API) to write a short market brief from fetched
   headlines/data. KK already runs a "Daily Market Briefing" routine — consider
   feeding its output in, or generate fresh in the cron.
2. **Curated feed**: pull from a market-news API and format. Less voice, more work.

**B. Where it posts.** Insert a row into **`member_posts`** (the lounge table)
authored by KK's admin UID, `status='published'`, `category='시장/매크로'`,
title like `글로벌 마켓 브리핑 — 7/24`. It then shows in `/voices` automatically.
(No schema change needed to post; see C for alerts.)
- Server-side insert must use **service_role** (bypasses the member-only INSERT
  RLS), with `author_id = ADMIN_UID`. Do it inside the cron function.

**C. Opt-in alerts.** Add a preference + fan-out:
1. Migration `012_daily_brief.sql`: add `daily_brief_optin boolean not null
   default true` to `profiles` (or a separate table). Add a `/me` toggle
   (mirror the existing `email_digest` opt-out UI).
2. On each daily post, notify opted-in **approved** members via:
   - **On-site notification** (insert into `notifications`, type e.g.
     `daily_brief`, link to the post) — reuse the existing notif UI/badge.
   - **Email** (Resend, per recipient) — reuse the digest's send pattern.
   - **Telegram broadcast** (optional) — a public channel members can join, or
     per-user chat IDs if collected. Simplest v1: post to a shared KK & Friends
     Telegram channel via the existing bot.

**D. Cron.** Add to `vercel.json` crons, e.g. daily 22:00 UTC (07:00 KST):
`{ "path": "/api/cron/daily-brief", "schedule": "0 22 * * *" }`.
New function `api/cron/daily-brief.js` (model on `api/cron/digest.js`):
guard with `CRON_SECRET` (`?key=`), generate/format the brief, `service_role`
insert into `member_posts`, then fan out notifications to opt-in members.
> Vercel Hobby allows daily crons. If the Anthropic API is used, add
> `ANTHROPIC_API_KEY` to Vercel env.

**E. Open decisions for KK**
- Content: AI-written brief vs curated feed? Which sources? Tone (KK voice?).
- Post as a lounge Voices post (members-only) vs a public THOUGHTS post? (Lounge
  keeps it a members perk; public would also be lead-gen. KK said **lounge**.)
- Alert channels: on-site only, +email, +Telegram? Default opt-in vs opt-out?
- Time of day (KST). Weekdays only or 7 days?

**Reuse checklist:** `api/cron/digest.js` (cron+service_role+Resend+opt-in
pattern), `db/migrations/008_email_digest.sql` (opt-in column + `/me` toggle
pattern), `db/migrations/005_notifications.sql` (on-site notif), `notify-*.js`
(Telegram send). Everything needed is already in the repo — this is mostly
assembly.

---

_Last updated 2026-07-24. Deploy model: push to `main`. When in doubt, read
`PLAN.md` + `MEMBERSHIP_SETUP.md`._
