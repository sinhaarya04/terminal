-- ---------- order flow: log public-board bets and sells to the feed ----------
-- term_place_bet / term_sell_shares only write term_activity for private
-- markets. The board's order-flow panel needs the same rows for public
-- markets, so an AFTER INSERT trigger on term_bets fills them in. Private
-- markets keep their in-RPC rows (the trigger skips them to avoid doubles).
--
-- Apply once against the live project (also mirrored in terminal-schema.sql):
--   supabase db query --linked -f supabase/order-flow-trigger.sql
create or replace function public.term_log_public_bet()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_private boolean; v_handle text;
begin
  select is_private into v_private from public.term_markets where code = new.market_code;
  if coalesce(v_private, false) then return new; end if;
  select handle into v_handle from public.term_profiles where id = new.user_id;
  insert into public.term_activity (market_code, handle, kind, side, dollars)
  values (new.market_code, coalesce(v_handle, 'member'),
          case when new.shares < 0 then 'sell' else 'bet' end,
          new.side, abs(new.cost));
  return new;
end;
$$;
drop trigger if exists term_bets_log_public on public.term_bets;
create trigger term_bets_log_public
  after insert on public.term_bets
  for each row execute function public.term_log_public_bet();
