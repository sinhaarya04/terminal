-- All-time volume: every dollar that has gone through the engine on every
-- market the desk still has — buys and sells, binary and multi, public and
-- private. Sells are stored as NEGATIVE bet rows, so the sum is over |cost|,
-- not cost: a round trip is two trades' worth of volume, not zero. A deleted
-- market takes its rows with it (term_admin_delete_market), and its refunded
-- stakes were never really traded, so the figure shrinks with it on purpose.
--
-- Security definer because a member can only read their own bet rows; the
-- total gives nothing away about who traded what.
--
-- Applied 2026-09-13 with the command below. Mirrored in terminal-schema.sql;
-- re-run safe.
--   supabase db query --linked -f supabase/total-volume.sql
create or replace function public.term_total_volume()
returns table (volume numeric, trades bigint)
language sql security definer set search_path = public stable as $$
  select coalesce(sum(abs(cost)), 0)::numeric as volume, count(*)::bigint as trades
  from public.term_bets;
$$;
revoke all on function public.term_total_volume() from public, anon;
grant execute on function public.term_total_volume() to authenticated;
