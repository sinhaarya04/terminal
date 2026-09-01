// Supabase data layer for the /terminal desk. Only used in "live" mode (a real
// signed-in Northeastern account). Guest/demo mode never calls any of this and
// stays entirely in localStorage (see deskStore.ts).
import { supabase } from '../lib/supabase';
import type { DeskMarket } from './deskStore';

export type LiveProfile = { handle: string; balance: number; pmBalance: number; seenIntro: boolean };

type MarketRow = { code: string; owner: string | null; question: string; cat: string; closes: string | null; closes_at: string | null; owner_handle: string | null; yes: number; pq_yes: number | null; pq_no: number | null; sq_yes: number | null; sq_no: number | null; b: number | null; c0: number | null; pool: number; is_private: boolean; resolved: 'YES' | 'NO' | 'VOID' | null; resolved_at: string | null };
type BetRow = { market_code: string; side: 'YES' | 'NO'; shares: number; cost: number };

const flatSpark = (yes: number) => [yes, yes, yes, yes, yes];

function rowToMarket(r: MarketRow): DeskMarket {
  return {
    id: r.code, q: r.question, cat: r.cat, yes: Number(r.yes), closes: r.closes || 'TBD',
    closesAt: r.closes_at ? Date.parse(r.closes_at) : undefined,
    spark: flatSpark(Number(r.yes)), custom: r.is_private,
    // Two separate things: `owner` is what the UI prints, `ownerId` is what
    // settlement authority is checked against. Collapsing them would either
    // print a uuid at people or make every live market unsettleable.
    owner: r.owner_handle ?? (r.owner ? 'member' : 'house'),
    ownerId: r.owner ?? undefined,
    pool: Number(r.pool),
    resolved: r.resolved ?? undefined,
    resolvedAt: r.resolved_at ? Date.parse(r.resolved_at) : undefined,
    qYes: r.pq_yes != null ? Number(r.pq_yes) : undefined,
    qNo: r.pq_no != null ? Number(r.pq_no) : undefined,
    sqYes: r.sq_yes != null ? Number(r.sq_yes) : undefined,
    sqNo: r.sq_no != null ? Number(r.sq_no) : undefined,
    b: r.b != null ? Number(r.b) : undefined,
    c0: r.c0 != null ? Number(r.c0) : undefined,
  };
}

export async function fetchProfile(): Promise<LiveProfile | null> {
  if (!supabase) return null;
  const { data } = await supabase.from('term_profiles').select('handle,balance,pm_balance,seen_intro').maybeSingle();
  if (!data) return null;
  return {
    handle: data.handle ?? 'trader', balance: Number(data.balance),
    pmBalance: Number(data.pm_balance ?? 1000), seenIntro: !!data.seen_intro,
  };
}

/** Markets I own plus any I've bet on (so joined codes persist across devices). */
export async function fetchMyMarkets(userId: string): Promise<DeskMarket[]> {
  if (!supabase) return [];
  const mine = await supabase.from('term_markets').select('*').eq('owner', userId);
  const betRows = await supabase.from('term_bets').select('market_code');
  const codes = [...new Set((betRows.data ?? []).map((b: { market_code: string }) => b.market_code))];
  let joined: MarketRow[] = [];
  if (codes.length) {
    const j = await supabase.from('term_markets').select('*').in('code', codes).eq('is_private', true);
    joined = (j.data ?? []) as MarketRow[];
  }
  const all = new Map<string, DeskMarket>();
  [...((mine.data ?? []) as MarketRow[]), ...joined].forEach((r) => all.set(r.code, rowToMarket(r)));
  return [...all.values()];
}

/** Markets referenced by my bets (needed so Positions can show live prices). */
export async function fetchBetMarkets(): Promise<DeskMarket[]> {
  if (!supabase) return [];
  const bets = await supabase.from('term_bets').select('market_code');
  const codes = [...new Set((bets.data ?? []).map((b: { market_code: string }) => b.market_code))];
  if (!codes.length) return [];
  const { data } = await supabase.from('term_markets').select('*').in('code', codes);
  return ((data ?? []) as MarketRow[]).map(rowToMarket);
}

export async function fetchMyBets(): Promise<{ marketId: string; side: 'YES' | 'NO'; shares: number; cost: number }[]> {
  if (!supabase) return [];
  const { data } = await supabase.from('term_bets').select('market_code,side,shares,cost');
  // Sells are negative rows; a position is the NET of buys and sells per
  // market+side. Without this, a reload would show a sold-out position as a
  // pair of rows, one of them holding negative shares.
  const agg = new Map<string, { marketId: string; side: 'YES' | 'NO'; shares: number; cost: number }>();
  for (const b of (data ?? []) as BetRow[]) {
    const k = `${b.market_code}|${b.side}`;
    const cur = agg.get(k) ?? { marketId: b.market_code, side: b.side, shares: 0, cost: 0 };
    cur.shares += Number(b.shares);
    cur.cost += Number(b.cost);
    agg.set(k, cur);
  }
  return [...agg.values()].filter((p) => p.shares > 1e-9 || Math.abs(p.cost) > 0.005);
}

export async function getMarketByCode(code: string): Promise<DeskMarket | null> {
  if (!supabase) return null;
  const { data } = await supabase.from('term_markets').select('*').eq('code', code.trim().toUpperCase()).maybeSingle();
  return data ? rowToMarket(data as MarketRow) : null;
}

export async function rpcCreateMarket(
  input: { q: string; cat: string; closes: string; yes: number; closesAt?: number },
): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('term_create_market', {
    p_question: input.q, p_cat: input.cat, p_closes: input.closes, p_yes: input.yes,
    p_closes_at: input.closesAt != null ? new Date(input.closesAt).toISOString() : null,
  });
  if (error) throw error;
  return data as string;
}

/** Create this account's profile row if it doesn't exist yet. Called on
 *  sign-in: there is no signup trigger, on purpose — see terminal-schema.sql. */
export async function rpcEnsureProfile(): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.rpc('term_ensure_profile');
  if (error) throw error;
}

export async function rpcUpsertPublicMarket(m: DeskMarket): Promise<void> {
  if (!supabase) return;
  await supabase.rpc('term_upsert_public_market', { p_code: m.id, p_question: m.q, p_cat: m.cat, p_yes: m.yes });
}

export async function rpcPlaceBet(code: string, side: 'YES' | 'NO', dollars: number): Promise<{ balance: number; pm_balance: number; yes: number; shares: number }> {
  if (!supabase) throw new Error('offline');
  const { data, error } = await supabase.rpc('term_place_bet', { p_code: code, p_side: side, p_dollars: dollars });
  if (error) throw error;
  return data as { balance: number; pm_balance: number; yes: number; shares: number };
}

export async function rpcSetSeenIntro(): Promise<void> {
  if (!supabase) return;
  await supabase.rpc('term_set_seen_intro');
}

/** Settle a private market. The RPC enforces owner-only + once-only server-side
 *  and credits every winning share $1; this client call just triggers it. */
export async function rpcResolveMarket(code: string, outcome: 'YES' | 'NO'): Promise<void> {
  if (!supabase) throw new Error('offline');
  const { error } = await supabase.rpc('term_resolve_market', { p_code: code, p_outcome: outcome });
  if (error) throw error;
}

type ActivityRow = { id: string; market_code: string; handle: string; kind: 'create' | 'join' | 'bet' | 'resolve'; side: 'YES' | 'NO' | null; dollars: number | null; created_at: string };

/** A market's feed, newest first. Written server-side by the RPCs. */
export async function fetchActivity(code: string): Promise<{
  id: string; code: string; handle: string; kind: ActivityRow['kind'];
  side?: 'YES' | 'NO'; dollars?: number; at: number;
}[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('term_activity')
    .select('*').eq('market_code', code)
    .order('created_at', { ascending: false }).limit(50);
  // null = "couldn't ask", [] = "asked, feed is empty". The distinction
  // matters: a failed fetch once wiped a market's locally-recorded feed
  // because it was indistinguishable from an empty one (the PostgREST
  // schema cache hadn't picked the table up yet).
  if (error) return null;
  return ((data ?? []) as ActivityRow[]).map((r) => ({
    id: r.id, code: r.market_code, handle: r.handle, kind: r.kind,
    side: r.side ?? undefined, dollars: r.dollars != null ? Number(r.dollars) : undefined,
    at: Date.parse(r.created_at),
  }));
}

/** Record that this account joined a market (once per user per market). */
export async function rpcLogJoin(code: string): Promise<void> {
  if (!supabase) return;
  await supabase.rpc('term_log_join', { p_code: code });
}

/** The account's own bets, newest first, joined to their markets so history
 *  shows a question and which wallet paid, not just a code. */
export async function fetchMyTrades(): Promise<{
  id: string; marketId: string; q: string; kind: 'buy' | 'sell'; side: 'YES' | 'NO';
  dollars: number; shares: number; wallet: 'board' | 'sim'; at: number;
}[]> {
  if (!supabase) return [];
  const { data } = await supabase.from('term_bets')
    .select('id,market_code,side,shares,cost,created_at,term_markets(question,is_private)')
    .order('created_at', { ascending: false }).limit(100);
  type Row = { id: string; market_code: string; side: 'YES' | 'NO'; shares: number; cost: number; created_at: string; term_markets: { question: string; is_private: boolean } | null };
  // sells are stored as negative bet rows; the ledger shows them as their own
  // kind with positive magnitudes (dollars received, shares sold)
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id, marketId: r.market_code,
    q: r.term_markets?.question ?? r.market_code,
    kind: (Number(r.shares) < 0 ? 'sell' : 'buy') as 'buy' | 'sell',
    side: r.side, dollars: Math.abs(Number(r.cost)), shares: Math.abs(Number(r.shares)),
    wallet: r.term_markets?.is_private === false ? 'board' : 'sim',
    at: Date.parse(r.created_at),
  }));
}

/** Sell shares back to the LMSR meter for their live value. */
export async function rpcSellShares(code: string, side: 'YES' | 'NO', shares: number):
  Promise<{ balance: number; pm_balance: number; yes: number; proceeds: number }> {
  if (!supabase) throw new Error('offline');
  const { data, error } = await supabase.rpc('term_sell_shares', { p_code: code, p_side: side, p_shares: shares });
  if (error) throw error;
  return data as { balance: number; pm_balance: number; yes: number; proceeds: number };
}
