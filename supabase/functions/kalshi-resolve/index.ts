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

  // Board markets still open, that were listed from Kalshi, joined to the catalog
  // row (added_market_code = code) so we know which Kalshi ticker to poll.
  const { data: rows, error: selErr } = await supabase
    .from("term_markets")
    .select("code, term_kalshi_catalog!term_kalshi_catalog_added_market_code_fkey(ticker)")
    .is("owner", null)
    .eq("listed", true)
    .is("resolved", null);

  if (selErr) {
    // Fall back to an explicit two-step read if the embedded join isn't available.
    const fb = await supabase
      .from("term_markets")
      .select("code")
      .is("owner", null)
      .eq("listed", true)
      .is("resolved", null);
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
    return json({ checked, resolved, errors, details });
  }

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

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
