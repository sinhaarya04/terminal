-- ---------- officer: delete a market outright ----------
-- For markets that should never have been listed. Every member's net stake in
-- it is refunded first (sells are negative bet rows, so sum(cost) per member
-- is exactly what they are still out), then every dependent row goes. A
-- market that already settled has already paid out, so nothing is refunded
-- there — the delete only removes its history.
--   supabase db query --linked -f supabase/admin-delete-market.sql
create or replace function public.term_admin_delete_market(p_code text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_admin boolean;
  m record;
  r record;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  select is_admin into v_admin from public.term_profiles where id = v_uid;
  if not coalesce(v_admin, false) then raise exception 'officers only'; end if;

  select * into m from public.term_markets where code = p_code for update;
  if m is null then raise exception 'no such market'; end if;

  if m.resolved is null then
    for r in
      select user_id, sum(cost) as paid from public.term_bets
      where market_code = p_code group by user_id
    loop
      if m.is_private then
        update public.term_profiles set pm_balance = pm_balance + r.paid where id = r.user_id;
      else
        update public.term_profiles set balance = balance + r.paid where id = r.user_id;
      end if;
    end loop;
  end if;

  delete from public.term_bets            where market_code = p_code;
  delete from public.term_activity        where market_code = p_code;
  delete from public.term_price_history   where market_code = p_code;
  delete from public.term_market_outcomes where market_code = p_code;
  delete from public.term_markets         where code = p_code;
end;
$$;
revoke all on function public.term_admin_delete_market(text) from public, anon;
grant execute on function public.term_admin_delete_market(text) to authenticated;
