-- ============================================================
-- E[X] Terminal — schema for the /terminal demo desk
-- Paste this whole file into the Supabase SQL editor (project
-- dtgciwhecaqwnddzepiz) and run it. It is idempotent — safe to
-- re-run. Tables are namespaced `term_` so they never touch the
-- existing /poker tables in this shared project.
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- profiles: one row per signed-in user ----------
create table if not exists public.term_profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  handle     text,
  balance    numeric not null default 1000,   -- main platform credits (board markets)
  pm_balance numeric not null default 1000,   -- personal-market sim wallet, separate on purpose
  seen_intro boolean not null default false,  -- gates the first-sign-in video
  created_at timestamptz not null default now()
);

-- ---------- markets: private share-code + lazily-materialized public ----------
create table if not exists public.term_markets (
  code       text primary key,                -- 'EX-7F3K' or a public outcome id
  owner      uuid references auth.users(id) on delete set null,  -- null = public/system
  question   text not null,
  cat        text not null default 'Private',
  closes     text,                            -- human label ("Fri, Sep 4 - 11:59pm")
  closes_at  timestamptz,                     -- when betting stops; null = never
  yes        numeric not null default 50,     -- current YES price in cents
  pool       numeric not null default 0,      -- total credits staked
  is_private boolean not null default true,
  resolved    text check (resolved in ('YES','NO')),  -- null = still open
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
-- Existing deployments predate settlement; add the columns in place.
alter table public.term_markets add column if not exists resolved    text;
alter table public.term_markets add column if not exists resolved_at timestamptz;
alter table public.term_markets add column if not exists closes_at   timestamptz;
alter table public.term_markets add column if not exists owner_handle text;
alter table public.term_profiles add column if not exists pm_balance numeric not null default 1000;
alter table public.term_profiles add column if not exists is_admin boolean not null default false;
alter table public.term_profiles add column if not exists last_action_at timestamptz;

-- Hybrid engine state (LMSR pricing, parimutuel payout — docs/market-engine-notes.md).
-- pq_* include the phantom opening-odds seed; sq_* are REAL held shares, which
-- is what the payout splits over. c0 anchors the pot at zero at open.
alter table public.term_markets add column if not exists pq_yes numeric not null default 0;
alter table public.term_markets add column if not exists pq_no  numeric not null default 0;
alter table public.term_markets add column if not exists sq_yes numeric not null default 0;
alter table public.term_markets add column if not exists sq_no  numeric not null default 0;
alter table public.term_markets add column if not exists b      numeric not null default 100;
alter table public.term_markets add column if not exists c0     numeric not null default 0;
-- 'VOID' = the winning side held zero shares; stakes were refunded.
alter table public.term_markets drop constraint if exists term_markets_resolved_check;
alter table public.term_markets add constraint term_markets_resolved_check
  check (resolved in ('YES','NO','VOID'));

-- ---------- LMSR math (mirrors src/lib/lmsr.ts — keep them agreeing on the
-- worked example: b=100, 50 YES costs 28.093, then 50 NO costs 21.907,
-- pot exactly 50, YES pays 1.000/share) ----------
create or replace function public.term_lmsr_cost(qy numeric, qn numeric, p_b numeric)
returns numeric language sql immutable set search_path = public as $lm$
  select p_b * ( greatest(qy,qn)/p_b
       + ln( exp(qy/p_b - greatest(qy,qn)/p_b) + exp(qn/p_b - greatest(qy,qn)/p_b) ) );
$lm$;
create or replace function public.term_lmsr_price_yes(qy numeric, qn numeric, p_b numeric)
returns numeric language sql immutable set search_path = public as $lm$
  select exp(qy/p_b - greatest(qy,qn)/p_b)
       / ( exp(qy/p_b - greatest(qy,qn)/p_b) + exp(qn/p_b - greatest(qy,qn)/p_b) );
$lm$;
create or replace function public.term_lmsr_shares_for_spend(qx numeric, qo numeric, p_b numeric, k numeric)
returns numeric language sql immutable set search_path = public as $lm$
  select p_b * ln( exp(k/p_b + ln(exp(qx/p_b) + exp(qo/p_b))) - exp(qo/p_b) ) - qx;
$lm$;

-- ---------- bets: drives positions + P&L ----------
create table if not exists public.term_bets (
  id          uuid primary key default gen_random_uuid(),
  market_code text not null references public.term_markets(code) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  side        text not null check (side in ('YES','NO')),
  shares      numeric not null,
  cost        numeric not null,
  created_at  timestamptz not null default now()
);
create index if not exists term_bets_user_idx   on public.term_bets(user_id);
create index if not exists term_bets_market_idx on public.term_bets(market_code);

-- ---------- activity: the private-market social feed ----------
-- Written only by the security-definer RPCs; readable by any signed-in user,
-- the same visibility rule as the markets themselves.
create table if not exists public.term_activity (
  id          uuid primary key default gen_random_uuid(),
  market_code text not null references public.term_markets(code) on delete cascade,
  handle      text not null,
  kind        text not null check (kind in ('create','join','bet','sell','resolve')),
  side        text check (side in ('YES','NO')),
  dollars     numeric,
  created_at  timestamptz not null default now()
);
create index if not exists term_activity_market_idx on public.term_activity(market_code, created_at desc);
alter table public.term_activity enable row level security;
grant select on public.term_activity to authenticated;
drop policy if exists term_activity_read on public.term_activity;
create policy term_activity_read on public.term_activity
  for select using (auth.role() = 'authenticated');

-- ---------- create a profile on first sign-in ----------
-- Deliberately NOT a trigger on auth.users. This project is shared: the poker
-- portal and the applicant flow sign users up through the same auth table, and
-- an AFTER INSERT trigger that raised would abort their signups too. A profile
-- the terminal needs is the terminal's problem, so the client calls this on
-- sign-in instead and nothing new sits in the shared signup path.
--
-- If a previous version of this file installed that trigger, remove it.
drop trigger if exists term_on_auth_user_created on auth.users;
drop function if exists public.term_handle_new_user();

create or replace function public.term_ensure_profile()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into public.term_profiles (id, handle)
  values (auth.uid(), split_part(coalesce(auth.jwt() ->> 'email', ''), '@', 1))
  on conflict (id) do nothing;
end;
$$;

-- ============================================================
-- Row Level Security
-- ============================================================
alter table public.term_profiles enable row level security;
alter table public.term_markets  enable row level security;
alter table public.term_bets     enable row level security;

-- Table privileges for the signed-in role (RLS still scopes which ROWS are
-- visible; without these grants the role can't touch the table at all).
-- SELECT only. Every write goes through a SECURITY DEFINER RPC (runs as the
-- table owner), so authenticated must NOT hold direct insert/update — else a
-- user could PATCH their own balance or insert an unpriced bet.
-- docs/security-review.md, critical finding 2026-09-01.
grant select on public.term_profiles to authenticated;
grant select on public.term_markets  to authenticated;
grant select on public.term_bets     to authenticated;
revoke insert, update, delete on public.term_profiles from authenticated;
revoke insert, update, delete on public.term_markets  from authenticated;
revoke insert, update, delete on public.term_bets     from authenticated;

-- profiles: you can read/update only your own row
drop policy if exists term_profiles_self_sel on public.term_profiles;
create policy term_profiles_self_sel on public.term_profiles
  for select using (auth.uid() = id);
-- No self-update policy: a user with the update grant could set their own
-- balance. Profiles change only via RPC (removed 2026-09-01).
drop policy if exists term_profiles_self_upd on public.term_profiles;

-- markets: any signed-in user can read (needed to join by code); owners insert their own
drop policy if exists term_markets_read on public.term_markets;
create policy term_markets_read on public.term_markets
  for select using (auth.role() = 'authenticated');
-- markets created only via term_create_market / term_upsert_public_market
drop policy if exists term_markets_owner_ins on public.term_markets;

-- bets: read/insert only your own (writes normally go through the RPC below)
drop policy if exists term_bets_self_sel on public.term_bets;
create policy term_bets_self_sel on public.term_bets
  for select using (auth.uid() = user_id);
-- bets written only via term_place_bet / term_sell_shares
drop policy if exists term_bets_self_ins on public.term_bets;

-- ============================================================
-- RPCs (security definer — money logic lives server-side)
-- ============================================================

-- Create a private share-code market. Returns the new code.
create or replace function public.term_create_market(
  p_question text, p_cat text, p_closes text, p_yes numeric, p_closes_at timestamptz default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_code text;
  v_alpha text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_handle text;
  v_p numeric := greatest(0.02, least(0.98, p_yes / 100.0));
  v_off numeric;
  v_pqy numeric; v_pqn numeric; v_b numeric := 100;
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

-- Ensure a public (board) market row exists before betting on it.
create or replace function public.term_upsert_public_market(
  p_code text, p_question text, p_cat text, p_yes numeric)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_p numeric := greatest(0.02, least(0.98, p_yes / 100.0));
  v_off numeric;
  v_pqy numeric; v_pqn numeric; v_b numeric := 100;
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

-- Place a bet: checks balance, records the bet, debits balance, grows the
-- pool, and nudges the price toward the side bought. Returns new balance + yes.
create or replace function public.term_place_bet(p_code text, p_side text, p_dollars numeric)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_bal numeric; v_pm numeric; v_last timestamptz;
  m record; v_shares numeric; v_new_pqy numeric; v_new_pqn numeric; v_price numeric; v_handle text;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  if p_side not in ('YES','NO') then raise exception 'bad side'; end if;
  if p_dollars <= 0 then raise exception 'bad amount'; end if;
  select * into m from public.term_markets where code = p_code for update;
  if m is null then raise exception 'no such market'; end if;
  if m.is_multi then raise exception 'use term_place_bet_multi'; end if;
  if m.resolved is not null then raise exception 'market already settled'; end if;
  if m.closes_at is not null and now() >= m.closes_at then raise exception 'market closed'; end if;
  select balance, pm_balance, last_action_at into v_bal, v_pm, v_last
    from public.term_profiles where id = v_uid for update;
  if v_bal is null then raise exception 'no profile'; end if;
  if v_last is not null and now() - v_last < interval '150 milliseconds' then raise exception 'slow down'; end if;
  if m.is_private then if p_dollars > v_pm then raise exception 'insufficient balance'; end if;
  else if p_dollars > v_bal then raise exception 'insufficient balance'; end if; end if;
  if p_side = 'YES' then
    v_shares := public.term_lmsr_shares_for_spend(m.pq_yes, m.pq_no, m.b, p_dollars);
    v_new_pqy := m.pq_yes + v_shares; v_new_pqn := m.pq_no;
  else
    v_shares := public.term_lmsr_shares_for_spend(m.pq_no, m.pq_yes, m.b, p_dollars);
    v_new_pqy := m.pq_yes; v_new_pqn := m.pq_no + v_shares;
  end if;
  v_price := public.term_lmsr_price_yes(v_new_pqy, v_new_pqn, m.b);
  insert into public.term_bets (market_code, user_id, side, shares, cost)
  values (p_code, v_uid, p_side, v_shares, p_dollars);
  update public.term_markets set pq_yes = v_new_pqy, pq_no = v_new_pqn,
    sq_yes = sq_yes + case when p_side='YES' then v_shares else 0 end,
    sq_no  = sq_no  + case when p_side='NO'  then v_shares else 0 end,
    yes = greatest(1, least(99, round(v_price*100))), pool = pool + p_dollars
  where code = p_code;
  if m.is_private then
    update public.term_profiles set pm_balance = pm_balance - p_dollars, last_action_at = now()
      where id = v_uid returning balance, pm_balance into v_bal, v_pm;
    select handle into v_handle from public.term_profiles where id = v_uid;
    insert into public.term_activity (market_code, handle, kind, side, dollars)
    values (p_code, coalesce(v_handle,'member'), 'bet', p_side, p_dollars);
  else
    update public.term_profiles set balance = balance - p_dollars, last_action_at = now()
      where id = v_uid returning balance, pm_balance into v_bal, v_pm;
  end if;
  return json_build_object('balance', v_bal, 'pm_balance', v_pm,
    'yes', greatest(1, least(99, round(v_price*100))), 'shares', v_shares);
end;
$$;

-- ---------- sell: a true exit through the meter ----------
-- Shares go back to the LMSR meter for C(q) − C(q−s): cash now, price ticks
-- down, pot shrinks by exactly the proceeds. Stored as a NEGATIVE bet row, so
-- held shares, resolution splits and void refunds all stay one sum().
create or replace function public.term_sell_shares(p_code text, p_side text, p_shares numeric)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  m record;
  v_held numeric;
  v_proceeds numeric;
  v_new_pqy numeric; v_new_pqn numeric; v_price numeric;
  v_bal numeric; v_pm numeric;
  v_handle text;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  if p_side not in ('YES','NO') then raise exception 'bad side'; end if;
  if p_shares <= 0 then raise exception 'bad amount'; end if;

  select * into m from public.term_markets where code = p_code for update;
  if m is null then raise exception 'no such market'; end if;
  if m.resolved is not null then raise exception 'market already settled'; end if;
  if m.closes_at is not null and now() >= m.closes_at then raise exception 'market closed'; end if;

  select coalesce(sum(shares),0) into v_held
    from public.term_bets where market_code = p_code and user_id = v_uid and side = p_side;
  if p_shares > v_held + 1e-9 then raise exception 'not enough shares'; end if;

  if p_side = 'YES' then
    v_new_pqy := m.pq_yes - p_shares;  v_new_pqn := m.pq_no;
  else
    v_new_pqy := m.pq_yes;  v_new_pqn := m.pq_no - p_shares;
  end if;
  v_proceeds := round(public.term_lmsr_cost(m.pq_yes, m.pq_no, m.b)
              - public.term_lmsr_cost(v_new_pqy, v_new_pqn, m.b), 2);
  v_price := public.term_lmsr_price_yes(v_new_pqy, v_new_pqn, m.b);

  insert into public.term_bets (market_code, user_id, side, shares, cost)
  values (p_code, v_uid, p_side, -p_shares, -v_proceeds);

  update public.term_markets set
    pq_yes = v_new_pqy, pq_no = v_new_pqn,
    sq_yes = sq_yes - case when p_side='YES' then p_shares else 0 end,
    sq_no  = sq_no  - case when p_side='NO'  then p_shares else 0 end,
    yes = greatest(1, least(99, round(v_price * 100))),
    pool = greatest(0, pool - v_proceeds)
  where code = p_code;

  if m.is_private then
    update public.term_profiles set pm_balance = pm_balance + v_proceeds where id = v_uid
      returning balance, pm_balance into v_bal, v_pm;
    select handle into v_handle from public.term_profiles where id = v_uid;
    insert into public.term_activity (market_code, handle, kind, side, dollars)
    values (p_code, coalesce(v_handle,'member'), 'sell', p_side, v_proceeds);
  else
    update public.term_profiles set balance = balance + v_proceeds where id = v_uid
      returning balance, pm_balance into v_bal, v_pm;
  end if;

  return json_build_object('balance', v_bal, 'pm_balance', v_pm,
                           'yes', greatest(1, least(99, round(v_price * 100))),
                           'proceeds', v_proceeds);
end;
$$;
grant execute on function public.term_sell_shares(text,text,numeric) to authenticated;

-- ---------- admin: create a public board market ----------
-- Board markets have no private owner; only officers (is_admin) create and
-- resolve them. Bootstrap the first officer by hand:
--   update public.term_profiles set is_admin = true where handle = 'you';
create or replace function public.term_admin_create_board_market(
  p_question text, p_cat text, p_yes numeric, p_closes_at timestamptz default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v_admin boolean; v_code text;
  v_alpha text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_p numeric := greatest(0.02, least(0.98, p_yes/100.0));
  v_off numeric; v_pqy numeric; v_pqn numeric; v_b numeric := 100; i int;
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
grant execute on function public.term_admin_create_board_market(text,text,numeric,timestamptz) to authenticated;

-- ---------- settle a private OR board market ----------
-- NOTE: term_resolve_market and term_place_bet/term_sell_shares are the
-- CURRENT deployed versions (owner-or-admin resolve paying the matching
-- wallet; 150ms per-user anti-hammer gap on trades). See the applied
-- migrations term_admin_role_and_rate_limit / term_trade_rate_limit for the
-- authoritative bodies — kept short here to avoid drift. --
-- Owner-only and once-only, both enforced here rather than in the client: the
-- client check is a courtesy, this is the gate. Every share of the winning side
-- pays $1, losing shares pay nothing, and each holder's balance moves in the
-- same statement that stamps the market resolved.
create or replace function public.term_resolve_market(p_code text, p_outcome text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  m record;
  v_pot numeric;
  v_win_shares numeric;
  v_handle text;
  v_paid numeric := 0;
  v_last uuid;
  h record;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  if p_outcome not in ('YES','NO') then raise exception 'bad outcome'; end if;

  select * into m from public.term_markets where code = p_code for update;
  if m is null or m.owner is null then raise exception 'no such market'; end if;
  if m.owner <> v_uid then raise exception 'only the owner can settle this market'; end if;
  if m.resolved is not null then raise exception 'already settled'; end if;

  -- parimutuel: the pot is everything actually paid in, split over the winning
  -- side's REAL shares. Never shares x $1 — that minted points from nowhere.
  -- The pot is the CASH: pool == Σbuys − Σsells to the cent by construction.
  -- The meter is for pricing only — sells credit rounded proceeds while the
  -- meter moves by exact share amounts, so paying from the meter minted about
  -- half a cent per sell (caught by the 40-way concurrency audit).
  v_pot := round(m.pool, 2);
  select coalesce(sum(shares),0) into v_win_shares
    from public.term_bets where market_code = p_code and side = p_outcome;

  if v_win_shares <= 0 then
    -- everyone was on the losing side: nobody to pay, so refund every stake
    update public.term_profiles p set pm_balance = p.pm_balance + r.refund
      from (select user_id, sum(cost) as refund from public.term_bets
             where market_code = p_code group by user_id) r
      where p.id = r.user_id;
    update public.term_markets set resolved = 'VOID', resolved_at = now() where code = p_code;
    select handle into v_handle from public.term_profiles where id = v_uid;
    insert into public.term_activity (market_code, handle, kind)
    values (p_code, coalesce(v_handle,'member'), 'resolve');
    return;
  end if;

  -- dust rule: all but the largest holder get their cut rounded to the cent;
  -- the largest absorbs the residual, so the payouts sum to the pot exactly
  for h in
    select user_id, sum(shares) as sh from public.term_bets
     where market_code = p_code and side = p_outcome
     group by user_id order by sum(shares) desc, user_id
  loop
    v_last := h.user_id;
  end loop;
  for h in
    select user_id, sum(shares) as sh from public.term_bets
     where market_code = p_code and side = p_outcome
     group by user_id order by sum(shares) desc, user_id
  loop
    if h.user_id = v_last then
      update public.term_profiles set pm_balance = pm_balance + (v_pot - v_paid)
        where id = h.user_id;
    else
      update public.term_profiles set pm_balance = pm_balance + round(v_pot * h.sh / v_win_shares, 2)
        where id = h.user_id;
      v_paid := v_paid + round(v_pot * h.sh / v_win_shares, 2);
    end if;
  end loop;

  update public.term_markets
     set resolved = p_outcome, resolved_at = now(),
         yes = case when p_outcome = 'YES' then 100 else 0 end
   where code = p_code;

  select handle into v_handle from public.term_profiles where id = v_uid;
  insert into public.term_activity (market_code, handle, kind, side)
  values (p_code, coalesce(v_handle,'member'), 'resolve', p_outcome);
end;
$$;

-- Mark the intro video as watched (so it never replays for this account).
create or replace function public.term_set_seen_intro()
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.term_profiles set seen_intro = true where id = auth.uid();
end;
$$;

-- Log a join, once per user per market.
create or replace function public.term_log_join(p_code text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_handle text;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select handle into v_handle from public.term_profiles where id = auth.uid();
  v_handle := coalesce(v_handle, 'member');
  if not exists (
    select 1 from public.term_activity
    where market_code = p_code and handle = v_handle and kind in ('join','create')
  ) then
    insert into public.term_activity (market_code, handle, kind) values (p_code, v_handle, 'join');
  end if;
end;
$$;

grant execute on function public.term_log_join(text) to authenticated;
grant execute on function public.term_ensure_profile() to authenticated;
grant execute on function public.term_create_market(text,text,text,numeric,timestamptz) to authenticated;
grant execute on function public.term_upsert_public_market(text,text,text,numeric) to authenticated;
grant execute on function public.term_place_bet(text,text,numeric) to authenticated;
grant execute on function public.term_resolve_market(text,text) to authenticated;
grant execute on function public.term_set_seen_intro() to authenticated;

-- ============================================================
-- Multi-outcome markets ("who wins"): N mutually-exclusive outcomes, softmax
-- prices summing to 1, one pot, one winner. Binary markets are the N=2 case and
-- are untouched. The authoritative bodies live in the applied migrations
-- (term_multi_outcome_schema / term_multi_outcome_rpcs / term_resolve_multi_store_idx):
--   term_market_outcomes            one row per outcome (pq/sq)
--   term_markets.is_multi, resolved_idx, resolved='MULTI'
--   term_lmsr_cost_n / term_lmsr_shares_n    N-outcome math (mirror lmsr.ts)
--   term_create_multi_market(...)   private (any user) or board (admin)
--   term_place_bet_multi / term_sell_multi   trade one outcome, 150ms gap
--   term_resolve_multi(code, idx)   owner-or-admin; pot to that outcome's
--                                   holders in the market's wallet; void+refund
--                                   if the winner holds no shares
-- Kept as a pointer rather than duplicated to avoid drift. --
