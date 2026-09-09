create or replace function public.term_multi_binary_guard()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  if not coalesce(new.is_multi, false) THEN return new; end if;

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