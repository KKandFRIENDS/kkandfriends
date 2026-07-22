# Weekly email digest — owner setup

The digest engine is coded and **dormant** until you connect an email service.
When on, every **Monday ~09:00 KST** it emails approved members a round-up of the
week's new posts + upcoming events, each with a one-click 수신거부 (unsubscribe)
link. Members can also toggle it in `/me → 프로필 수정`.

Do these in order. Step 2 (domain verify) is the slow one — DNS can take a while,
so start it first and come back.

---

## 1. Apply the migration (~1 min)

Supabase → **SQL Editor** → paste `db/migrations/008_email_digest.sql` → **Run**.
Adds a per-member opt-in flag + unsubscribe token + the `unsubscribe_digest`
function. (Prereq: 002 applied.)

## 2. Create a Resend account & verify your domain (the slow part)

1. Sign up at **[resend.com](https://resend.com)** (free tier is plenty to start).
2. **Domains → Add Domain →** `kkandfriends.com`.
3. Resend shows a few **DNS records** (SPF/DKIM). Add them where your domain's DNS
   is managed (the same place your site's domain points to Vercel). Save.
4. Wait for Resend to show the domain **Verified** (minutes to a few hours).
5. **API Keys → Create API Key** → copy it (starts with `re_…`).

## 3. Get your Supabase service key

Supabase → **Project Settings → API** → copy the **`service_role`** secret.
⚠️ This key bypasses all security rules — it is used **only** server-side in the
cron function. Never put it in `config.js` or any page.

## 4. Set the environment variables in Vercel

Vercel → your project → **Settings → Environment Variables** → add (Production):

| Name | Value |
|------|-------|
| `SUPABASE_SERVICE_ROLE_KEY` | the `service_role` secret from step 3 |
| `RESEND_API_KEY` | the `re_…` key from step 2 |
| `RESEND_FROM` | `KK & Friends <noreply@kkandfriends.com>` (must be your verified domain) |
| `CRON_SECRET` | a long random string (e.g. `openssl rand -hex 24`) — protects the endpoint |

(Optional: `SITE_URL` if ever different from `https://www.kkandfriends.com`.)

Then **Redeploy** so the function picks up the vars.

## 5. It's on

- The cron in `vercel.json` (`0 0 * * 1`) runs the digest weekly.
- It **skips sending** if there were no new posts and no upcoming events — no empty emails.
- **Manual test:** visit **Vercel → your project → Cron Jobs** and hit *Run*, or call
  `GET https://www.kkandfriends.com/api/cron/digest` with header
  `Authorization: Bearer <your CRON_SECRET>`. The response shows how many were sent.

> Vercel plan note: Cron Jobs are available on all plans; a weekly schedule is well
> within Hobby limits. Timing may be delayed by a few minutes — that's normal.

---

## Compliance note (KR)

The digest is a **community/service** email to members who joined and can opt out
anytime (link in every email + `/me`). It is not advertising. Keep it that way —
if it ever becomes promotional, Korean 정보통신망법 requires prior consent, a
`(광고)` subject tag, and clear opt-out. The unsubscribe link + opt-in flag are
built in.
