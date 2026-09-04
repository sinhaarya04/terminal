-- ============================================================
-- E[X] Terminal — research logging (additive, idempotent, self-contained)
-- Turns the live market into a research-grade dataset WITHOUT touching the
-- money RPCs: triggers snapshot the price path on every price change, capturing
-- engine state (pq, b) so trades can be replayed under different market-maker
-- policies (e.g. adaptive-b). Apply after terminal-schema.sql. Safe to re-run.
--
-- Also the canonical home of the term_price_history substrate: terminal-schema.sql
-- WRITES to this table + its engine-state columns (term_log_tick_multi) but never
-- defines them, so a fresh DB needs this file for multi creation to work at all.
-- ============================================================

-- ---------- price-history table (base) ----------
create table if not exists public.term_price_history (
  id          bigint generated always as identity primary key,
  market_code text not null,
  yes         numeric not null,          -- traded YES price in cents at the tick
  yes_bid     numeric,
  yes_ask     numeric,
  ts          timestamptz not null default now()
);
create index if not exists term_price_history_market_idx on public.term_price_history(market_code, ts);

-- The binary tick reads yes_bid/yes_ask off term_markets (Kalshi-seeded book);
-- guard the columns so this file stands alone.
alter table public.term_markets add column if not exists yes_bid numeric;
alter table public.term_markets add column if not exists yes_ask numeric;

-- ---------- price-history: carry engine state + provenance ----------
alter table public.term_price_history
  add column if not exists pq_yes      numeric,   -- YES pricing quantity at the tick
  add column if not exists pq_no       numeric,   -- NO  pricing quantity
  add column if not exists b           numeric,   -- liquidity parameter in force
  add column if not exists outcome_idx integer,   -- multi-outcome index (null = binary)
  add column if not exists kind        text not null default 'trade';  -- 'open'|'trade'|'ref'

-- ---------- research consent (IRB) ----------
alter table public.term_profiles
  add column if not exists research_consent boolean not null default false;

-- ---------- binary / board markets: tick on every price move ----------
-- Fires when a bet, sell, or seed changes the traded price (yes/pq).
create or replace function public.term_log_tick()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT'
     or new.yes    is distinct from old.yes
     or new.pq_yes is distinct from old.pq_yes
     or new.pq_no  is distinct from old.pq_no then
    insert into public.term_price_history
      (market_code, yes, yes_bid, yes_ask, pq_yes, pq_no, b, kind)
    values
      (new.code, new.yes, new.yes_bid, new.yes_ask, new.pq_yes, new.pq_no, new.b,
       case when tg_op = 'INSERT' then 'open' else 'trade' end);
  end if;
  return new;
end $$;

drop trigger if exists term_markets_tick on public.term_markets;
create trigger term_markets_tick
  after insert or update on public.term_markets
  for each row execute function public.term_log_tick();

-- ---------- multi-outcome markets: tick per outcome ----------
-- CANONICAL body also lives in terminal-schema.sql (Sam's fix that added the
-- NOT-NULL `yes` column). Kept identical here so this file is self-sufficient on
-- a fresh DB — do not diverge the two; terminal-schema.sql is the source of truth.
create or replace function public.term_log_tick_multi()
returns trigger language plpgsql security definer set search_path to 'public' as $$
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
end $$;

drop trigger if exists term_outcomes_tick on public.term_market_outcomes;
create trigger term_outcomes_tick
  after insert or update on public.term_market_outcomes
  for each row execute function public.term_log_tick_multi();
