-- ---------- officer: fix the wording of a market ----------
-- Title and outcome names only. Prices, quantities, liquidity, close time and
-- resolution are never touched here, so a live market can be corrected
-- without moving its odds. Outcomes arrive as [{"idx":0,"name":"..."}].
--   supabase db query --linked -f supabase/admin-edit-market.sql
create or replace function public.term_admin_edit_market(p_code text, p_question text, p_outcomes jsonb default '[]'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_admin boolean;
  m record;
  o record;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  select is_admin into v_admin from public.term_profiles where id = v_uid;
  if not coalesce(v_admin, false) then raise exception 'officers only'; end if;

  select * into m from public.term_markets where code = p_code for update;
  if m is null then raise exception 'no such market'; end if;

  if length(trim(p_question)) < 3 or length(p_question) > 120 then raise exception 'question must be 3-120 characters'; end if;
  update public.term_markets set question = trim(p_question) where code = p_code;

  for o in select (e->>'idx')::int as idx, trim(e->>'name') as name from jsonb_array_elements(coalesce(p_outcomes, '[]'::jsonb)) e loop
    if o.name is null or length(o.name) < 1 or length(o.name) > 40 then raise exception 'outcome names must be 1-40 characters'; end if;
    update public.term_market_outcomes set name = o.name where market_code = p_code and idx = o.idx;
  end loop;
end;
$$;
revoke all on function public.term_admin_edit_market(text, text, jsonb) from public, anon;
grant execute on function public.term_admin_edit_market(text, text, jsonb) to authenticated;
