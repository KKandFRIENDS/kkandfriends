# KK & Friends — Community Build Plan (2026)

The master plan for turning kkandfriends.com from a blog-with-comments into a
one-of-a-kind community for Korean financial-market professionals. Agreed
between KK and Claude, July 2026.

**Target (accelerated 2026-07-21):** platform fully built and soft-launched by
**end of August 2026**. "Finished" here means the platform is complete, founding
members are inside with profiles, and the first member posts are live — a
launched product with early activity. Organic community maturity (a consistently
active room) still develops naturally through the autumn; that part isn't
schedulable. Non-negotiables that will NOT be rushed: admission/verification
quality and a correct members-only access gate — these are the product.

## Positioning thesis

**Verified professional, chosen identity.**
Every member is verified as a real financial-market professional at admission
(reviewed personally by KK). Each member then chooses how they appear: real
name and affiliation, or a persistent professional pseudonym. Verification
creates trust in the room; optional pseudonymity creates candor in the
conversation. No existing Korean platform (Blind, 카페, LinkedIn, Substack)
offers both.

KK's editorial posts (THOUGHTS) anchor the intellectual tone; member writing
("Friends' Voices") is the growth engine; gated admission is the quality
filter — the exclusivity IS the product.

## Locked decisions (July 2026)

1. **Identity model:** verified professional, chosen identity (pseudonyms allowed;
   admission info must be truthful).
2. **Admission:** application → KK personally reviews and approves.
3. **Architecture:** static site on Vercel (`cleanUrls`) + Supabase as the backend
   (auth, profiles, posts, comments, notifications), all client-side via the anon
   key with RLS. NOTE (2026-07-21): a Next.js re-platform was tried and reverted —
   its clean-URL rewrites didn't take effect on this Vercel project (every
   extensionless route 404'd). The static + Supabase model is proven and carries
   Phase 1–3 fine (member pages are HTML + client-side Supabase). Revisit a
   framework only if/when true server-side rendering is needed, with the Vercel
   framework preset configured explicitly.
4. **Login:** Google + Kakao (native Supabase providers) in Phase 1;
   Telegram login as a fast-follow (custom integration — Telegram Login Widget
   + server-side HMAC verification; no native Supabase support).
5. **Pricing:** free through 2026 ("founding era"). Monetization revisited in 2027
   (Toss Payments is the likely rail if/when needed).

## Roadmap (accelerated — end-of-August target)

Weekly cadence from 2026-07-21. The gating factor is not engineering speed but
KK's external setup steps (Kakao/Telegram/Supabase config, ~3 short sessions)
and applicant review — none of which block the build if done promptly.

| Week | Dates | Ships |
|------|-------|-------|
| 1 | Jul 21–27 | Phase 1 core: Google+Kakao login, profiles, admission flow + review panel |
| 2 | Jul 28–Aug 3 | Finish Phase 1 (gating, founding-member conversion), Telegram login |
| 3 | Aug 4–10 | Phase 2: member editor, categories, Friends' Voices, unified feed |
| 4 | Aug 11–17 | Phase 3: notifications + digest, directory, moderation; first members invited in |
| 5 | Aug 18–24 | Polish, SEO/perf, analytics dashboard, invite mechanics, security review |
| 6 | Aug 25–31 | Launch prep, bug bash, soft launch to KK's network |

**Deferrable to September if a week slips** (protects the date without cutting
core): offline-events module, automated newsletter delivery (manual digests
first), advanced moderation (basic hide/suspend first).

### Phase 0 — Foundation & cleanup ✅ done 2026-07-21
- [x] Remove duplicate GA snippets, stray `posts/posts/` duplicates, legacy blog pages
- [x] ~~Re-platform to Next.js 15~~ — tried, then reverted to the proven static +
      Vercel-serverless setup (`vercel.json` cleanUrls, `/api/*` functions). Kept
      all cleanup/legal/member work; no framework.
- [x] Legal pages: `/terms` (이용약관), `/privacy` (개인정보처리방침), footer links,
      apply-form consent note
- [x] Verified in production (2026-07-21): clean URLs, member loop end-to-end

### Phase 1 — Membership core (Weeks 1–2: Jul 21 → Aug 3)
- Supabase auth: Google + Kakao sign-in (single member identity)
- Member profiles: display name OR pseudonym, professional field, career summary,
  verification badge; profile page per member
- Admission flow: `/apply` becomes an application into Supabase → admin review
  UI for KK (approve / decline) → approved members get accounts
- Convert existing waitlist signups into the **Founding Members** cohort
  (permanent badge); retire the separate Vercel Postgres waitlist DB
- Members-only gating actually enforced (RLS + server-side checks)
- Telegram login fast-follow

**Milestone: first 20–50 founding members inside, with profiles.**

### Phase 2 — Member voices (built 2026-07-21, ahead of schedule)
Decisions: member posts are **members-only** (candor thesis); **publish instantly**
(members vetted at admission; KK moderates after the fact).
- [x] `member_posts` table + RLS + `set_post_hidden` admin RPC + members-only
      comment re-scope + `public_member_profiles` safe byline view
      (`db/migrations/004_member_posts.sql`)
- [x] Safe Markdown renderer `js/markdown.js` (HTML-escaping, scheme-checked URLs)
- [x] `/write` editor — title, category, toolbar, live preview, draft/publish/delete
- [x] `/voices` — members-only list + single post + discussion (reuses comments
      module via `member:<id>` slug); admin hide/delete; author edit
- [x] Categories: 시장/매크로 · 크립토/디지털자산 · 정책/규제 · 커리어 · 자유
- [x] Links from `/me` and post-approval screen
- [ ] Image upload (Supabase Storage) — follow-up; URL images work now
- [ ] Main-site nav entry to `/voices` — follow-up polish

**Milestone: first post on the site not written by KK.** ← ready to test.

### Phase 3 — Community dynamics (in progress, 2026-07-21)
- [x] On-site notifications — comment/reply/post-like/comment-like, DB triggers,
      `/notifications` page + 🔔 unread badge (`db/migrations/005_notifications.sql`)
- [x] Member directory `/members` — field-chip filter + name search, cards link to
      an author's posts (`/voices?author=`); uses `public_member_profiles`. No new
      migration (view shipped in 004). 멤버 nav links added.
- [ ] Events module for offline meetups (RSVP on-site)
- [ ] Weekly automated email digest (needs Resend/email setup — do last)
- [ ] Reports + moderation queue

**Milestone: weekly rhythm runs without manual pushing.**

### Phase 4 — Launch & growth (Weeks 5–6: Aug 18 → Aug 31)
- Performance/SEO pass, analytics dashboard for KK
- Invite mechanics: members nominate peers
- Public launch push through KK's network

**Milestone: public launch, 100+ verified members, weekly active conversation.**

## Architecture notes (current state)

- **Hosting:** static site on Vercel, `vercel.json` `{cleanUrls:true}` serves
  `/community` from `community.html`, etc. All pages/assets at the repo root.
- **Member system (Phase 1, live):** `join.html` (`/join`, Google sign-in +
  onboarding), `me.html` (`/me`, profile), `admin-members.html` (`/admin-members`,
  KK's review panel). Shared `js/auth.js`, styling `member.css`. All client-side
  Supabase (anon key + RLS); no server code. Schema/policies in
  `db/migrations/002_members.sql`; existing-account backfill in `003_backfill_profiles.sql`.
- **APIs (Vercel serverless functions):** `api/waitlist.js` (public form),
  `api/admin/waitlist.js` (token-protected), `api/deploy-notify.js`
  (Vercel→Telegram). Shared DB helpers in `lib/waitlist-db.js`.
- **Discussion module:** `blog/discussion.js` + Supabase (comments, likes, Google
  auth, RLS; see `DISCUSSION_SETUP.md`). Shares the same auth identity as members.
- **Public CTAs:** "Join Waitlist / 가입신청" buttons point to `/join` (2026-07-21).
  Old waitlist form still lives at `/apply` (reachable by URL; not linked).
- **Ops docs:** `SETUP.md` (waitlist env), `DISCUSSION_SETUP.md` (Supabase comments),
  `MEMBERSHIP_SETUP.md` (member system).
