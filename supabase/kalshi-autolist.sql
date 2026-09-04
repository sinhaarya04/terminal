-- ============================================================================
-- E[X] Terminal — Kalshi AUTO-LISTER  (2026-09-04)
-- Combines Sam's catalog+oracle model with Aryan's automatic daily launch.
-- See docs/superpowers/specs/2026-09-04-kalshi-combined-design.md.
--
-- Sam's model lists board markets only when an admin hand-picks from the
-- catalog. This adds a hands-off promoter: a scheduled run picks the top
-- markets per club category (by Kalshi volume), politics excluded, and creates
-- them through Sam's SEEDED path (pq from catalog odds, listed=true, oracle-
-- linked). The manual admin picker stays as an override.
--
-- Two service-role twins of Sam's admin create fns (no is_admin gate, revoked
-- from clients — same pattern as his term_resolve_from_oracle), plus a driver
-- that selects + creates under a per-category quota and logs the day's count.
-- Idempotent + re-run safe. Apply after terminal-schema.sql.
-- ============================================================================

-- term_markets.source is added by the Kalshi mirror; the listed-guard trigger
-- depends on it. Ensure it exists so this file is self-contained on a fresh DB.
alter table public.term_markets add column if not exists source text;

-- Daily launch counter (was created ad-hoc by the ingest pipeline; define it
-- here so the schema is reproducible). One row per launch run.
create table if not exists public.term_ingest_log (
  id          bigint generated always as identity primary key,
  ran_at      timestamptz not null default now(),
  run_date    date not null default (now() at time zone 'America/New_York')::date,
  new_markets int not null,
  new_by_cat  jsonb,                       -- {"Sports":8,"Crypto":5,...}
  total_after int not null                 -- listed board markets after the run
);
alter table public.term_ingest_log enable row level security;
grant select on public.term_ingest_log to authenticated;
drop policy if exists term_ingest_log_read on public.term_ingest_log;
create policy term_ingest_log_read on public.term_ingest_log
  for select using (auth.role() = 'authenticated');
revoke insert, update, delete, truncate on public.term_ingest_log from anon, authenticated;

-- ---------- Kalshi category -> E[X] club category (null = excluded) ----------
-- Only these Kalshi categories are eligible for auto-listing. Politics /
-- Elections / World and anything unmapped return null and are never listed
-- (E[X] policy: no politics markets).
create or replace function public.term_kalshi_club_cat(p text)
returns text language sql immutable set search_path = public as $$
  select case p
    when 'Sports' then 'Sports'
    when 'Crypto' then 'Crypto'
    when 'Financials' then 'Stocks'
    when 'Companies' then 'Stocks'
    when 'Economics' then 'Econ'
    when 'Commodities' then 'Econ'
    when 'Science and Technology' then 'Tech'
    when 'Climate and Weather' then 'Weather'
    when 'Entertainment' then 'Culture'
    when 'Social' then 'Culture'
    else null
  end;
$$;

-- ---------- binary twin: system create one seeded board market ----------
-- Mirror of term_admin_create_from_kalshi WITHOUT the admin gate. Returns the
-- new code, or NULL on a skip (already added / closed / no odds / not eligible)
-- so the driver loop keeps going instead of aborting. Does NOT set source, so
-- the listed-guard trigger leaves listed=true (same as Sam's admin markets).
create or replace function public.term_autolist_from_kalshi(p_ticker text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_cat public.term_kalshi_catalog%rowtype;
  v_club text; v_code text;
  v_alpha text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_p numeric; v_off numeric; v_pqy numeric; v_pqn numeric; v_b numeric := 100;
  v_q text; i int;
begin
  select * into v_cat from public.term_kalshi_catalog where ticker = p_ticker;
  if v_cat.ticker is null then return null; end if;
  if v_cat.yes_odds is null then return null; end if;
  if lower(coalesce(v_cat.status,'')) in ('finalized','settled','closed') then return null; end if;
  if v_cat.added_market_code is not null
     and exists (select 1 from public.term_markets where code = v_cat.added_market_code) then
    return null; end if;
  v_club := public.term_kalshi_club_cat(v_cat.category);
  if v_club is null then return null; end if;

  v_p := greatest(0.02, least(0.98, v_cat.yes_odds/100.0));
  v_off := v_b * ln(v_p/(1-v_p));
  v_pqy := greatest(v_off,0); v_pqn := greatest(-v_off,0);

  loop
    v_code := 'KX-';
    for i in 1..4 loop v_code := v_code || substr(v_alpha,1+floor(random()*length(v_alpha))::int,1); end loop;
    exit when not exists (select 1 from public.term_markets where code = v_code);
  end loop;

  v_q := coalesce(nullif(v_cat.event_title,''), v_cat.title);
  if coalesce(v_cat.sub_title,'') <> '' then v_q := v_q || ' — ' || v_cat.sub_title; end if;

  insert into public.term_markets
    (code, owner, question, cat, closes_at, yes, is_private, listed,
     pq_yes, pq_no, sq_yes, sq_no, b, c0, event_ticker)
  values
    (v_code, null, v_q, v_club, v_cat.close_time, round(v_p*100), false, true,
     v_pqy, v_pqn, 0, 0, v_b, public.term_lmsr_cost(v_pqy,v_pqn,v_b), v_cat.event_ticker);

  update public.term_kalshi_catalog set added_market_code = v_code where ticker = p_ticker;
  return v_code;
end;
$$;
revoke all on function public.term_autolist_from_kalshi(text) from public, anon, authenticated;
grant execute on function public.term_autolist_from_kalshi(text) to service_role;

-- ---------- multi twin: system create one seeded N-outcome board market ------
-- Mirror of term_admin_create_multi_from_kalshi WITHOUT the admin gate. Whole
-- mutually-exclusive event -> one multi market, each outcome carrying its Kalshi
-- ticker so the oracle can map the settled winner. Returns code or NULL on skip.
create or replace function public.term_autolist_multi_from_kalshi(p_event_ticker text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_code text;
  v_alpha text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_b numeric := 100;
  v_n int; v_all_me boolean; v_any_linked boolean;
  v_cat text; v_club text; v_question text; v_closes_at timestamptz;
  v_sum numeric := 0; v_lo numeric; i int; r record;
  v_probs numeric[] := '{}'; v_names text[] := '{}';
  v_tickers text[] := '{}'; v_seed numeric[] := '{}';
begin
  select count(*),
         bool_and(coalesce(c.event_mutually_exclusive,false)),
         bool_or(c.added_market_code is not null
                 and exists (select 1 from public.term_markets m where m.code = c.added_market_code))
    into v_n, v_all_me, v_any_linked
    from public.term_kalshi_catalog c
   where c.event_ticker = p_event_ticker and lower(coalesce(c.status,'')) = 'active';
  if coalesce(v_n,0) < 2 then return null; end if;
  if not coalesce(v_all_me,false) then return null; end if;
  if coalesce(v_any_linked,false) then return null; end if;

  for r in
    select ticker, sub_title, title, yes_odds, event_title, category, close_time
      from public.term_kalshi_catalog
     where event_ticker = p_event_ticker and lower(coalesce(status,'')) = 'active'
     order by ticker
  loop
    if r.yes_odds is null then continue; end if;
    v_names   := array_append(v_names, coalesce(nullif(r.sub_title,''), nullif(r.title,''), r.ticker));
    v_tickers := array_append(v_tickers, r.ticker);
    v_probs   := array_append(v_probs, greatest(0.01, coalesce(r.yes_odds,0)/100.0));
    v_cat      := coalesce(v_cat, nullif(r.category,''));
    v_question := coalesce(v_question, nullif(r.event_title,''));
    if r.close_time is not null then
      v_closes_at := greatest(coalesce(v_closes_at, r.close_time), r.close_time);
    end if;
  end loop;

  v_n := array_length(v_names,1);
  if coalesce(v_n,0) < 2 then return null; end if;
  v_club := public.term_kalshi_club_cat(v_cat);
  if v_club is null then return null; end if;

  select sum(x) into v_sum from unnest(v_probs) x;
  for i in 1..v_n loop v_probs[i] := v_probs[i] / v_sum; end loop;
  for i in 1..v_n loop v_seed[i] := v_b * ln(v_probs[i]); end loop;
  select min(x) into v_lo from unnest(v_seed) x;
  for i in 1..v_n loop v_seed[i] := v_seed[i] - v_lo; end loop;

  v_question := coalesce(v_question, p_event_ticker);

  loop
    v_code := 'KM-';
    for i in 1..4 loop v_code := v_code || substr(v_alpha,1+floor(random()*length(v_alpha))::int,1); end loop;
    exit when not exists (select 1 from public.term_markets where code = v_code);
  end loop;

  insert into public.term_markets
    (code, owner, owner_handle, question, cat, closes_at, yes, is_private, is_multi, listed, b, c0, event_ticker)
  values
    (v_code, null, null, v_question, v_club, v_closes_at, 0, false, true, true, v_b,
     public.term_lmsr_cost_n(v_seed, v_b), p_event_ticker);

  for i in 1..v_n loop
    insert into public.term_market_outcomes (market_code, idx, name, pq, sq, kalshi_ticker)
    values (v_code, i, v_names[i], v_seed[i], 0, v_tickers[i]);
  end loop;

  update public.term_kalshi_catalog set added_market_code = v_code where event_ticker = p_event_ticker;
  return v_code;
end;
$$;
revoke all on function public.term_autolist_multi_from_kalshi(text) from public, anon, authenticated;
grant execute on function public.term_autolist_multi_from_kalshi(text) to service_role;

-- ---------- driver: promote up to p_quota new listings per club category -----
-- A "unit" is either one mutually-exclusive event (-> multi card) or one
-- non-exclusive event's top-volume market (-> binary card, one per event topic
-- so a strike ladder can't eat the whole quota). Units rank by Kalshi volume
-- within each club category; the top p_quota per category get created. Writes
-- one term_ingest_log row and returns the run summary.
create or replace function public.term_autolist_run(p_quota int default 8)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r record; v_code text; v_new int := 0; v_by jsonb := '{}'::jsonb; v_total int;
begin
  for r in
    with active as (
      select *, public.term_kalshi_club_cat(category) as club
        from public.term_kalshi_catalog
       where lower(coalesce(status,'')) = 'active'
         and added_market_code is null
         and (close_time is null or close_time > now())
         and public.term_kalshi_club_cat(category) is not null
    ),
    ev as (   -- mutually-exclusive events, one multi unit each
      select event_ticker as key, 'multi'::text as kind, club,
             max(coalesce(volume,0)) as vol
        from active
       where coalesce(event_mutually_exclusive,false)
       group by event_ticker, club
      having count(*) >= 2
    ),
    bin as (  -- non-exclusive: one binary unit per event (its top-volume market)
      select distinct on (event_ticker)
             ticker as key, 'binary'::text as kind, club, coalesce(volume,0) as vol
        from active
       where not coalesce(event_mutually_exclusive,false) and yes_odds is not null
       order by event_ticker, coalesce(volume,0) desc
    ),
    units as (select key,kind,club,vol from ev union all select key,kind,club,vol from bin),
    ranked as (
      select *, row_number() over (partition by club order by vol desc, key) rn from units
    )
    select key, kind, club from ranked where rn <= p_quota
  loop
    begin
      if r.kind = 'multi' then
        v_code := public.term_autolist_multi_from_kalshi(r.key);
      else
        v_code := public.term_autolist_from_kalshi(r.key);
      end if;
    exception when others then
      v_code := null;   -- a bad unit never aborts the whole run
    end;
    if v_code is not null then
      v_new := v_new + 1;
      v_by  := jsonb_set(v_by, array[r.club],
                 to_jsonb(coalesce((v_by ->> r.club)::int, 0) + 1), true);
    end if;
  end loop;

  select count(*)::int into v_total
    from public.term_markets where is_private = false and listed = true;

  insert into public.term_ingest_log (new_markets, new_by_cat, total_after)
  values (v_new, v_by, v_total);

  return jsonb_build_object('new_markets', v_new, 'new_by_cat', v_by, 'total_after', v_total);
end;
$$;
revoke all on function public.term_autolist_run(int) from public, anon, authenticated;
grant execute on function public.term_autolist_run(int) to service_role;
