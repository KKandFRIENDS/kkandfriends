# VPS staging status

Date: 2026-09-25 (Asia/Seoul)

## Deployment

- Host: `srv1619910`
- Project: `kkf-staging`
- Root: `/opt/kkf-community-staging`
- API exposure: HTTPS reverse proxy at `https://api.kkandfriends.com`;
  application port remains bound to VPS loopback at `127.0.0.1:4000`
- DNS: `api.kkandfriends.com` A record points to `72.62.193.188` with TTL 300;
  root and `www` records are unchanged
- Public frontend: Vercel production is switched to the VPS API
- Production member data: imported into private staging and reconciled
- Encrypted off-host backup: verified (AES-256-GCM; key retained locally only)

## Verified smoke tests

- API container: healthy
- PostgreSQL container: healthy
- `GET /health`: HTTP 200 with database ready
- `GET /api/v1/session` without a session: HTTP 401
- `GET /api/v1/posts` without membership: HTTP 401
- `GET /api/v1/original`: HTTP 200
- Application schema: 19 tables present
- Existing Hermes Agent and Editorial Runner containers remained running
- Reconciled rows: 62 auth users, 62 profiles, 89 posts, 2 comments,
  64 post likes, 3,230 notifications, 84 daily briefs, 15 editorial runs,
  12 editorial drafts and 34 editorial events
- Reconciled storage: 7 objects
- Google OAuth: isolated VPS client created; sign-in initiation verified HTTP
  200 with the Better Auth callback URL
- Kakao OAuth: isolated VPS REST API key created; sign-in initiation verified
  HTTP 200 with the Better Auth callback URL
- Runtime mode: production security settings, still bound to VPS loopback only
- Social account links: 62 restored (27 Google, 35 Kakao)
- Editorial Desk private API: deployed with a server-generated bearer token;
  unauthenticated requests return HTTP 401
- Editorial Desk storage read: 12 existing drafts returned from VPS PostgreSQL
- Editorial Desk write functions: `editorial_claim`, `editorial_finish` and
  `editorial_transition` installed in VPS PostgreSQL
- Caddy: pinned official `caddy:2.11.4-alpine` image; Let's Encrypt certificate
  issued successfully for `api.kkandfriends.com`
- External HTTPS smoke tests: health HTTP 200, anonymous session/posts HTTP
  401, public original feed HTTP 200
- External CORS preflight: HTTP 204 for `https://www.kkandfriends.com`, with
  credentials enabled
- External OAuth initiation: Google and Kakao both HTTP 200 and redirect only
  to their expected provider hosts
- Vercel production: `www.kkandfriends.com` serves the VPS-aware frontend;
  deployment `dpl_583ifZa7XGAKdPS8bVzGWkYVn81H` is ready
- Google browser callback: completed successfully; the restored approved member
  session and profile rendered from the VPS backend
- Kakao browser callback: completed successfully; the restored approved member
  session rendered and opened the member lounge from the VPS backend
- OAuth state handling: encrypted cookie strategy, 10-minute lifetime; state
  validation remains enabled and OAuth failures return to `/join` with a retry
  message instead of the API root
- Digest, global daily brief and Korea-close cron storage: VPS internal API;
  no Supabase calls remain in these production jobs
- Brief publication, recipient notifications and daily lock completion are one
  VPS PostgreSQL transaction
- Legacy Vercel application/approval notification endpoints: safe HTTP 410;
  active notifications are sent directly by the VPS profile routes
- Automation internal API: anonymous HTTP 401; authenticated context read HTTP
  200 (8 posts, 0 events, 44 opted-in recipients at verification time)
- Server test suite: 18 passed, 0 failed
- Frontend/full test suite: 69 passed, 0 failed

## Remaining gates

1. Observe the first scheduled digest and brief runs through VPS PostgreSQL.
2. Keep Supabase unchanged during the 14-day rollback window.
3. Clean up plaintext migration exports and remove the legacy Supabase secret
   only after explicit retention and rollback approval.

## Rollback triggers

- Database reconciliation mismatch
- Any anonymous access to member-only endpoints
- Authentication callback or account-linking failure
- Existing VPS workload degradation
- API health or database health failure
- Editorial internal API accepts an unauthenticated request
- Editorial draft/run counts diverge from the reconciled source snapshot

The VPS community stack is now the active production backend. Rollback remains
available while the prior Supabase project and legacy artifacts stay unchanged.
