-- Multi-outcome markets must never travel the binary paths. term_place_bet
-- already refuses them; term_sell_shares and term_resolve_market did not.
--
-- Multi bets carry outcome_idx and a NULL side (term_bets_shape), so the
-- binary sell found nothing held and failed with 'not enough shares', while
-- the binary resolver found no winning side and took its refund branch,
-- voiding the market. Both now refuse up front, the way term_place_bet does.
--
-- The trigger at the bottom is defence in depth for the engine columns and
-- for YES/NO settlement. It deliberately lets VOID through: term_resolve_multi
-- voids legitimately when the winning outcome has no holders, so only the
-- function-level guard can tell a binary void from a multi one.

-- ---------- sell: refuse multi markets before touching the binary meter ----------
create or replace function public.term_sell_shares(p_code text, p_side text, p_shares numeric)
returns json language plpgsql security definer set search_path to 'public' as $function$
declare
  v_uid uuid := auth.uid();
  m record; v_held numeric; v_proceeds numeric; v_new_pqy numeric; v_new_pqn numeric;
  v_price numeric; v_bal numeric; v_pm numeric; v_last timestamptz; v_handle text;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  if p_side not in ('YES','NO') then raise exception 'bad side'; end if;
  if p_shares <= 0 then raise exception 'bad amount'; end if;

  select * into m from public.term_markets where code = p_code for update;
  if m is null then raise exception 'no such market'; end if;
  if m.is_multi then raise exception 'use term_sell_multi'; end if;
  if m.resolved is not null then raise exception 'market already settled'; end if;
  if m.closes_at is not null and now() >= m.closes_at then raise exception 'market closed'; end if;

  select last_action_at into v_last from public.term_profiles where id = v_uid for update;
  if v_last is not null and now() - v_last < interval '150 milliseconds' then raise exception 'slow down'; end if;

  select coalesce(sum(shares),0) into v_held
    from public.term_bets where market_code = p_code and user_id = v_uid and side = p_side;
  if p_shares > v_held + 1e-9 then raise exception 'not enough shares'; end if;

  if p_side = 'YES' then v_new_pqy := m.pq_yes - p_shares; v_new_pqn := m.pq_no;
  else v_new_pqy := m.pq_yes; v_new_pqn := m.pq_no - p_shares; end if;
  v_proceeds := round(public.term_lmsr_cost(m.pq_yes,m.pq_no,m.b) - public.term_lmsr_cost(v_new_pqy,v_new_pqn,m.b), 2);
  v_price := public.term_lmsr_price_yes(v_new_pqy, v_new_pqn, m.b);

  insert into public.term_bets (market_code, user_id, side, shares, cost)
  values (p_code, v_uid, p_side, -p_shares, -v_proceeds);
  update public.term_markets set
    pq_yes = v_new_pqy, pq_no = v_new_pqn,
    sq_yes = sq_yes - case when p_side='YES' then p_shares else 0 end,
    sq_no  = sq_no  - case when p_side='NO'  then p_shares else 0 end,
    yes = greatest(1, least(99, round(v_price*100))), pool = greatest(0, pool - v_proceeds)
  where code = p_code;

  if m.is_private then
    update public.term_profiles set pm_balance = pm_balance + v_proceeds, last_action_at = now()
      where id = v_uid returning balance, pm_balance into v_bal, v_pm;
    select handle into v_handle from public.term_profiles where id = v_uid;
    insert into public.term_activity (market_code, handle, kind, side, dollars)
    values (p_code, coalesce(v_handle,'member'), 'sell', p_side, v_proceeds);
  else
    update public.term_profiles set balance = balance + v_proceeds, last_action_at = now()
      where id = v_uid returning balance, pm_balance into v_bal, v_pm;
  end if;

  return json_build_object('balance', v_bal, 'pm_balance', v_pm,
    'yes', greatest(1, least(99, round(v_price*100))), 'proceeds', v_proceeds);
end;
$function$;

-- ---------- resolve: refuse multi markets before the refund branch can void them ----------
create or replace function public.term_resolve_market(p_code text, p_outcome text)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare
  v_uid uuid := auth.uid();
  m record;
  v_admin boolean;
  v_pot numeric;
  v_win_shares numeric;
  v_handle text;
  v_paid numeric := 0;
  v_last uuid;
  h record;
  v_priv boolean;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  if p_outcome not in ('YES','NO') then raise exception 'bad outcome'; end if;

  select * into m from public.term_markets where code = p_code for update;
  if m is null then raise exception 'no such market'; end if;
  if m.is_multi then raise exception 'use term_resolve_multi'; end if;
  if m.resolved is not null then raise exception 'already settled'; end if;

  select is_admin into v_admin from public.term_profiles where id = v_uid;
  -- owner may settle their own private market; an admin may settle anything
  if not (coalesce(v_admin,false) or m.owner = v_uid) then
    raise exception 'only the owner or an admin can settle this market';
  end if;
  v_priv := m.is_private;

  v_pot := round(m.pool, 2);
  select coalesce(sum(shares),0) into v_win_shares
    from public.term_bets where market_code = p_code and side = p_outcome;

  if v_win_shares <= 0 then
    -- refund every stake to the wallet it came from
    if v_priv then
      update public.term_profiles p set pm_balance = p.pm_balance + r.refund
        from (select user_id, sum(cost) as refund from public.term_bets
               where market_code = p_code group by user_id) r where p.id = r.user_id;
    else
      update public.term_profiles p set balance = p.balance + r.refund
        from (select user_id, sum(cost) as refund from public.term_bets
               where market_code = p_code group by user_id) r where p.id = r.user_id;
    end if;
    update public.term_markets set resolved = 'VOID', resolved_at = now() where code = p_code;
    select handle into v_handle from public.term_profiles where id = v_uid;
    insert into public.term_activity (market_code, handle, kind)
    values (p_code, coalesce(v_handle,'member'), 'resolve');
    return;
  end if;

  for h in
    select user_id, sum(shares) as sh from public.term_bets
     where market_code = p_code and side = p_outcome group by user_id
     order by sum(shares) desc, user_id
  loop v_last := h.user_id; end loop;

  for h in
    select user_id, sum(shares) as sh from public.term_bets
     where market_code = p_code and side = p_outcome group by user_id
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

  update public.term_markets set resolved = p_outcome, resolved_at = now(),
         yes = case when p_outcome = 'YES' then 100 else 0 end where code = p_code;
  select handle into v_handle from public.term_profiles where id = v_uid;
  insert into public.term_activity (market_code, handle, kind, side)
  values (p_code, coalesce(v_handle,'member'), 'resolve', p_outcome);
end;
$function$;

-- The oracle resolver is service_role only and kalshi-resolve filters
-- is_multi = false before calling it; the multi oracle path is
-- term_resolve_multi_from_oracle. Same guard for symmetry.
-- (Body unchanged otherwise; see liquidity-b.sql for the full definition.)

-- ---------- backstop trigger: engine columns and YES/NO settlement ----------
create or replace function public.term_multi_binary_guard()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  if not coalesce(new.is_multi, false) then return new; end if;

  if new.pq_yes is distinct from old.pq_yes
     or new.pq_no is distinct from old.pq_no
     or new.sq_yes is distinct from old.sq_yes
     or new.sq_no is distinct from old.sq_no then
    raise exception
      'multi market % has no binary engine state (use term_place_bet_multi / term_sell_multi)',
      new.code using errcode = 'check_violation';
  end if;

  if coalesce(new.resolved,'') in ('YES', 'NO')
     and new.resolved is distinct from old.resolved then
    raise exception
      'multi market % cannot settle to a binary outcome (use term_resolve_multi)',
      new.code using errcode = 'check_violation';
  end if;

  return new;
end $$;

drop trigger if exists term_multi_binary_guard on public.term_markets;
create trigger term_multi_binary_guard
  before update on public.term_markets
  for each row execute function public.term_multi_binary_guard();
