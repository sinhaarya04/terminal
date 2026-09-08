-- ---------- sync bookkeeping ----------
-- One row per resumable job. kalshi-sync stores the Kalshi feed cursor it
-- stopped at so the next run continues instead of re-walking from the top.
--   supabase db query --linked -f supabase/sync-state.sql
create table if not exists public.term_sync_state (
  key        text primary key,
  value      text not null default '',
  updated_at timestamptz not null default now()
);
alter table public.term_sync_state enable row level security;
revoke all on public.term_sync_state from anon, authenticated;
-- the catalog sync runs every 20 minutes now: one walk of the feed takes a few
-- runs, and the cursor hand-off makes each run pick up where the last stopped
update cron.job set schedule = '*/20 * * * *' where jobname = 'kalshi-sync-hourly';
