-- ---------- price history: readable wherever the market is ----------
-- term_price_history gets a row per repricing (term_log_tick on term_markets,
-- term_log_tick_multi on term_market_outcomes) and the desk draws its chart
-- from it. The original read policy let only the owner see a private market's
-- rows, so anyone who joined by code got a flat line. Visibility now follows
-- term_markets through its own RLS: signed-in accounts read every market they
-- can open, anon reads the public board.
--
-- Apply once against the live project (also mirrored in terminal-schema.sql):
--   supabase db query --linked -f supabase/price-history-read.sql
drop policy if exists term_price_history_public_read on public.term_price_history;
drop policy if exists term_price_history_read on public.term_price_history;
create policy term_price_history_read on public.term_price_history
  for select to anon, authenticated
  using (exists (select 1 from public.term_markets m where m.code = term_price_history.market_code));
