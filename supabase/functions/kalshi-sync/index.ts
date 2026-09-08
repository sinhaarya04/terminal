// Kalshi catalog sync — pulls the PUBLIC Kalshi market-data API (no key needed)
// and upserts term_kalshi_catalog. Content-only: refreshes the list of available
// markets, their current odds and settlement status. Never touches live
// term_markets. Runs on pg_cron; also invocable with query params.
//
// How Kalshi's feed behaves, measured 2026-09-08:
//   /events?status=open with nested markets is sorted by close time DESCENDING
//   and cannot be windowed (min/max_close_ts are ignored). Pages 1-25 are
//   markets closing 2027-2099; the markets a club can actually trade — closing
//   inside HORIZON_DAYS — start around page 25 and run for dozens of pages
//   more. Paced at ~4 pages a second it throttles (429); at one page every
//   250 ms it does not.
//
// So one run walks the feed from a saved cursor for as long as its time budget
// allows, keeps only markets closing within the horizon, and stores the cursor
// for the next run to pick up. When a walk exhausts the feed the cursor resets
// and the next run starts over from the top. Parlay shards (KXMVE… series,
// tens of thousands of zero-volume combos) are skipped outright.
//
// Params: max_days (150), max_pages (40: ~35 s and well inside the compute
// limit; 200 tripped WORKER_RESOURCE_LIMIT), restart=1 (ignore the saved cursor).
import { createClient } from "jsr:@supabase/supabase-js@2";

const KALSHI = "https://api.elections.kalshi.com/trade-api/v2";
const BUDGET_MS = 115_000;
const PACE_MS = 250;
const STATE_KEY = "kalshi-sync.cursor";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// One paced Kalshi GET with backoff on 429. Null when the API keeps refusing.
async function kget(u: URL, budgetLeft: () => number): Promise<any | null> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch(u);
    if (r.ok) { await sleep(PACE_MS); return await r.json(); }
    if (r.status !== 429 || budgetLeft() < 10_000) return null;
    await sleep(1500 * (attempt + 1));
  }
  return null;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const num = (k: string, d: number, max: number) => Math.min(max, Math.max(0, Number(url.searchParams.get(k) ?? d) || 0));
  const horizonDays = num("max_days", 150, 365);
  const maxPages = num("max_pages", 40, 120);
  const restart = url.searchParams.get("restart") === "1";
  const started = Date.now();
  const budgetLeft = () => BUDGET_MS - (Date.now() - started);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const now = new Date();
  const nowIso = now.toISOString();
  const horizonIso = new Date(now.getTime() + horizonDays * 86_400_000).toISOString();
  const stats = { pages: 0, events: 0, seen: 0, kept: 0, resumed: false, exhausted: false, swept: 0, purged: 0 };

  // resume where the last run stopped
  let cursor = "";
  if (!restart) {
    const { data } = await supabase.from("term_sync_state").select("value").eq("key", STATE_KEY).maybeSingle();
    cursor = data?.value ?? "";
    stats.resumed = !!cursor;
  }

  for (let p = 0; p < maxPages && budgetLeft() > 12_000; p++) {
    const u = new URL(`${KALSHI}/events`);
    u.searchParams.set("limit", "200");
    u.searchParams.set("status", "open");
    u.searchParams.set("with_nested_markets", "true");
    if (cursor) u.searchParams.set("cursor", cursor);
    const j = await kget(u, budgetLeft);
    if (!j) break;                      // throttled or errored: keep the cursor, retry next run
    stats.pages++;

    const rows: any[] = [];
    for (const e of j.events ?? []) {
      stats.events++;
      const et: string = e.event_ticker ?? "";
      if (et.startsWith("KXMVE")) continue;   // parlay shards: never listable
      for (const m of e.markets ?? []) {
        stats.seen++;
        const ct: string | null = m.close_time ?? null;
        if (!ct || ct <= nowIso || ct > horizonIso) continue;   // closed, or past the horizon
        const bid = m.yes_bid_dollars, ask = m.yes_ask_dollars, last = m.last_price_dollars;
        const mid = (bid != null && ask != null) ? (Number(bid) + Number(ask)) / 2
          : (last != null ? Number(last) : null);
        rows.push({
          ticker: m.ticker,
          event_ticker: et || null,
          series_ticker: e.series_ticker ?? null,
          title: e.title ?? m.title ?? null,
          sub_title: m.yes_sub_title ?? m.title ?? null,
          category: e.category ?? null,
          event_title: e.title ?? null,
          event_mutually_exclusive: e.mutually_exclusive ?? null,
          yes_odds: mid != null ? Math.round(mid * 100) : null,
          status: m.status ?? null,
          result: m.result ?? null,
          close_time: ct,
          volume: m.volume_fp ?? null,
          last_synced_at: nowIso,
        });
      }
    }
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await supabase.from("term_kalshi_catalog").upsert(rows.slice(i, i + 500), { onConflict: "ticker" });
      if (error) return json({ error: error.message, ...stats }, 500);
    }
    stats.kept += rows.length;

    cursor = j.cursor ?? "";
    if (!cursor) { stats.exhausted = true; break; }
  }

  // hand the position to the next run; an exhausted walk starts over
  await supabase.from("term_sync_state").upsert(
    { key: STATE_KEY, value: stats.exhausted ? "" : cursor, updated_at: nowIso }, { onConflict: "key" });

  // tidy: a passed close is no longer addable; beyond the horizon is noise the
  // club never asked for (rows already listed on the board are kept)
  const { data: swept } = await supabase.from("term_kalshi_catalog")
    .update({ status: "closed", last_synced_at: nowIso })
    .eq("status", "active").lt("close_time", nowIso).select("ticker");
  stats.swept = swept?.length ?? 0;
  const { data: purged } = await supabase.from("term_kalshi_catalog")
    .delete().gt("close_time", horizonIso).is("added_market_code", null).select("ticker");
  stats.purged = purged?.length ?? 0;

  return json({ ok: true, ms: Date.now() - started, ...stats });
});

function json(body: unknown, statusCode = 200) {
  return new Response(JSON.stringify(body), {
    status: statusCode,
    headers: { "content-type": "application/json" },
  });
}
