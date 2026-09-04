// Kalshi catalog sync — pulls the PUBLIC Kalshi market-data API (no key needed)
// and upserts term_kalshi_catalog. Content-only: refreshes the list of available
// markets, their current odds and settlement status. Never touches live
// term_markets. Also invocable with ?max_pages=N&status=open.
//
// Uses events?with_nested_markets=true so every market inherits its event's
// category / title / mutually_exclusive flag in one pass (a plain /markets pull
// loses category).
//
// Two scheduled roles (docs/superpowers/specs/2026-09-04-kalshi-combined-design.md):
//   ?mode=refresh (default, hourly) — sync the catalog only. Keeps odds +
//       settlement status current for the oracle. Never lists new markets.
//   ?mode=launch (daily @ 11:50 ET) — sync, THEN auto-list up to ?quota=N new
//       markets per club category via term_autolist_run, and log the day's
//       count to term_ingest_log. This is the automatic daily market drop.
import { createClient } from "jsr:@supabase/supabase-js@2";

const KALSHI = "https://api.elections.kalshi.com/trade-api/v2";

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const maxPages = Math.min(60, Number(url.searchParams.get("max_pages") ?? "10"));
  const status = url.searchParams.get("status") ?? "open";
  const mode = url.searchParams.get("mode") ?? "refresh";
  const quota = Math.min(50, Math.max(1, Number(url.searchParams.get("quota") ?? "8")));

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let upserted = 0, events = 0, cursor = "";
  for (let p = 0; p < maxPages; p++) {
    const u = new URL(`${KALSHI}/events`);
    u.searchParams.set("limit", "200");
    u.searchParams.set("status", status);
    u.searchParams.set("with_nested_markets", "true");
    if (cursor) u.searchParams.set("cursor", cursor);
    const r = await fetch(u);
    if (!r.ok) return json({ error: `kalshi events ${r.status}`, upserted }, 502);
    const j = await r.json();

    const rows: any[] = [];
    for (const e of j.events ?? []) {
      events++;
      for (const m of e.markets ?? []) {
        const bid = m.yes_bid_dollars, ask = m.yes_ask_dollars, last = m.last_price_dollars;
        const mid = (bid != null && ask != null) ? (Number(bid) + Number(ask)) / 2
          : (last != null ? Number(last) : null);
        rows.push({
          ticker: m.ticker,
          event_ticker: e.event_ticker ?? null,
          series_ticker: e.series_ticker ?? null,
          title: e.title ?? m.title ?? null,
          sub_title: m.yes_sub_title ?? m.title ?? null,
          category: e.category ?? null,
          event_title: e.title ?? null,
          event_mutually_exclusive: e.mutually_exclusive ?? null,
          yes_odds: mid != null ? Math.round(mid * 100) : null,
          status: m.status ?? null,
          result: m.result ?? null,
          close_time: m.close_time ?? null,
          volume: m.volume ?? m.volume_fp ?? null,
          last_synced_at: new Date().toISOString(),
        });
      }
    }
    if (rows.length) {
      const { error } = await supabase
        .from("term_kalshi_catalog")
        .upsert(rows, { onConflict: "ticker" });
      if (error) return json({ error: error.message, upserted }, 500);
      upserted += rows.length;
    }
    cursor = j.cursor ?? "";
    if (!cursor) break;
  }

  // Daily launch: after the catalog is fresh, promote up to `quota` new markets
  // per club category onto the board (seeded, listed, oracle-linked) and record
  // the count. Refresh runs skip this — they exist only to keep odds current.
  if (mode === "launch") {
    const { data: listed, error: e2 } = await supabase.rpc("term_autolist_run", { p_quota: quota });
    if (e2) return json({ error: e2.message, events, upserted }, 500);
    return json({ ok: true, mode, events, upserted, listed });
  }

  return json({ ok: true, mode, events, upserted });
});

function json(body: unknown, statusCode = 200) {
  return new Response(JSON.stringify(body), {
    status: statusCode,
    headers: { "content-type": "application/json" },
  });
}
