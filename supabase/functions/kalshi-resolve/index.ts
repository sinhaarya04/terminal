import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const KALSHI_BASE = "https://api.elections.kalshi.com/trade-api/v2/markets";
const SETTLED_STATUSES = new Set(["finalized", "settled"]);

Deno.serve(async (_req: Request) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let checked = 0;
  let resolved = 0;
  let errors = 0;
  const details: unknown[] = [];

  // ---- Binary board markets --------------------------------------------
  // Board markets still open, that were listed from Kalshi, joined to the catalog
  // row (added_market_code = code) so we know which Kalshi ticker to poll.
  const { data: rows, error: selErr } = await supabase
    .from("term_markets")
    .select("code, is_multi, term_kalshi_catalog!term_kalshi_catalog_added_market_code_fkey(ticker)")
    .is("owner", null)
    .eq("listed", true)
    .is("resolved", null)
    .eq("is_multi", false);

  if (selErr) {
    // Fall back to an explicit two-step read if the embedded join isn't available.
    const fb = await supabase
      .from("term_markets")
      .select("code")
      .is("owner", null)
      .eq("listed", true)
      .is("resolved", null)
      .eq("is_multi", false);
    if (fb.error) {
      return json({ checked, resolved, errors: 1, error: fb.error.message }, 500);
    }
    const codes = (fb.data ?? []).map((r: { code: string }) => r.code);
    const { data: cat } = await supabase
      .from("term_kalshi_catalog")
      .select("ticker, added_market_code")
      .in("added_market_code", codes.length ? codes : ["__none__"]);
    const map = new Map<string, string>();
    for (const c of cat ?? []) map.set((c as any).added_market_code, (c as any).ticker);
    const pairs = codes
      .map((code) => ({ code, ticker: map.get(code) }))
      .filter((p) => p.ticker) as { code: string; ticker: string }[];
    for (const p of pairs) {
      const r = await resolveOne(supabase, p.code, p.ticker);
      checked++;
      if (r.resolved) resolved++;
      if (r.error) { errors++; details.push({ code: p.code, error: r.error }); }
    }
  } else {
    for (const row of rows ?? []) {
      const code = (row as any).code as string;
      const cat = (row as any).term_kalshi_catalog;
      const ticker = Array.isArray(cat) ? cat[0]?.ticker : cat?.ticker;
      if (!ticker) continue;
      const r = await resolveOne(supabase, code, ticker);
      checked++;
      if (r.resolved) resolved++;
      if (r.error) { errors++; details.push({ code, error: r.error }); }
    }
  }

  // ---- Multi (event) board markets -------------------------------------
  // Each multi board market has one term_market_outcomes row per Kalshi option,
  // each carrying its originating kalshi_ticker. We resolve once the whole event
  // has settled and exactly one option came back result='yes'.
  const { data: multis, error: mErr } = await supabase
    .from("term_markets")
    .select("code")
    .is("owner", null)
    .eq("listed", true)
    .is("resolved", null)
    .eq("is_multi", true);

  if (mErr) {
    errors++;
    details.push({ scope: "multi", error: mErr.message });
  } else {
    for (const row of multis ?? []) {
      const code = (row as any).code as string;
      const r = await resolveMulti(supabase, code);
      checked++;
      if (r.resolved) resolved++;
      if (r.error) { errors++; details.push({ code, error: r.error }); }
    }
  }

  return json({ checked, resolved, errors, details });
});

async function resolveOne(
  supabase: ReturnType<typeof createClient>,
  code: string,
  ticker: string,
): Promise<{ resolved: boolean; error?: string }> {
  try {
    const resp = await fetch(`${KALSHI_BASE}/${encodeURIComponent(ticker)}`, {
      headers: { accept: "application/json" },
    });
    if (!resp.ok) {
      return { resolved: false, error: `kalshi ${resp.status} for ${ticker}` };
    }
    const body = await resp.json();
    const market = body?.market ?? {};
    const status = String(market.status ?? "").toLowerCase();
    const result = String(market.result ?? "").toLowerCase();

    if (!SETTLED_STATUSES.has(status)) return { resolved: false };
    if (result !== "yes" && result !== "no") return { resolved: false };

    // Record the settlement onto the catalog row.
    await supabase
      .from("term_kalshi_catalog")
      .update({ status, result })
      .eq("ticker", ticker);

    // Pay out the board market via the system oracle RPC (idempotent).
    const { error: rpcErr } = await supabase.rpc("term_resolve_from_oracle", {
      p_market_code: code,
      p_side: result.toUpperCase(),
    });
    if (rpcErr) return { resolved: false, error: rpcErr.message };

    return { resolved: true };
  } catch (e) {
    return { resolved: false, error: String(e instanceof Error ? e.message : e) };
  }
}

async function resolveMulti(
  supabase: ReturnType<typeof createClient>,
  code: string,
): Promise<{ resolved: boolean; error?: string }> {
  try {
    const { data: outcomes, error: oErr } = await supabase
      .from("term_market_outcomes")
      .select("idx, kalshi_ticker")
      .eq("market_code", code)
      .order("idx");
    if (oErr) return { resolved: false, error: oErr.message };

    const opts = (outcomes ?? []).filter(
      (o: any) => o.kalshi_ticker,
    ) as { idx: number; kalshi_ticker: string }[];
    if (opts.length === 0) return { resolved: false };

    let allSettled = true;
    const winners: number[] = [];

    for (const o of opts) {
      const resp = await fetch(
        `${KALSHI_BASE}/${encodeURIComponent(o.kalshi_ticker)}`,
        { headers: { accept: "application/json" } },
      );
      if (!resp.ok) {
        // Can't confirm the event is fully settled -> skip this run.
        return { resolved: false, error: `kalshi ${resp.status} for ${o.kalshi_ticker}` };
      }
      const body = await resp.json();
      const market = body?.market ?? {};
      const status = String(market.status ?? "").toLowerCase();
      const result = String(market.result ?? "").toLowerCase();

      // Keep the catalog row's settlement info fresh.
      await supabase
        .from("term_kalshi_catalog")
        .update({ status, result })
        .eq("ticker", o.kalshi_ticker);

      if (!SETTLED_STATUSES.has(status)) allSettled = false;
      if (result === "yes") winners.push(o.idx);
    }

    // Only resolve a fully-settled, single-winner event.
    if (!allSettled) return { resolved: false };
    if (winners.length !== 1) return { resolved: false };

    const { error: rpcErr } = await supabase.rpc("term_resolve_multi_from_oracle", {
      p_market_code: code,
      p_winning_idx: winners[0],
    });
    if (rpcErr) return { resolved: false, error: rpcErr.message };

    return { resolved: true };
  } catch (e) {
    return { resolved: false, error: String(e instanceof Error ? e.message : e) };
  }
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
