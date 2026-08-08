-- ============================================================================
--  kkandfriends.com — Research lab: twice-weekly topic selection.
--  Run ONCE in the Supabase SQL editor, after 014_korea_close_brief.sql.
--
--  Twice a week (Tue/Fri 08:00 KST) a Vercel cron scans the tape, generates
--  three candidate topics, scores them against the rubric in RESEARCH_PROMPT.md
--  and — if the winner clears 6.0 — writes a full research brief. Nothing is
--  sent until KK approves it from Telegram.
--
--  This migration adds only the run ledger. Two things it must guarantee:
--
--   1. One run per date. The unique key is the lock: a retry, a double cron
--      fire or a manual test on the same day cannot spend the model budget
--      twice or send KK two approval requests for the same research.
--
--   2. The report survives without approval. `report_md` is written BEFORE the
--      approval request goes out, so a missed notification costs a send, not
--      the day's work — that was the whole point of the v7 revision to the
--      approval gate. Nothing in this table is ever deleted on timeout.
--
--  Touched only by the cron and the decide endpoint with the service_role key.
--  RLS is on with a single admin-read policy, so KK can inspect runs from an
--  admin page later; members and anon see nothing.
-- ============================================================================

create table if not exists public.research_runs (
  id          uuid primary key default gen_random_uuid(),
  run_date    date not null,                                    -- KST date
  kind        text not null default 'topic_selection',
  status      text not null default 'running'
              check (status in (
                'running',            -- model calls in flight
                'held',               -- every candidate below threshold; no approval needed
                'awaiting_approval',  -- report ready, waiting on KK
                'approved',           -- KK approved; summary + report sent
                'rejected',           -- KK declined; archived, nothing sent
                'timed_out',          -- no answer inside the window; archived, nothing sent
                'failed'              -- the run itself broke
              )),

  -- Scored + ranked candidates, exactly as the orchestrator computed them.
  -- Kept as jsonb rather than parsed into columns because the rubric's metrics
  -- are config (research-config.json) and will change without a migration.
  candidates    jsonb,
  winner_title  text,
  winner_score  numeric(4,2),

  report_md         text,        -- full Obsidian-ready report — always written
  telegram_summary  text,        -- the <<<TELEGRAM_START>>> block

  -- Single-use secret behind the [승인]/[반려] buttons. The buttons are plain
  -- URLs (no Telegram webhook to register), so this token is what authorises
  -- the decision — it is cleared the moment a decision lands.
  approval_token  text unique,

  model_used   text,          -- which entry of the fallback chain answered
  fell_back    boolean not null default false,
  reminded_at  timestamptz,   -- reminder sent (once)
  decided_at   timestamptz,
  error        text,
  created_at   timestamptz not null default now(),

  unique (run_date, kind)
);

-- Finding the run behind a button press, and the followup cron's sweep for
-- runs that have been waiting too long.
create index if not exists research_runs_token_idx
  on public.research_runs (approval_token) where approval_token is not null;
create index if not exists research_runs_pending_idx
  on public.research_runs (created_at) where status = 'awaiting_approval';

alter table public.research_runs enable row level security;
revoke all on public.research_runs from anon, authenticated;

-- Admin-only read. Everything that writes here uses the service_role key,
-- which bypasses RLS entirely, so no INSERT/UPDATE policy is needed.
drop policy if exists "admin reads research runs" on public.research_runs;
create policy "admin reads research runs"
  on public.research_runs for select
  to authenticated
  using (public.is_admin());

grant select on public.research_runs to authenticated;
