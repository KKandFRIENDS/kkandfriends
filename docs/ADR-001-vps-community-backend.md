# ADR-001: Replace Supabase with the Hostinger VPS backend

- Status: Accepted for implementation; production cutover not authorized
- Date: 2026-09-24
- Owner: KK

## Decision

Remove the application's dependency on Supabase Cloud and Supabase software.
Keep the public website on Vercel during the migration, store owner-published
KK ORIGINAL content in GitHub, and move all stateful community services to the
existing Hostinger VPS.

The VPS backend will use:

- Caddy for public HTTPS and reverse proxying;
- a Node.js/Fastify API for every authorization and data-access decision;
- Better Auth for Google and Kakao OAuth and secure server-side sessions;
- PostgreSQL for members, profiles, posts, comments, likes, notifications,
  events, nominations, reports, editorial state and job state;
- a bind-mounted upload directory for avatars and post images;
- encrypted off-host backups for PostgreSQL and uploads.

Supabase SDK, Auth, PostgREST, RLS, Storage and service-role keys will not remain
in the final application.

## Why this design

The measured VPS has 2 vCPU, 7.8 GiB RAM (6.3 GiB available) and 54 GiB free
disk. A full self-hosted Supabase stack is unnecessarily large for it. A lean
PostgreSQL + Node API stack keeps the working set small and makes authorization
explicit and testable.

Git is suitable for owner-authored public articles. It is not suitable for
member identities, private profiles, drafts, comments, notifications or
concurrent writes. Those stay in a transactional database.

## Component and data flow

```text
www.kkandfriends.com (Vercel static pages)
  | credentials: include
  v
api.kkandfriends.com (Caddy on Hostinger VPS)
  +-- /api/auth/*       Better Auth: Google and Kakao OAuth
  +-- /api/v1/*         Fastify community API
  +-- /uploads/*        validated public images
          |
          +-- PostgreSQL (private Docker network only)
          +-- /srv/kkf/uploads (persistent bind mount)

GitHub
  +-- public KK ORIGINAL Markdown and images
  +-- commit to main -> Vercel production deployment
```

## Functional scope to migrate

| Domain | Current source | VPS target |
|---|---|---|
| Login/session | Supabase Auth | Better Auth + PostgreSQL |
| Member review/profile | `profiles` + RPC | `/api/v1/profile`, `/api/v1/admin/members` |
| Lounge posts | `member_posts` | `/api/v1/posts` |
| Comments/likes | `comments`, `comment_likes`, `post_likes` | `/api/v1/comments`, `/api/v1/likes` |
| Notifications | DB triggers + `notifications` | API transactions + `notifications` |
| Events/RSVP | `events`, `event_rsvps` | `/api/v1/events` |
| Nominations | `nominations` | `/api/v1/nominations` |
| Reports/moderation | `reports` + RPC | `/api/v1/reports`, admin moderation routes |
| Images/avatars | Supabase Storage | validated VPS upload volume |
| Email digest | Vercel cron + Supabase REST | VPS scheduled worker + PostgreSQL |
| Daily briefs | Vercel cron + Supabase REST | VPS scheduled worker + PostgreSQL |
| Editorial Desk | Supabase tables/RPC | VPS PostgreSQL transactions |
| KK ORIGINAL | proposed Supabase table | GitHub Markdown, no database |

## Authentication migration

Existing members keep their UUIDs. The migration imports Supabase `auth.users`
and `auth.identities` into Better Auth's user/account tables. Google and Kakao
provider subject IDs are the stable link. Existing Supabase sessions are not
portable; every member signs in again once after cutover.

Kakao accounts without an email retain their provider subject as identity and
use a non-deliverable internal address. The private `contact_email` in the
member profile remains the address used for communications.

## Authorization model

The browser receives no database key. Every route resolves the secure session
cookie and checks one of these roles:

- visitor: published public content only;
- applicant: own application/profile only;
- member: approved-member content and own writes;
- admin: member review, moderation, events and editorial actions.

Database roles cannot be reached from the public network. Parameterized SQL,
transactions, body-size limits, exact CORS origins, CSRF-safe session cookies,
upload MIME inspection and endpoint rate limits are mandatory.

## Reliability and backups

- PostgreSQL and uploads use explicit host bind mounts, never anonymous volumes.
- Nightly logical dump plus upload snapshot; encrypt before off-host transfer.
- Retain daily 14 days, weekly 8 weeks, monthly 12 months.
- Restore tests run against a disposable database at least quarterly.
- Health checks cover API, database and writable upload storage.
- Existing Supabase stays unchanged and read-only during the rollback window.

## Migration sequence

1. Build and test the VPS backend locally with synthetic data.
2. Create an encrypted full Supabase export; do not mutate production.
3. Import into a parallel VPS staging database and reconcile row/file counts.
4. Point a staging frontend at the VPS and test every role and workflow.
5. Freeze writes briefly, take a final delta export, import and reconcile.
6. Change frontend API configuration and OAuth callbacks; deploy.
7. Verify public, member, admin, email and worker paths from outside the VPS.
8. Keep Supabase read-only for at least 14 days. Removal requires separate,
   explicit authorization after backup restore verification.

## Rollback

Restore the prior frontend deployment and OAuth callback settings. Supabase
remains intact during the rollback window. No production Supabase table, user,
storage object or secret is deleted as part of cutover.

## Trade-offs

- Benefit: no Supabase vendor/application dependency and no new hosting bill.
- Benefit: all member data stays on infrastructure controlled by KK.
- Cost: KK owns patching, monitoring, TLS, database maintenance and recovery.
- Cost: one forced member re-login at cutover.
- Constraint: this single VPS is not highly available. As the community grows,
  revisit a second backup host and database replication before adding features.

