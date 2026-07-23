# Membership system — owner setup (Phase 1)

> Covers the **member accounts + profiles + admission** system.
> `SETUP.md` (waitlist API) and `DISCUSSION_SETUP.md` (comments) are unchanged.

The member system is coded and **dormant until you apply one SQL migration**.
It reuses the same Supabase project, Google sign-in, and admin UID you already
set up for the discussion module — so most of the groundwork is done.

Same flow as always: no build step, static pages + Supabase, GitHub → Vercel.

---

## What this adds

- **`/join`** — visitors sign in with Google, then fill a profile choosing how
  they appear (real name **or** professional pseudonym), their field, and a note
  to you. Their application lands as **pending**.
- **`/admin-members`** — you sign in with your Google account and review pending
  applicants: **approve / decline / suspend**, and toggle the **Founding Member**
  badge. You see the private fields (real name, email, note) here only.
- **`/me`** — an approved member's own profile page (view + edit).

The identity model: **verified professional, chosen identity.** Real name is
always collected for your review; the member picks what the *site* shows.

---

## 1. Apply the migration (required — ~2 minutes)

1. Supabase → **SQL Editor** → **New query**.
2. Open **`db/migrations/002_members.sql`** from this repo, copy its entire
   contents, paste, and **Run**.
3. Expect "Success. No rows returned." That created the `profiles` table, the
   auto-provision trigger, the RLS policies, and the admin approve/decline
   functions.

> Prerequisite: `001_comments.sql` must already be applied (it is — the
> discussion module uses it). `002` reuses its `is_admin()` function, so your
> admin UID (`config.js` → `ADMIN_UID`, already set) works here automatically.

## 2. Confirm Google sign-in + redirect URLs (already done)

Google auth and the redirect URLs were configured in `DISCUSSION_SETUP.md`
(steps 3 & 5). The wildcard `https://www.kkandfriends.com/**` already covers
`/join`, `/me`, and `/admin-members` — **nothing new to add.**

## 3. Test the full loop (before going live)

Do this once the migration is applied:

1. Open **`/join`** in a normal browser window, sign in with a *test* Google
   account (not your admin one), and submit the profile form. You should see the
   **심사 중 (pending)** state.
2. Open **`/admin-members`** signed in as **your admin account**. The test
   applicant appears under **심사 중**. Click **승인 (approve)**, and optionally
   **Founding 지정**.
3. Back in the test account, reload **`/me`** — it now shows **승인됨** and the
   Founding badge if you set it.

If `/admin-members` says "not admin", it shows the signed-in UID — make sure it
matches `ADMIN_UID` in `config.js` and the UID inside `is_admin()`
(`001_comments.sql`). They should already match from the discussion setup.

## 4. Go live (when you're ready — a later step)

Until you do this, the member flow is reachable only by typing the URLs, so it
won't disturb the current waitlist funnel.

- **Repoint the CTAs:** change the "Join Waitlist / 가입신청" buttons across the
  site from `/apply` to `/join`. (Ask Claude to do this sweep — it's a handful
  of files.)
- **Founding cohort:** the existing waitlist (from `/apply`, stored in Vercel
  Postgres) is your pre-launch interest list. When one of those people signs in
  at `/join` with the same email, flag them **Founding** in `/admin-members`.
  A bulk email-match backfill can be scripted later from a waitlist export.

---

## Security model (how it's safe on a public site)

Same principle as the discussion module — the anon key is public, and the
database enforces everything:

- Profiles are created **only** by a server-side trigger; nobody can insert a
  pre-approved row through the API.
- **RLS** lets a member read/edit only their **own** row; you (admin) read all.
- `status` and the Founding badge can be changed **only** through
  `SECURITY DEFINER` functions guarded by `is_admin()`, plus column-level GRANTs
  that stop members writing those columns directly. A member cannot approve
  themselves even if they craft their own API call.
- `service_role` key is never used anywhere in the repo.

---

# Phase 2 — Friends' Voices (member posts)

Members can now write posts, read only by other **approved members** (your own
THOUGHTS stay public). Posts **publish instantly**; you can hide/remove any of
them. One more migration turns this on.

## Apply the Phase 2 migration (required — ~1 minute)

Supabase → **SQL Editor** → **New query** → paste **all** of
`db/migrations/004_member_posts.sql` → **Run**. Expect "Success. No rows returned."

That creates the `member_posts` table + its RLS, the `set_post_hidden` admin
function, a members-only re-scope of member-post **comments**, and the
`public_member_profiles` view (a safe, name/field/founding-only subset of member
profiles so bylines can show — private fields stay hidden).

> Prerequisite: `002_members.sql` must already be applied (it is). `004` reuses
> its `is_member()` / `is_admin()` / `touch_updated_at()`.

## How it works

- **`/voices`** — the members-only reading room (list + individual posts). Guests
  and pending applicants can't read it.
- **`/write`** — the editor (approved members only): title, category, a Markdown
  body with a formatting toolbar + live preview, **임시저장 (draft)** and
  **발행 (publish)**. Drafts are visible only to their author.
- **Moderation:** on any member's post you'll see admin **숨기기 / 삭제** controls.
- **Safety:** member posts are written in Markdown and rendered by an
  HTML-escaping renderer (`js/markdown.js`) — authors cannot inject scripts;
  `javascript:`/`data:` links are rejected.

Links to the lounge appear on `/me` and the post-approval screen. Images are
supported by pasting an image URL (`![](https://…)`); drag-and-drop upload is a
planned follow-up (needs a Supabase Storage bucket).

---

# Phase 3 — Notifications (part 1 of community rhythm)

Members now get an on-site **알림 (notification)** when someone engages with their
content: comments on their post, replies to their comment, or likes their post/
comment. A 🔔 badge on the member nav shows the unread count.

## Apply the Phase 3 notifications migration (required — ~1 minute)

Supabase → **SQL Editor** → **New query** → paste all of
`db/migrations/005_notifications.sql` → **Run** → "Success. No rows returned."

That adds a `notifications` table (each member reads only their own) and three
database triggers that create a notification whenever a comment, reply, or like
lands on your content — all server-side, no email needed. Prereq: 004 applied.

Page: **`/notifications`**. It marks items read when opened.

## Member directory (no migration)

**`/members`** lists approved members (name / field / founding badge), with a
field-chip filter and name search; each card links to that member's posts. It
uses the `public_member_profiles` view shipped in migration 004 — nothing to run.

## Events / offline meetups — apply migration 006

Supabase → **SQL Editor** → paste `db/migrations/006_events.sql` → **Run**.
Creates `events` + `event_rsvps` with RLS: **you (admin) create/edit/cancel**
events; **approved members RSVP** and see who's coming.

Page: **`/events`**. As admin you'll see a **＋ 새 모임** button (title, date-time,
location, capacity, description); members see **참석 신청** with a live count.

---

# Kakao login — owner setup ✅ LIVE (2026-07-23)

The **카카오로 계속하기** button is on every sign-in surface and Kakao is enabled in
Supabase — this is done and working. The steps below are the **actual** path that
worked; the Kakao Developers console was redesigned in 2024–25, so several things moved
from where the old guides put them. Written down here so we never re-hunt for them.

> **Two gotchas that cost us an afternoon — read these first:**
> 1. **Redirect URI moved.** It is *not* on 카카오 로그인 → 일반/고급 anymore. It now
>    lives inside a **REST API key** under **앱 설정 → 플랫폼 키**.
> 2. **Supabase always requests 3 Kakao scopes** — `profile_nickname`, `account_email`,
>    **and `profile_image`**. Every one of them must be turned on in 동의항목, or Kakao
>    rejects the whole login with **KOE205** (it names the missing one on the error page
>    under "왜 에러가 발생하나요?"). `account_email` needs a **Biz App** (below);
>    `profile_image` does not but is easy to forget.

## 1. Create a Kakao Developers app
1. **[developers.kakao.com](https://developers.kakao.com)** → log in → **내 애플리케이션 →
   애플리케이션 추가하기**. Name `KK & Friends`, 회사명 `KK`, 카테고리 금융.
2. **앱 설정 → 일반** → set **앱 대표 도메인** to `https://www.kkandfriends.com`
   (the new console uses this instead of a separate "Web 플랫폼 등록").

## 2. Convert to a Biz App (required for member emails)
A personal app shows `account_email` as **권한 없음** and cannot request it, which triggers
KOE205. Converting to a **개인 개발자 비즈 앱** unlocks it — free, no business number needed.
3. **앱 설정 → 일반** → scroll to **비즈니스 정보** → **개인 개발자 비즈 앱** →
   **[카카오비즈니스 통합 서비스 약관 동의]**. Pick purpose **"이메일 필수 동의"**, agree to
   the terms (본인인증 is skipped if your Kakao account is already verified). The header
   badge flips to **비즈 앱**.

## 3. Turn on Kakao Login + the three consent items
4. **제품 설정 → 카카오 로그인 → 일반 → 사용 설정 ON**.
5. **제품 설정 → 카카오 로그인 → 동의항목** — set **all three** scopes Supabase requests:
   - **닉네임** (`profile_nickname`) → **필수 동의**
   - **카카오계정(이메일)** (`account_email`) → **선택 동의** (available after the Biz App step)
   - **프로필 사진** (`profile_image`) → **선택 동의**  ← easy to miss; without it = KOE205
   Each asks for a 동의 목적 (any honest one-liner, e.g. "회원 프로필 표시").

## 4. Register the Redirect URI + get the two keys (both live in a REST API key)
6. **앱 설정 → 플랫폼 키** → **＋ REST API 키 추가**. Give it a name (e.g. `웹 로그인`), and on
   that same add/edit page:
   - **카카오 로그인 리다이렉트 URI** → add exactly (then click the **＋**):
     `https://pahdwduqxxiugqjkbhvq.supabase.co/auth/v1/callback`
   - **클라이언트 시크릿** → leave enabled (사용함, the default).
   - **저장**.
7. Open that key (플랫폼 키 → the key → 수정) and copy two values:
   - the key's **REST API 키** value → this is the **Client ID** for Supabase.
   - **클라이언트 시크릿 → 카카오 로그인** 줄의 **코드** → the **Client Secret** for Supabase
     (NOT the 비즈니스 인증 code). Use **this specific key** in Supabase — the Redirect URI
     is registered on it, so the default/대표 key will not work.

## 5. Enable Kakao in Supabase
8. Supabase → **Authentication → Sign In / Providers → Kakao → Enable**.
   - **REST API Key** → the key value from step 7.
   - **Client Secret Code** → the 카카오 로그인 secret from step 7.
   - **Save.** (Redirect URLs already cover it — the `https://www.kkandfriends.com/**`
     wildcard set up for Google works for Kakao too.)

## Notes on how the code requests scopes
`js/auth.js` `signInWithKakao()` passes `scopes: "profile_nickname"`, but Supabase's
GoTrue Kakao provider **always** adds `account_email` + `profile_image` on top — you
cannot strip them client-side, which is exactly why all three must be enabled in 동의항목.

Done — a member who joins with Kakao is the same kind of account as a Google member.
Email may still be blank if they decline the optional email consent (that only means no
weekly digest for them).

---

# Admin analytics + Member nominations (Phase 4 polish)

## Admin analytics — no migration
**`/admin-analytics`** (admin only) reads the existing tables via RLS and aggregates
in-browser: KPI cards (approved/founding, pending, posts, comments+likes), the admission
funnel, weekly new signups + weekly activity (last 8 weeks), field distribution, and
popular-post / active-member leaderboards. Nothing to run — just open it. Linked from the
other admin pages' top nav.

## Member nominations — apply migration 011
Approved members can nominate a peer at **`/nominate`** (linked from `/members` and `/me`);
each nomination lands in an admin queue at **`/admin-nominations`** where KK marks it
**연락함 / 가입 완료 / 보류** and can jot a private note. Admission stays gated — KK still
decides — nominations just feed the pipeline.

Supabase → **SQL Editor** → paste all of `db/migrations/011_nominations.sql` → **Run** →
"Success. No rows returned." Prereq: `002_members.sql` (applied). RLS: a member sees only
their **own** nominations; the admin sees all; status/notes are admin-only writes (column
GRANTs stop a member from self-marking a nominee as joined).

---

## Not built yet (later phases)

- ~~**Email on approval**~~ — **DONE** (`api/notify-approval.js`).
- ~~**Image upload**~~ — **DONE** (`db/migrations/010_storage_post_images.sql`).
- ~~**Kakao login**~~ — **DONE & LIVE** (see the Kakao section above).
- ~~**Admin analytics / member nominations**~~ — **DONE** (`/admin-analytics`,
  `/nominate` + `/admin-nominations`, migration 011).
- ~~**Telegram login**~~ — **CANCELLED (2026-07-23)**. Google + Kakao cover the
  audience; the custom build isn't worth it. The login surface is complete.
