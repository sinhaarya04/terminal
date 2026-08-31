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
  balance    numeric not null default 1000,   -- play credits
  seen_intro boolean not null default false,  -- gates the first-sign-in video
  created_at timestamptz not null default now()
);

-- ---------- markets: private share-code + lazily-materialized public ----------
create table if not exists public.term_markets (
  code       text primary key,                -- 'EX-7F3K' or a public outcome id
  owner      uuid references auth.users(id) on delete set null,  -- null = public/system
  question   text not null,
  cat        text not null default 'Private',
  closes     text,
  yes        numeric not null default 50,     -- current YES price in cents
  pool       numeric not null default 0,      -- total credits staked
  is_private boolean not null default true,
  created_at timestamptz not null default now()
);

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

-- ---------- create a profile automatically on signup ----------
create or replace function public.term_handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.term_profiles (id, handle)
  values (new.id, split_part(new.email, '@', 1))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists term_on_auth_user_created on auth.users;
create trigger term_on_auth_user_created
  after insert on auth.users
  for each row execute function public.term_handle_new_user();

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
  p_question text, p_cat text, p_closes text, p_yes numeric)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_code text;
  v_alpha text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  i int;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  loop
    v_code := 'EX-';
    for i in 1..4 loop
      v_code := v_code || substr(v_alpha, 1 + floor(random() * length(v_alpha))::int, 1);
    end loop;
    exit when not exists (select 1 from public.term_markets where code = v_code);
  end loop;
  insert into public.term_markets (code, owner, question, cat, closes, yes, is_private)
  values (v_code, auth.uid(), p_question, coalesce(nullif(p_cat,''),'Private'),
          nullif(p_closes,''), greatest(2, least(98, p_yes)), true);
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
  v_yes   numeric;
  v_price numeric;
  v_shares numeric;
  v_nudge numeric;
  v_private boolean;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  if p_side not in ('YES','NO') then raise exception 'bad side'; end if;
  if p_dollars <= 0 then raise exception 'bad amount'; end if;

  select balance into v_bal from public.term_profiles where id = v_uid for update;
  if v_bal is null then raise exception 'no profile'; end if;
  if p_dollars > v_bal then raise exception 'insufficient balance'; end if;

  select yes, is_private into v_yes, v_private from public.term_markets where code = p_code for update;
  if v_yes is null then raise exception 'no such market'; end if;

  v_price  := case when p_side = 'YES' then v_yes else 100 - v_yes end;
  v_shares := p_dollars / (v_price / 100.0);
  v_nudge  := least(6, greatest(1, round(p_dollars / 40.0)));
  v_yes    := greatest(2, least(98, case when p_side='YES' then v_yes + v_nudge else v_yes - v_nudge end));

  insert into public.term_bets (market_code, user_id, side, shares, cost)
  values (p_code, v_uid, p_side, v_shares, p_dollars);

  update public.term_markets set yes = v_yes, pool = pool + p_dollars where code = p_code;
  update public.term_profiles set balance = balance - p_dollars where id = v_uid
    returning balance into v_bal;

  return json_build_object('balance', v_bal, 'yes', v_yes);
end;
$$;

-- Mark the intro video as watched (so it never replays for this account).
create or replace function public.term_set_seen_intro()
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.term_profiles set seen_intro = true where id = auth.uid();
end;
$$;

grant execute on function public.term_create_market(text,text,text,numeric) to authenticated;
grant execute on function public.term_upsert_public_market(text,text,text,numeric) to authenticated;
grant execute on function public.term_place_bet(text,text,numeric) to authenticated;
grant execute on function public.term_set_seen_intro() to authenticated;
