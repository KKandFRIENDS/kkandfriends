# KK & Friends VPS backend

This directory is the replacement for Supabase Auth, PostgREST, RLS and
Storage. It is deliberately parallel to the production application until data
migration and cutover have passed their approval gates.

## Current implementation stage

- Architecture and VPS capacity audit: complete.
- Docker topology, HTTPS proxy, API health check and Better Auth wiring: local.
- Community schema: implemented locally in `db/001_app_schema.sql`.
- Better Auth core schema: pinned locally in `db/000_auth_schema.sql`.
- Authenticated profile and admin member-review routes: implemented locally.
- Member posts, discussions, likes, events, RSVPs, notifications, nominations,
  reports and KK ORIGINAL routes: implemented locally.
- Authenticated local-volume image upload: implemented locally.
- Core lounge frontend (voices, member writing, member directory, profile,
  discussion) and KK ORIGINAL editor: moved to the VPS API locally.
- Join, events, notifications and nomination screens: moved to the VPS API
  locally.
- Admin member review, reports, nominations and analytics dashboards: moved to
  the VPS API locally.
- Public digest unsubscribe flow: moved to the VPS API locally.
- Membership application/approval notifications: moved into the VPS backend;
  delivery providers remain optional and cannot block membership state changes.
- Cron, digest email and Editorial Desk workers: pending.
- Supabase read-only export plus transactional VPS import and count
  reconciliation: completed against private VPS staging on 2026-09-25.
- Frontend adapter and staging cutover: pending.
- Private loopback-only staging deployment on the Hostinger VPS: verified on
  2026-09-25 with 62 users and 7 storage objects reconciled. Production
  deployment and DNS cutover: not performed.

## Local checks

```powershell
cd server
npm install
npm test
npm run check
```

Copy `.env.example` to `.env` only in a secure local/VPS environment. Never
commit `.env`, OAuth secrets, database passwords or an export of production
member data.

## Production layout

The intended VPS root is `/opt/kkf-community`. PostgreSQL and uploads use
explicit bind mounts under `/opt/kkf-community/data`; database port 5432 is not
published. Caddy is the only public container and terminates TLS for
`api.kkandfriends.com`.

Before the first start:

1. Set DNS for `api.kkandfriends.com` only after the staging API is ready.
2. Create root-owned `/opt/kkf-community/.env` with mode `0600`.
3. Create the data directories and give only the API upload directory to its
   unprivileged container UID.
4. Confirm ports 80/443 are not already allocated.
5. Configure and test encrypted off-host backup before importing member data.

On an empty PostgreSQL data directory, Compose applies `db/000_auth_schema.sql`
and `db/001_app_schema.sql` automatically and in that order. Existing database
volumes are never re-initialized by Docker; later schema changes must use an
explicit reviewed migration.

Do not point the production frontend at this service until every current
Supabase workflow has an API equivalent and the row/file reconciliation passes.

For a private pre-cutover smoke test, use `compose.staging.yaml`. It binds the
API only to VPS loopback port 4000, uses isolated data directories under
`/opt/kkf-community-staging`, and does not start Caddy or alter DNS.

