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
  kind        text not null check (kind in ('create','join','bet','resolve')),
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
grant select, insert, update on public.term_profiles to authenticated;
grant select, insert            on public.term_markets  to authenticated;
grant select, insert            on public.term_bets     to authenticated;

-- profiles: you can read/update only your own row
drop policy if exists term_profiles_self_sel on public.term_profiles;
create policy term_profiles_self_sel on public.term_profiles
  for select using (auth.uid() = id);
drop policy if exists term_profiles_self_upd on public.term_profiles;
create policy term_profiles_self_upd on public.term_profiles
  for update using (auth.uid() = id);

-- markets: any signed-in user can read (needed to join by code); owners insert their own
drop policy if exists term_markets_read on public.term_markets;
create policy term_markets_read on public.term_markets
  for select using (auth.role() = 'authenticated');
drop policy if exists term_markets_owner_ins on public.term_markets;
create policy term_markets_owner_ins on public.term_markets
  for insert with check (auth.uid() = owner);

-- bets: read/insert only your own (writes normally go through the RPC below)
drop policy if exists term_bets_self_sel on public.term_bets;
create policy term_bets_self_sel on public.term_bets
  for select using (auth.uid() = user_id);
drop policy if exists term_bets_self_ins on public.term_bets;
create policy term_bets_self_ins on public.term_bets
  for insert with check (auth.uid() = user_id);

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
  insert into public.term_markets (code, owner, owner_handle, question, cat, closes, closes_at, yes, is_private)
  values (v_code, auth.uid(), v_handle, p_question,
          coalesce(nullif(p_cat,''),'Private'),
          nullif(p_closes,''), p_closes_at, greatest(2, least(98, p_yes)), true);
  insert into public.term_activity (market_code, handle, kind) values (v_code, v_handle, 'create');
  return v_code;
end;
$$;

-- Ensure a public (board) market row exists before betting on it.
create or replace function public.term_upsert_public_market(
  p_code text, p_question text, p_cat text, p_yes numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.term_markets (code, owner, question, cat, yes, is_private)
  values (p_code, null, p_question, coalesce(nullif(p_cat,''),'Market'),
          greatest(2, least(98, p_yes)), false)
  on conflict (code) do nothing;
end;
$$;

-- Place a bet: checks balance, records the bet, debits balance, grows the
-- pool, and nudges the price toward the side bought. Returns new balance + yes.
create or replace function public.term_place_bet(
  p_code text, p_side text, p_dollars numeric)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_bal   numeric;
  v_pm    numeric;
  v_yes   numeric;
  v_price numeric;
  v_shares numeric;
  v_nudge numeric;
  v_private boolean;
  v_closes_at timestamptz;
  v_resolved text;
  v_handle text;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  if p_side not in ('YES','NO') then raise exception 'bad side'; end if;
  if p_dollars <= 0 then raise exception 'bad amount'; end if;

  select yes, is_private, closes_at, resolved
    into v_yes, v_private, v_closes_at, v_resolved
    from public.term_markets where code = p_code for update;
  if v_yes is null then raise exception 'no such market'; end if;
  if v_resolved is not null then raise exception 'market already settled'; end if;
  if v_closes_at is not null and now() >= v_closes_at then raise exception 'market closed'; end if;

  -- Private markets spend the sim wallet, board markets the main balance.
  select balance, pm_balance into v_bal, v_pm
    from public.term_profiles where id = v_uid for update;
  if v_bal is null then raise exception 'no profile'; end if;
  if v_private then
    if p_dollars > v_pm then raise exception 'insufficient balance'; end if;
  else
    if p_dollars > v_bal then raise exception 'insufficient balance'; end if;
  end if;

  v_price  := case when p_side = 'YES' then v_yes else 100 - v_yes end;
  v_shares := p_dollars / (v_price / 100.0);
  v_nudge  := least(6, greatest(1, round(p_dollars / 40.0)));
  v_yes    := greatest(2, least(98, case when p_side='YES' then v_yes + v_nudge else v_yes - v_nudge end));

  insert into public.term_bets (market_code, user_id, side, shares, cost)
  values (p_code, v_uid, p_side, v_shares, p_dollars);

  update public.term_markets set yes = v_yes, pool = pool + p_dollars where code = p_code;

  if v_private then
    update public.term_profiles set pm_balance = pm_balance - p_dollars where id = v_uid
      returning balance, pm_balance into v_bal, v_pm;
    select handle into v_handle from public.term_profiles where id = v_uid;
    insert into public.term_activity (market_code, handle, kind, side, dollars)
    values (p_code, coalesce(v_handle,'member'), 'bet', p_side, p_dollars);
  else
    update public.term_profiles set balance = balance - p_dollars where id = v_uid
      returning balance, pm_balance into v_bal, v_pm;
  end if;

  return json_build_object('balance', v_bal, 'pm_balance', v_pm, 'yes', v_yes);
end;
$$;

-- ---------- settle a private market ----------
-- Owner-only and once-only, both enforced here rather than in the client: the
-- client check is a courtesy, this is the gate. Every share of the winning side
-- pays $1, losing shares pay nothing, and each holder's balance moves in the
-- same statement that stamps the market resolved.
create or replace function public.term_resolve_market(p_code text, p_outcome text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid      uuid := auth.uid();
  v_owner    uuid;
  v_resolved text;
  v_handle   text;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  if p_outcome not in ('YES','NO') then raise exception 'bad outcome'; end if;

  select owner, resolved into v_owner, v_resolved
    from public.term_markets where code = p_code for update;
  if v_owner is null then raise exception 'no such market'; end if;
  if v_owner <> v_uid then raise exception 'only the owner can settle this market'; end if;
  if v_resolved is not null then raise exception 'already settled'; end if;

  -- Winnings land in the sim wallet: only private markets have an owner, so
  -- only private markets ever reach this function.
  update public.term_profiles p
     set pm_balance = p.pm_balance + w.payout
    from (
      select user_id, sum(shares) as payout
        from public.term_bets
       where market_code = p_code and side = p_outcome
       group by user_id
    ) w
   where p.id = w.user_id;

  update public.term_markets
     set resolved = p_outcome,
         resolved_at = now(),
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
