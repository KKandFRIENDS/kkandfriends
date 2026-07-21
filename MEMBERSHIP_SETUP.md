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

## Not built yet (later phases)

- **Members-only content** (member-written posts): Phase 2. `is_member()` is
  already in the DB, ready to gate it.
- **Email on approval** (auto-notify a member when you approve them): Phase 3.
  For now, approval is silent — you'd email them manually if desired.
- **Kakao / Telegram login:** deferred to launch prep. Adding them is a config
  change; every account stays the same regardless of how they signed in.
