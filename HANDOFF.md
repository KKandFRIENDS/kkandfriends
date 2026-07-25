# KK & Friends — Handoff & Current State (2026-07-25)

A complete snapshot so a fresh session (or another account) can continue work.
Read this first, then `PLAN.md` (roadmap) and `MEMBERSHIP_SETUP.md` (owner setup +
SQL migration instructions). §10 is the running session log — what shipped, what
broke, and what is still open.

> **Working with KK — read this before the first reply.** KK is not a developer.
> Give **one step at a time** and wait for confirmation before sending the next;
> a numbered list of five screens at once is where every bad stretch of the
> 2026-07-25 session started. Name the exact button text and where it is on
> screen. Never paste a placeholder like `여기에_값` into a URL you ask KK to
> open — it gets pasted literally. **Verify a claim before instructing** (a
> "no credit card needed" answer that turned out to require a card cost about an
> hour). KK reads and writes Korean; explain in Korean, keep code/keys in Latin.

> **The repo may not be on the machine.** As of 2026-07-25 the working directory
> `C:\Users\BIT\OneDrive\KK&FRIENDS\WEBSITE\kkandfriends` held only loose notes.
> Recover it with `git init` + `git remote add origin
> https://github.com/KKandFRIENDS/kkandfriends.git` + `git fetch --depth=1 origin
> main` + `git checkout -f -b main FETCH_HEAD`. Git credentials are already
> configured; `gh` is **not** installed. Do **not** commit `ClaudeProChat/` or the
> `*_prompt.md` files that sit in that folder — they are KK's personal files.

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
| `SUPABASE_SERVICE_ROLE_KEY` | digest, daily-brief, notify-approval, notify-application | server-only |
| `RESEND_API_KEY`, `RESEND_FROM` | all emails | domain verified |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | deploy-notify, notify-application | ⚠️ **not present in Production** as of 2026-07-25 — that is why the daily brief returns `telegram:false`. Adding them is all the Telegram teaser needs. |
| `GEMINI_API_KEY` | daily-brief | **the live writing route.** Google AI Studio free tier, no card. Re-copyable at `aistudio.google.com/apikey` (unlike Vercel keys). |
| `AI_GATEWAY_API_KEY` | (unused) | left over from the abandoned Vercel-AI-Gateway attempt; harmless because Gemini takes priority. Safe to delete. |
| `CRON_SECRET` | `/api/cron/digest`, `/api/cron/daily-brief` | `?key=` for manual browser test. **Rotated 2026-07-25** because the old value was unrecoverable (stored Sensitive). Both crons read the same var, so rotating breaks nothing. |
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
bucket) · `011_nominations` · `012_daily_brief` (applied 2026-07-25 —
`profiles.daily_brief_optin`, `daily_brief` notification type, `daily_briefs`
per-day lock) · `013_member_avatar` (applied 2026-07-25 — one-line
`grant update (avatar_url)` so members can change their own profile photo).
**All 13 migrations are applied in Supabase.**
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

**LLM route (2026-07-25) — Gemini, because both Claude routes needed a card:**
KK's card is rejected at console.anthropic.com, and Vercel AI Gateway's $5 free
credit turns out to require **card-based identity verification** (calling it
without that returns `401 Authentication failed … has access to AI Gateway`).
So the writing step now runs on **Google Gemini's free tier** — no card at all,
1,500 req/day vs our 1/day.

Key priority (no code change to switch): `GEMINI_API_KEY` → `AI_GATEWAY_API_KEY`
→ `ANTHROPIC_API_KEY`. `VIA`/`via` reports which one served the request.
- Gemini: plain REST (no SDK), `generativelanguage.googleapis.com/v1beta`,
  models tried in order `gemini-3.6-flash` → `3.5-flash` → `2.5-flash` so a
  model that's retired or not enabled can't break the job. Verified 2026-07-25:
  all three paths return 400 (bad key), not 404 — endpoint shape is correct.
- Claude paths kept intact; `create()` still sheds unsupported params on a 400
  (effort/betas → plain → no-thinking).

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

### Original design notes (superseded — kept only as the pre-build spec)

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

# 10. SHIPPED (2026-07-25) — Members can change their own profile photo

Member feedback: there was no way to edit your picture. `avatar_url` existed
since 002 but was written only by the sign-up trigger (the Google/Kakao account
image) and was left out of the member UPDATE grant, so it was read-only.

- `/me → 프로필 수정` now opens with a photo block: **사진 선택 / 사진 없애기** plus a
  live circular preview.
- The browser centre-crops and downscales to a **512px square JPEG** before
  upload (`squareThumbnail()` in `me.html`), so a 10MB phone photo lands as
  ~60KB — inside the bucket cap and fast in member lists.
- Storage **reuses the `post-images` bucket** from migration 010 (approved-member
  INSERT, public read) under an `avatars/` prefix, so there was no new Storage
  config to get wrong. Replaced avatars are not garbage-collected — negligible at
  ~60KB each, but that's the known trade-off.
- `db/migrations/013_member_avatar.sql` is a single
  `grant update (avatar_url) on public.profiles to authenticated;`. **Applied
  2026-07-25 and verified live.** `status` / `is_founding` stay outside the grant.
- The save payload includes `avatar_url` **only when it changed**, so profile
  saving still worked before the migration ran.
- New photos propagate to `/members` and post bylines automatically — both read
  `public_member_profiles`, which already exposed `avatar_url`.

---

# 11. Open items (nothing is blocking; ordered by value)

1. **Telegram for the daily brief.** `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID`
   are not in Production, so the brief reports `telegram:false`. Adding them is
   the whole fix. For a members' channel instead of KK's own chat, create the
   channel, add the bot as admin, and set `TELEGRAM_CHANNEL_ID` (the code prefers
   it and falls back to `TELEGRAM_CHAT_ID`). **This also re-enables the failure
   alert** — `alertAdmin()` currently has nowhere to send to, so a failed cron is
   silent. Until then KK should eyeball `/voices` on the first mornings.
2. **Cleanup.** Delete the two unused Vercel AI Gateway keys, the
   `AI_GATEWAY_API_KEY` env var, and the AI Studio key ending `…kTdQ` (it was
   exposed in a screenshot; KK already rotated to a new key). The Saturday
   test brief in the lounge can be deleted from `/voices` if KK wants.
3. **Watch the first real runs** (Mon–Fri 07:00 KST) for brief length/tone.
   Prompt lives in `SYSTEM_PROMPT` in `api/cron/daily-brief.js`; the disclaimer
   is appended in code by `withDisclaimer()` and must stay byte-identical.
4. **Vercel Hobby cron quota is now full** (digest + daily-brief = 2). A third
   cron needs Pro, or fold the work into an existing function.
5. `/voices` still has no main-site nav entry (open since Phase 2).

---

_Last updated 2026-07-25. Deploy model: push to `main` (`git push origin
HEAD:main`) → Vercel auto-deploys in 1–2 min. When in doubt, read `PLAN.md` +
`MEMBERSHIP_SETUP.md` + `DAILY_BRIEF_SETUP.md`._
