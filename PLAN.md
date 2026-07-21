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
3. **Architecture:** migrate to Next.js on Vercel, Supabase as the single backend
   (auth, profiles, posts, comments, notifications). Strangler pattern — existing
   static pages keep working and move into the app one at a time.
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
- [x] Re-platform to Next.js 15 (static site under `/public`, APIs as route handlers,
      all URLs preserved with rewrites + canonical redirects)
- [x] Legal pages: `/terms` (이용약관), `/privacy` (개인정보처리방침), footer links,
      apply-form consent note
- [ ] Verify production deploy on Vercel (framework preset switches to Next.js
      automatically; env vars unchanged)

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

### Phase 2 — Member voices (Week 3: Aug 4 → Aug 10)
- Member post editor (Korean-friendly rich text, images, drafts)
- Categories: 시장/매크로 · 크립토/디지털자산 · 정책/규제 · 커리어 · 자유
- "Friends' Voices" section beside KK's THOUGHTS (visually distinct)
- Comments/likes unified across KK posts and member posts; home feed

**Milestone: first post on the site not written by KK.**

### Phase 3 — Community dynamics (Week 4: Aug 11 → Aug 17)
- Notifications (replies, likes, new posts) + email digest
- Weekly automated newsletter (KK posts + best member content)
- Member directory with search by field
- Events module for offline meetups (RSVP on-site)
- Moderation at scale: reports, suspension, audit trail

**Milestone: weekly rhythm runs without manual pushing.**

### Phase 4 — Launch & growth (Weeks 5–6: Aug 18 → Aug 31)
- Performance/SEO pass, analytics dashboard for KK
- Invite mechanics: members nominate peers
- Public launch push through KK's network

**Milestone: public launch, 100+ verified members, weekly active conversation.**

## Architecture notes (current state)

- **Framework:** Next.js 15 (App Router), deployed on Vercel. Static legacy pages
  live in `/public` and are served via clean-URL rewrites in `next.config.mjs`;
  they migrate into `app/` as they gain dynamic features.
- **APIs:** `app/api/waitlist` (public form), `app/api/admin/waitlist`
  (token-protected), `app/api/deploy-notify` (Vercel→Telegram webhook).
  Shared DB helpers in `lib/waitlist-db.js` (lazy pool).
- **Discussion module:** `/public/blog/discussion.js` + Supabase
  (comments, likes, Google auth, RLS; see `DISCUSSION_SETUP.md`). Will be folded
  into the unified member system in Phase 1–2.
- **Ops docs:** `SETUP.md` (waitlist env vars), `DISCUSSION_SETUP.md` (Supabase).
