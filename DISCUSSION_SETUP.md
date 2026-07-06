# Discussion module — owner setup (one-time)

> Note: the existing `SETUP.md` covers the **Waitlist API** and is unchanged.
> This file covers the **comment/discussion module** only.

The discussion + share module is already coded into the site. It stays **dormant
and harmless** until you connect a Supabase project below. Nothing here needs a
build step — it's the same static-site + GitHub → Vercel flow as always.

Do these five steps in order. They take ~15 minutes.

---

## 1. Create a Supabase project & paste the public keys

1. Go to <https://supabase.com> → sign in → **New project** (the free tier is fine).
   Pick a name and a strong database password (you won't need the password again).
2. When it finishes provisioning, open **Project Settings → API**.
3. Copy two values into **`config.js`** at the repo root:
   - **Project URL** → `SUPABASE_URL`
   - **`anon` `public` key** → `SUPABASE_ANON_KEY`

> ⚠️ Copy the key labelled **`anon` / `public`** — **never** the `service_role`
> key. The anon key is meant to be public; it's safe because the database rules
> (RLS) in step 2 enforce every action on the server.

---

## 2. Create the tables + security rules

1. In Supabase, open the **SQL Editor** → **New query**.
2. Open **`db/migrations/001_comments.sql`** from this repo, copy its entire
   contents, paste into the editor, and click **Run**.
3. You should see "Success. No rows returned." That created the `comments`,
   `comment_likes`, and `post_likes` tables plus all the security policies.

---

## 3. Turn on Google sign-in

Readers can browse comments logged out, but posting/liking needs a Google login.

1. **Supabase → Authentication → Providers → Google → Enable.**
   Supabase shows a **Callback URL** like
   `https://<your-project-ref>.supabase.co/auth/v1/callback` — copy it.
2. In a new tab, go to **Google Cloud Console → APIs & Services → Credentials**
   (<https://console.cloud.google.com/apis/credentials>). Create a project if you
   don't have one.
3. **Create Credentials → OAuth client ID → Web application.**
   - Under **Authorized redirect URIs**, paste the Supabase Callback URL from step 1.
   - Create it, then copy the **Client ID** and **Client secret**.
4. Back in Supabase's Google provider screen, paste the **Client ID** and
   **Client secret**, and **Save**.

---

## 4. Make yourself the admin (enables Hide / Delete)

1. Deploy the site (push to `main`) or run it locally, open any post, and click
   **Sign in with Google** in the comment box. Sign in once.
2. In Supabase, go to **Authentication → Users**, find your row, and copy your
   **User UID** (a UUID like `a1b2c3d4-…`).
3. Paste that UID in **two** places, then save/re-run each:
   - **`config.js`** → `ADMIN_UID` (controls whether the Hide/Delete buttons
     *show* for you).
   - **`db/migrations/001_comments.sql`** → the line marked `-- ADMIN_UID_HERE`
     inside `is_admin()`. Copy just that `create or replace function …` block into
     the Supabase SQL Editor and **Run** it again (this is what actually *lets*
     you moderate — enforced server-side).

---

## 5. Allow your domain to sign in

1. **Supabase → Authentication → URL Configuration.**
2. Set **Site URL** to `https://www.kkandfriends.com`.
3. Under **Redirect URLs**, add both:
   - `https://www.kkandfriends.com/**`
   - `http://localhost:*/**` (only if you test locally)

Commit `config.js` (and the edited SQL) and push to `main`. Vercel redeploys and
the discussion module goes live under every post.

---

## Adding the module to a NEW post

One line, right before `</body>`. The slug is derived automatically from the
file name, so this snippet is **identical on every post** — nothing to customise:

```html
<!-- ── KK Discussion + Share (reusable include; slug auto-derived from URL) ── -->
<div id="kk-discussion"></div>
<script type="module" src="/blog/discussion.js"></script>
```

(If you ever want to pin a specific slug — e.g. after renaming a file — use
`<div id="kk-discussion" data-post-slug="your-slug"></div>`.)

---

## Notes & limits (v1)

- **Reactions:** like only (no dislike), per the spec.
- **Threading:** one level of replies (YouTube-style), by design.
- **Spam defense:** required Google auth + a hidden honeypot field + a 1–2000
  character server-side limit. Per-user rate-limiting is a deliberate v2 TODO
  (noted in the SQL) — not built yet.
- **Moderation:** as admin you get **Hide** (soft, reversible in the DB) and
  **Delete** (permanent) on every comment; regular users can delete only their own.
- **Kakao share:** works out of the box via a Kakao web link. For the richer
  Kakao share card, add a Kakao JavaScript key to `KAKAO_JS_KEY` in `config.js`
  and load the Kakao SDK — optional.
