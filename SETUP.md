# Backend setup — Waitlist API

The site is now a static frontend **plus** a small serverless backend that runs on Vercel.
Code is done. You need to do three things in the Vercel dashboard before it works in production.

## 1. Create the database (required)

1. Vercel dashboard → your **kkandfriends** project → **Storage** tab → **Create Database** → **Postgres**.
2. Accept the defaults, create it, and **Connect** it to this project.
   Vercel automatically injects the connection env vars (`POSTGRES_URL`, etc.) — you don't copy anything.
3. The `waitlist` table is created automatically on the first submission (no migration to run).

## 2. Set the admin token (required to view applicants)

Project → **Settings** → **Environment Variables** → add:

| Name          | Value                          | Notes                              |
|---------------|--------------------------------|------------------------------------|
| `ADMIN_TOKEN` | *(a long random string)*       | Used to read `/admin`. Keep secret. |

Generate one, e.g. in a terminal: `openssl rand -hex 24`

## 3. Email notifications (optional — skip to launch faster)

If unset, applications are still saved; you just won't get emails. To enable:

| Name             | Value                                            |
|------------------|--------------------------------------------------|
| `RESEND_API_KEY` | API key from [resend.com](https://resend.com)    |
| `RESEND_FROM`    | `KK & Friends <noreply@kkandfriends.com>` (verified domain) |
| `ADMIN_EMAIL`    | `kk@bit-planet.kr` (where new-applicant alerts go) |

Resend requires verifying the `kkandfriends.com` domain (add DNS records they provide).

---

## After setting env vars
**Redeploy** (Deployments → ⋯ → Redeploy) so the functions pick up the new variables.

## How to use

- **Public form:** https://www.kkandfriends.com/apply — all "Join Waitlist / Apply" buttons point here.
- **Admin view:** https://www.kkandfriends.com/admin — enter `ADMIN_TOKEN`, see the table, download CSV.

## Files

| Path                        | Purpose                                            |
|-----------------------------|----------------------------------------------------|
| `api/waitlist.js`           | `POST /api/waitlist` — accepts & stores an application |
| `api/admin/waitlist.js`     | `GET /api/admin/waitlist` — token-protected list / CSV |
| `lib/waitlist-db.js`        | Shared DB schema, validation, email helpers        |
| `apply.html`                | Public application form (`/apply`)                 |
| `admin.html`                | Admin viewer (`/admin`)                            |

## Note on local testing
Plain `git push` deploys to Vercel as before. To test the API on your machine you'd need
`npm i -g vercel` then `vercel dev` (it connects to the cloud Postgres). The static pages
render fine locally on their own, but `/api/*` only runs under Vercel.
