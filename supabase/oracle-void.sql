-- ---------- oracle: void a board market ----------
-- For a Kalshi market that settled as something other than yes/no, or a
-- multi event whose winner isn't one of the listed outcomes. Every member's
-- net stake comes back (sells are negative bet rows, so sum(cost) is what
-- they are still out) and the market closes as VOID. Idempotent. System-only:
-- the resolve edge function calls it with the service role.
create or replace function public.term_void_from_oracle(p_market_code text)
returns void language plpgsql security definer set search_path = public as $$
declare m record;
begin
  select * into m from public.term_markets where code = p_market_code for update;
  if m is null then raise exception 'no such market'; end if;
  if m.owner is not null then raise exception 'not a board market'; end if;
  if m.resolved is not null then return; end if;
  if m.is_private then
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
end;
$$;
revoke all on function public.term_void_from_oracle(text) from public, anon, authenticated;
-- Applied 2026-09-10 as migration term_void_from_oracle. Mirrored in
-- terminal-schema.sql; re-run safe.
