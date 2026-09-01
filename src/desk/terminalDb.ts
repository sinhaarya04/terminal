// Supabase data layer for the /terminal desk. Only used in "live" mode (a real
// signed-in Northeastern account). Guest/demo mode never calls any of this and
// stays entirely in localStorage (see deskStore.ts).
import { supabase } from '../lib/supabase';
import type { DeskMarket } from './deskStore';

export type LiveProfile = { handle: string; balance: number; seenIntro: boolean };

type MarketRow = { code: string; owner: string | null; question: string; cat: string; closes: string | null; closes_at: string | null; owner_handle: string | null; yes: number; pool: number; is_private: boolean; resolved: 'YES' | 'NO' | null };
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
  };
}

export async function fetchProfile(): Promise<LiveProfile | null> {
  if (!supabase) return null;
  const { data } = await supabase.from('term_profiles').select('handle,balance,seen_intro').maybeSingle();
  if (!data) return null;
  return { handle: data.handle ?? 'trader', balance: Number(data.balance), seenIntro: !!data.seen_intro };
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
  return ((data ?? []) as BetRow[]).map((b) => ({ marketId: b.market_code, side: b.side, shares: Number(b.shares), cost: Number(b.cost) }));
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

export async function rpcPlaceBet(code: string, side: 'YES' | 'NO', dollars: number): Promise<{ balance: number; yes: number }> {
  if (!supabase) throw new Error('offline');
  const { data, error } = await supabase.rpc('term_place_bet', { p_code: code, p_side: side, p_dollars: dollars });
  if (error) throw error;
  return data as { balance: number; yes: number };
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
