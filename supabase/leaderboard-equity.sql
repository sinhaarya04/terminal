-- Leaderboard ranks EQUITY: public cash plus open public positions valued by
-- the pot rule (P(win) x share of the pot, plus the void refund when the
-- other side holds nothing). Cash alone read every open bet as a loss until
-- it settled; shares x price assumed a $1 payout the engine never makes.
-- Applied 2026-09-10 as migrations term_leaderboard_equity and
-- term_leaderboard_pot_mark. Mirrored in terminal-schema.sql; re-run safe.
drop function if exists public.term_leaderboard();
create or replace function public.term_leaderboard()
returns table (rank int, handle text, balance numeric, equity numeric, pnl numeric, brier numeric, n_settled int, is_me boolean)
language sql security definer set search_path = public stable as $$
  with br as (
    select b.user_id,
      avg(power(least(0.999, greatest(0.001, b.cost/nullif(b.shares,0)))
        - case when m.is_multi then (case when b.outcome_idx=m.resolved_idx then 1 else 0 end)
               else (case when (b.side='YES' and m.resolved='YES') or (b.side='NO' and m.resolved='NO') then 1 else 0 end) end
      ,2)) as brier, count(*) as n
    from public.term_bets b join public.term_markets m on m.code=b.market_code
    where b.shares>0 and m.resolved in ('YES','NO','MULTI') group by b.user_id),
  held as (
    select b.user_id, b.market_code, b.side, b.outcome_idx, sum(b.shares) as sh, sum(b.cost) as cost
    from public.term_bets b join public.term_markets m on m.code=b.market_code
    where m.resolved is null and not m.is_private
    group by 1,2,3,4 having sum(b.shares) > 1e-9),
  sm as (
    select o.market_code, o.idx, o.sq,
      exp((o.pq - mx.mx)/m.b) / sum(exp((o.pq - mx.mx)/m.b)) over (partition by o.market_code) as price
    from public.term_market_outcomes o
    join public.term_markets m on m.code=o.market_code
    join (select market_code, max(pq) as mx from public.term_market_outcomes group by 1) mx on mx.market_code=o.market_code),
  -- the pot rule: a holding is worth P(win) x its share of the pot, plus the
  -- refund it gets back if the other side holds nothing (a void). Summed over
  -- a market this is exactly the pool, so equity is conserved like cash.
  marked as (
    select h.user_id, sum(
      case when m.is_multi then
        coalesce(sm.price,0) * m.pool * h.sh / nullif(sm.sq,0)
        + coalesce((select sum(o2.price) from sm o2 where o2.market_code=h.market_code and o2.idx<>h.outcome_idx and o2.sq<=1e-9),0) * h.cost
      when h.side='YES' then
        (m.yes/100.0) * m.pool * h.sh / nullif(m.sq_yes,0)
        + (1-m.yes/100.0) * case when m.sq_no<=1e-9 then h.cost else 0 end
      else
        (1-m.yes/100.0) * m.pool * h.sh / nullif(m.sq_no,0)
        + (m.yes/100.0) * case when m.sq_yes<=1e-9 then h.cost else 0 end
      end) as open_val
    from held h join public.term_markets m on m.code=h.market_code
    left join sm on sm.market_code=h.market_code and sm.idx=h.outcome_idx
    group by 1),
  eq as (
    select p.id, p.handle, p.balance, round(p.balance + coalesce(k.open_val,0), 2) as equity
    from public.term_profiles p left join marked k on k.user_id=p.id)
  select (row_number() over (order by eq.equity desc, eq.handle))::int,
         coalesce(eq.handle,'member'), eq.balance, eq.equity, eq.equity-1000,
         round(br.brier,3), coalesce(br.n,0)::int, eq.id=auth.uid()
  from eq left join br on br.user_id=eq.id
  order by eq.equity desc, eq.handle;
$$;
grant execute on function public.term_leaderboard() to authenticated;
