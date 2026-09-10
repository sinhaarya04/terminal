-- Liquidity b 100 -> 400: apply once with
--   supabase db query --linked -f supabase/liquidity-b.sql
-- ---------- liquidity ----------
-- Price impact scales as 1/b. At 100 a $25 order moved a fresh 50/50 market
-- 11 points; at 400 it moves about 3 and a $100 order about 11. Payout is
-- parimutuel from the pot, so b bounds nothing but sensitivity. Every create
-- RPC reads this; the client mirrors it as DEFAULT_B in src/lib/lmsr.ts.
create or replace function public.term_default_b() returns numeric
language sql immutable as $$ select 400::numeric $$;
alter table public.term_markets alter column b set default 400;

create or replace function public.term_default_b() returns numeric
language sql immutable as $$ select 400::numeric $$;

create or replace function public.term_create_market(
  p_question text, p_cat text, p_closes text, p_yes numeric, p_closes_at timestamptz default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_code text;
  v_alpha text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_handle text;
  v_p numeric := greatest(0.02, least(0.98, p_yes / 100.0));
  v_off numeric;
  v_pqy numeric; v_pqn numeric; v_b numeric := public.term_default_b();
  i int;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select handle into v_handle from public.term_profiles where id = auth.uid();
  v_handle := coalesce(v_handle, 'member');
  loop
    v_code := 'EX-';
    for i in 1..4 loop
      v_code := v_code || substr(v_alpha, 1 + floor(random() * length(v_alpha))::int, 1);
    end loop;
    exit when not exists (select 1 from public.term_markets where code = v_code);
  end loop;
  -- opening odds arrive as phantom pricing shares; they never receive payout
  v_off := v_b * ln(v_p / (1 - v_p));
  v_pqy := greatest(v_off, 0);  v_pqn := greatest(-v_off, 0);
  insert into public.term_markets
    (code, owner, owner_handle, question, cat, closes, closes_at, yes, is_private,
     pq_yes, pq_no, sq_yes, sq_no, b, c0)
  values
    (v_code, auth.uid(), v_handle, p_question, coalesce(nullif(p_cat,''),'Private'),
     nullif(p_closes,''), p_closes_at, round(v_p * 100), true,
     v_pqy, v_pqn, 0, 0, v_b, public.term_lmsr_cost(v_pqy, v_pqn, v_b));
  insert into public.term_activity (market_code, handle, kind) values (v_code, v_handle, 'create');
  return v_code;
end;
$$;

create or replace function public.term_upsert_public_market(
  p_code text, p_question text, p_cat text, p_yes numeric)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_p numeric := greatest(0.02, least(0.98, p_yes / 100.0));
  v_off numeric;
  v_pqy numeric; v_pqn numeric; v_b numeric := public.term_default_b();
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  -- seed the engine from the card's displayed price, like private creation;
  -- unseeded quantities filled the first bet on an "82%" outcome at 50/50
  v_off := v_b * ln(v_p / (1 - v_p));
  v_pqy := greatest(v_off, 0);  v_pqn := greatest(-v_off, 0);
  insert into public.term_markets
    (code, owner, question, cat, yes, is_private, pq_yes, pq_no, sq_yes, sq_no, b, c0)
  values
    (p_code, null, p_question, coalesce(nullif(p_cat,''),'Market'),
     round(v_p * 100), false,
     v_pqy, v_pqn, 0, 0, v_b, public.term_lmsr_cost(v_pqy, v_pqn, v_b))
  on conflict (code) do nothing;
end;
$$;

create or replace function public.term_admin_create_board_market(
  p_question text, p_cat text, p_yes numeric, p_closes_at timestamptz default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v_admin boolean; v_code text;
  v_alpha text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_p numeric := greatest(0.02, least(0.98, p_yes/100.0));
  v_off numeric; v_pqy numeric; v_pqn numeric; v_b numeric := public.term_default_b(); i int;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  select is_admin into v_admin from public.term_profiles where id = v_uid;
  if not coalesce(v_admin,false) then raise exception 'admins only'; end if;
  loop
    v_code := 'BX-';
    for i in 1..4 loop v_code := v_code || substr(v_alpha,1+floor(random()*length(v_alpha))::int,1); end loop;
    exit when not exists (select 1 from public.term_markets where code = v_code);
  end loop;
  v_off := v_b * ln(v_p/(1-v_p)); v_pqy := greatest(v_off,0); v_pqn := greatest(-v_off,0);
  insert into public.term_markets
    (code, owner, question, cat, closes_at, yes, is_private, pq_yes, pq_no, sq_yes, sq_no, b, c0)
  values (v_code, null, p_question, coalesce(nullif(p_cat,''),'Board'), p_closes_at,
     round(v_p*100), false, v_pqy, v_pqn, 0, 0, v_b, public.term_lmsr_cost(v_pqy,v_pqn,v_b));
  return v_code;
end;
$$;

create or replace function public.term_admin_create_from_kalshi(
  p_ticker text, p_closes_at timestamptz default null)
returns text language plpgsql security definer set search_path to 'public' as $function$
declare
  v_uid uuid := auth.uid();
  v_admin boolean;
  v_cat public.term_kalshi_catalog%rowtype;
  v_code text;
  v_alpha text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_p numeric; v_off numeric; v_pqy numeric; v_pqn numeric; v_b numeric := public.term_default_b();
  v_q text; i int;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  select is_admin into v_admin from public.term_profiles where id = v_uid;
  if not coalesce(v_admin,false) then raise exception 'admins only'; end if;

  select * into v_cat from public.term_kalshi_catalog where ticker = p_ticker;
  if v_cat.ticker is null then raise exception 'unknown kalshi ticker'; end if;
  if v_cat.yes_odds is null then raise exception 'no odds for this market yet'; end if;
  if lower(coalesce(v_cat.status,'')) in ('finalized','settled','closed') then
    raise exception 'this market is already closed on kalshi'; end if;
  if v_cat.added_market_code is not null
     and exists (select 1 from public.term_markets where code = v_cat.added_market_code) then
    raise exception 'already added to the board'; end if;

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
    (v_code, null, v_q, coalesce(nullif(v_cat.category,''),'Board'),
     coalesce(p_closes_at, v_cat.close_time), round(v_p*100), false, true,
     v_pqy, v_pqn, 0, 0, v_b, public.term_lmsr_cost(v_pqy,v_pqn,v_b), v_cat.event_ticker);

  update public.term_kalshi_catalog set added_market_code = v_code where ticker = p_ticker;
  return v_code;
end;
$function$;
revoke all on function public.term_admin_create_from_kalshi(text, timestamptz) from anon;
grant execute on function public.term_admin_create_from_kalshi(text, timestamptz) to authenticated;

-- System resolver called by the kalshi-resolve edge function (service_role).
-- Same parimutuel payout as term_resolve_market, but NO auth check, so it must
-- be callable by NOBODY at the client tier. Idempotent; board markets only.
create or replace function public.term_resolve_from_oracle(p_market_code text, p_side text)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare
  m record; v_pot numeric; v_win_shares numeric; v_paid numeric := 0;
  v_last uuid; h record; v_priv boolean;
begin
  if p_side not in ('YES','NO') then raise exception 'bad outcome'; end if;
  select * into m from public.term_markets where code = p_market_code for update;
  if m is null then raise exception 'no such market'; end if;
  if m.owner is not null then raise exception 'not a board market'; end if;
  if m.resolved is not null then return; end if;         -- idempotent
  v_priv := m.is_private;
  v_pot := round(m.pool, 2);
  select coalesce(sum(shares),0) into v_win_shares
    from public.term_bets where market_code = p_market_code and side = p_side;
  if v_win_shares <= 0 then
    if v_priv then
      update public.term_profiles p set pm_balance = p.pm_balance + r.refund
        from (select user_id, sum(cost) as refund from public.term_bets
               where market_code = p_market_code group by user_id) r where p.id = r.user_id;
    else
      update public.term_profiles p set balance = p.balance + r.refund
        from (select user_id, sum(cost) as refund from public.term_bets
               where market_code = p_market_code group by user_id) r where p.id = r.user_id;
    end if;
    update public.term_markets set resolved = 'VOID', resolved_at = now() where code = p_market_code;
    insert into public.term_activity (market_code, handle, kind) values (p_market_code, 'oracle', 'resolve');
    return;
  end if;
  for h in select user_id, sum(shares) as sh from public.term_bets
     where market_code = p_market_code and side = p_side group by user_id
     order by sum(shares) desc, user_id
  loop v_last := h.user_id; end loop;
  for h in select user_id, sum(shares) as sh from public.term_bets
     where market_code = p_market_code and side = p_side group by user_id
     order by sum(shares) desc, user_id
  loop
    if h.user_id = v_last then
      if v_priv then update public.term_profiles set pm_balance = pm_balance + (v_pot - v_paid) where id = h.user_id;
      else            update public.term_profiles set balance    = balance    + (v_pot - v_paid) where id = h.user_id; end if;
    else
      if v_priv then update public.term_profiles set pm_balance = pm_balance + round(v_pot * h.sh / v_win_shares, 2) where id = h.user_id;
      else            update public.term_profiles set balance    = balance    + round(v_pot * h.sh / v_win_shares, 2) where id = h.user_id; end if;
      v_paid := v_paid + round(v_pot * h.sh / v_win_shares, 2);
    end if;
  end loop;
  update public.term_markets set resolved = p_side, resolved_at = now(),
         yes = case when p_side = 'YES' then 100 else 0 end where code = p_market_code;
  insert into public.term_activity (market_code, handle, kind, side)
  values (p_market_code, 'oracle', 'resolve', p_side);
end;
$function$;
revoke all on function public.term_resolve_from_oracle(text, text) from public;
revoke all on function public.term_resolve_from_oracle(text, text) from anon, authenticated;

-- Write lockdown across ALL term_ tables (defense in depth): RLS already denies
-- direct client writes and these revokes remove the underlying grants too, so a
-- future stray policy can't reopen a hole. service_role (edge functions) and
-- SECURITY DEFINER RPCs are unaffected. Re-run safe. Keeps SELECT for reads.
grant select on public.term_kalshi_catalog to authenticated;
do $lock$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname='public' and tablename like 'term\_%'
  loop
    execute format('revoke insert, update, delete, truncate on public.%I from anon, authenticated', t);
  end loop;
end $lock$;

-- ============================================================================
-- Kalshi multi-outcome events  (2026-09-02)
-- A whole mutually-exclusive Kalshi event -> one N-outcome market. See
-- docs/superpowers/specs/2026-09-02-kalshi-catalog-oracle-design.md.
-- ============================================================================

-- Each multi outcome remembers the Kalshi market ticker it came from, so the
-- oracle can map the settled winner back to the outcome index.
alter table public.term_market_outcomes add column if not exists kalshi_ticker text;

-- Fix: the multi price-history trigger inserted into term_price_history without
-- its NOT-NULL `yes` column, which had silently broken ALL multi creation.
create or replace function public.term_log_tick_multi()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare v_b numeric; v_yes numeric;
begin
  if tg_op = 'INSERT' or new.pq is distinct from old.pq then
    select b into v_b from public.term_markets where code = new.market_code;
    select 100 * exp(new.pq / v_b) / nullif(sum(exp(pq / v_b)), 0)
      into v_yes from public.term_market_outcomes where market_code = new.market_code;
    insert into public.term_price_history (market_code, outcome_idx, yes, pq_yes, b, kind)
    values (new.market_code, new.idx, coalesce(round(v_yes, 4), 0), new.pq, v_b,
            case when tg_op = 'INSERT' then 'open' else 'trade' end);
  end if;
  return new;
end $function$;

-- Admin picks a whole event -> one seeded, listed multi board market; each
-- outcome stores its Kalshi ticker; all the event's catalog rows are linked.
create or replace function public.term_admin_create_multi_from_kalshi(
  p_event_ticker text, p_closes_at timestamptz default null)
returns text language plpgsql security definer set search_path to 'public' as $function$
declare
  v_uid uuid := auth.uid();
  v_admin boolean; v_handle text;
  v_code text;
  v_alpha text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_b numeric := public.term_default_b();
  v_n int; v_all_me boolean; v_any_linked boolean;
  v_cat text; v_question text; v_closes_at timestamptz;
  v_sum numeric := 0; v_lo numeric; i int; r record;
  v_probs numeric[] := '{}'; v_names text[] := '{}';
  v_tickers text[] := '{}'; v_seed numeric[] := '{}';
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  select handle, is_admin into v_handle, v_admin from public.term_profiles where id = v_uid;
  if not coalesce(v_admin,false) then raise exception 'admins only'; end if;

  select count(*),
         bool_and(coalesce(c.event_mutually_exclusive,false)),
         bool_or(c.added_market_code is not null
                 and exists (select 1 from public.term_markets m where m.code = c.added_market_code))
    into v_n, v_all_me, v_any_linked
    from public.term_kalshi_catalog c
   where c.event_ticker = p_event_ticker;

  if coalesce(v_n,0) = 0 then raise exception 'unknown kalshi event'; end if;
  if not coalesce(v_all_me,false) then raise exception 'event is not mutually exclusive; only one-winner events supported'; end if;
  if coalesce(v_any_linked,false) then raise exception 'already added to the board'; end if;

  for r in
    select ticker, sub_title, title, yes_odds, event_title, category, close_time
      from public.term_kalshi_catalog
     where event_ticker = p_event_ticker
     order by ticker
  loop
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
  if v_n < 2 then raise exception 'need at least 2 outcomes'; end if;

  select sum(x) into v_sum from unnest(v_probs) x;
  for i in 1..v_n loop v_probs[i] := v_probs[i] / v_sum; end loop;

  for i in 1..v_n loop v_seed[i] := v_b * ln(v_probs[i]); end loop;
  select min(x) into v_lo from unnest(v_seed) x;
  for i in 1..v_n loop v_seed[i] := v_seed[i] - v_lo; end loop;

  v_question  := coalesce(v_question, p_event_ticker);
  v_closes_at := coalesce(p_closes_at, v_closes_at);

  loop
    v_code := 'KM-';
    for i in 1..4 loop v_code := v_code || substr(v_alpha,1+floor(random()*length(v_alpha))::int,1); end loop;
    exit when not exists (select 1 from public.term_markets where code = v_code);
  end loop;

  insert into public.term_markets
    (code, owner, owner_handle, question, cat, closes_at, yes, is_private, is_multi, listed, b, c0, event_ticker)
  values
    (v_code, null, null, v_question, coalesce(v_cat,'Board'), v_closes_at, 0, false, true, true, v_b,
     public.term_lmsr_cost_n(v_seed, v_b), p_event_ticker);

  for i in 1..v_n loop
    insert into public.term_market_outcomes (market_code, idx, name, pq, sq, kalshi_ticker)
    values (v_code, i, v_names[i], v_seed[i], 0, v_tickers[i]);
  end loop;

  update public.term_kalshi_catalog set added_market_code = v_code where event_ticker = p_event_ticker;

  insert into public.term_activity (market_code, handle, kind)
  values (v_code, coalesce(v_handle,'admin'), 'create');
  return v_code;
end $function$;
revoke all on function public.term_admin_create_multi_from_kalshi(text, timestamptz) from anon;
grant execute on function public.term_admin_create_multi_from_kalshi(text, timestamptz) to authenticated;

-- System multi resolver (kalshi-resolve edge function, service_role). No auth
-- check -> callable by NOBODY at the client tier. Idempotent; board only.
create or replace function public.term_resolve_multi_from_oracle(p_market_code text, p_winning_idx integer)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare
  m record; v_pot numeric; v_win numeric; v_paid numeric := 0; v_last uuid; h record; v_name text;
begin
  select * into m from public.term_markets where code = p_market_code for update;
  if m is null or not m.is_multi then raise exception 'no such multi market'; end if;
  if m.owner is not null then raise exception 'not a board market'; end if;
  if m.resolved is not null then return; end if;         -- idempotent
  select name into v_name from public.term_market_outcomes
   where market_code = p_market_code and idx = p_winning_idx;
  if v_name is null then raise exception 'bad outcome'; end if;
  v_pot := round(m.pool, 2);
  select coalesce(sum(shares),0) into v_win
    from public.term_bets where market_code = p_market_code and outcome_idx = p_winning_idx;
  if v_win <= 0 then
    update public.term_profiles p set balance = p.balance + r.refund
      from (select user_id, sum(cost) as refund from public.term_bets
             where market_code = p_market_code group by user_id) r where p.id = r.user_id;
    update public.term_markets set resolved = 'VOID', resolved_at = now() where code = p_market_code;
    insert into public.term_activity (market_code, handle, kind) values (p_market_code, 'oracle', 'resolve');
    return;
  end if;
  for h in select user_id, sum(shares) as sh from public.term_bets
     where market_code = p_market_code and outcome_idx = p_winning_idx group by user_id
     order by sum(shares) desc, user_id
  loop v_last := h.user_id; end loop;
  for h in select user_id, sum(shares) as sh from public.term_bets
     where market_code = p_market_code and outcome_idx = p_winning_idx group by user_id
     order by sum(shares) desc, user_id
  loop
    if h.user_id = v_last then
      update public.term_profiles set balance = balance + (v_pot - v_paid) where id = h.user_id;
    else
      update public.term_profiles set balance = balance + round(v_pot * h.sh / v_win, 2) where id = h.user_id;
      v_paid := v_paid + round(v_pot * h.sh / v_win, 2);
    end if;
  end loop;
  update public.term_markets set resolved = 'MULTI', resolved_idx = p_winning_idx, resolved_at = now()
   where code = p_market_code;
  insert into public.term_activity (market_code, handle, kind, outcome)
  values (p_market_code, 'oracle', 'resolve', v_name);
end $function$;
revoke all on function public.term_resolve_multi_from_oracle(text, integer) from public;
revoke all on function public.term_resolve_multi_from_oracle(text, integer) from anon, authenticated;

-- ============================================================================
-- Guard: raw Kalshi imports never hit the live board  (2026-09-02)
-- The ingest pipeline bulk-inserts source='kalshi' rows into term_markets on
-- the SHARED project. Those belong in the catalog (the pick-list), not the live
-- board — only admin-created markets (source='internal', explicit listed=true)
-- list. This trigger makes that invariant hold no matter how often ingest runs.
-- ============================================================================
create or replace function public.term_kalshi_import_unlisted()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  if new.source = 'kalshi' then new.listed := false; end if;
  return new;
end $$;

-- The three RPCs below existed only on the live project (created by the
-- ingest tooling); pulled back with pg_get_functiondef after the same
-- b := term_default_b() patch so the repo mirrors what runs.
CREATE OR REPLACE FUNCTION public.term_autolist_from_kalshi(p_ticker text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cat public.term_kalshi_catalog%rowtype;
  v_club text; v_code text;
  v_alpha text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_p numeric; v_off numeric; v_pqy numeric; v_pqn numeric; v_b numeric := public.term_default_b();
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
$function$
;

CREATE OR REPLACE FUNCTION public.term_autolist_multi_from_kalshi(p_event_ticker text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_code text;
  v_alpha text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_b numeric := public.term_default_b();
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
$function$
;

CREATE OR REPLACE FUNCTION public.term_create_multi_market(p_question text, p_cat text, p_closes text, p_closes_at timestamp with time zone, p_outcomes text[], p_probs numeric[], p_board boolean DEFAULT false)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid(); v_admin boolean; v_handle text;
  v_code text; v_alpha text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; i int;
  v_n int := coalesce(array_length(p_outcomes,1),0);
  v_b numeric := public.term_default_b(); v_seed numeric[]; v_lo numeric; v_p numeric; v_sum numeric := 0;
  v_prefix text;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  if v_n < 2 then raise exception 'need at least 2 outcomes'; end if;
  if v_n > 12 then raise exception 'too many outcomes'; end if;
  select handle, is_admin into v_handle, v_admin from public.term_profiles where id = v_uid;
  if p_board and not coalesce(v_admin,false) then raise exception 'admins only'; end if;

  -- seed quantities from probs (normalised), shift so min = 0
  for i in 1..v_n loop
    v_p := greatest(1e-4, coalesce(p_probs[i], 1.0/v_n));
    v_seed[i] := v_b * ln(v_p);
  end loop;
  select min(x) into v_lo from unnest(v_seed) x;
  for i in 1..v_n loop v_seed[i] := v_seed[i] - v_lo; end loop;

  v_prefix := case when p_board then 'BX-' else 'EX-' end;
  loop
    v_code := v_prefix;
    for i in 1..4 loop v_code := v_code || substr(v_alpha,1+floor(random()*length(v_alpha))::int,1); end loop;
    exit when not exists (select 1 from public.term_markets where code = v_code);
  end loop;

  insert into public.term_markets
    (code, owner, owner_handle, question, cat, closes, closes_at, yes, is_private, is_multi, b, c0)
  values
    (v_code, case when p_board then null else v_uid end, coalesce(v_handle,'member'),
     p_question, coalesce(nullif(p_cat,''), case when p_board then 'Board' else 'Private' end),
     nullif(p_closes,''), p_closes_at, 0, not p_board, true, v_b,
     public.term_lmsr_cost_n(v_seed, v_b));

  for i in 1..v_n loop
    insert into public.term_market_outcomes (market_code, idx, name, pq, sq)
    values (v_code, i, p_outcomes[i], v_seed[i], 0);
  end loop;

  insert into public.term_activity (market_code, handle, kind) values (v_code, coalesce(v_handle,'member'), 'create');
  return v_code;
end $function$
;