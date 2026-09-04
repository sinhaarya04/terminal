-- ============================================================================
-- E[X] Terminal — Kalshi pg_cron schedule (reproducibility)
-- The live schedule on project dtgciwhecaqwnddzepiz. pg_cron fires in UTC; the
-- launch job is DST-proof by gating on America/New_York local hour instead of a
-- fixed UTC minute. Idempotent — cron.schedule upserts by jobname. Re-run safe.
--
-- The Authorization/apikey below is the PUBLIC publishable (anon) key — safe to
-- commit. The functions are deployed --no-verify-jwt, so this is just a bearer
-- the gateway accepts, not a secret. Service-role work happens inside the
-- functions via the platform-injected SUPABASE_SERVICE_ROLE_KEY.
-- ============================================================================

-- 1) Catalog refresh — hourly. Keeps odds + settlement status current so the
--    oracle can act. mode defaults to refresh (sync only, never lists).
select cron.schedule('kalshi-sync-hourly', '0 * * * *', $$
  select net.http_post(
    url:='https://dtgciwhecaqwnddzepiz.supabase.co/functions/v1/kalshi-sync',
    headers:=jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer sb_publishable_L4WzgBLPELIpbwDzCMup4Q_rGKEmZ2k',
      'apikey','sb_publishable_L4WzgBLPELIpbwDzCMup4Q_rGKEmZ2k'),
    body:='{}'::jsonb);
$$);

-- 2) Settlement oracle — every 15 min. Auto-resolves listed board markets whose
--    linked Kalshi market has finalized.
select cron.schedule('kalshi-resolve-15min', '*/15 * * * *', $$
  select net.http_post(
    url:='https://dtgciwhecaqwnddzepiz.supabase.co/functions/v1/kalshi-resolve',
    headers:=jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer sb_publishable_L4WzgBLPELIpbwDzCMup4Q_rGKEmZ2k',
      'apikey','sb_publishable_L4WzgBLPELIpbwDzCMup4Q_rGKEmZ2k'),
    body:='{}'::jsonb);
$$);

-- 3) Daily market launch — 11:50 America/New_York, DST-proof. Fires every hour
--    at :50 but only actually launches when it is 11:00 ET, so the drop stays
--    11:50 ET across DST without changing the global cron timezone. Calls the
--    driver directly (no HTTP): up to 8 new listings per club category, seeded,
--    logged to term_ingest_log. Equivalent to kalshi-sync?mode=launch&quota=8.
select cron.schedule('kalshi-launch-1150et', '50 * * * *', $$
  select public.term_autolist_run(8)
   where extract(hour from (now() at time zone 'America/New_York'))::int = 11;
$$);
