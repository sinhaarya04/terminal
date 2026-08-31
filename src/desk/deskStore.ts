// Client-only state for the /desk demo terminal. Everything lives in
// localStorage so "the intro video plays only on first sign-in" and fake
// balances / positions / custom markets survive reloads. No backend — this is
// a self-contained demo of what the E[X] terminal will feel like.

import { useSyncExternalStore } from 'react';
import * as db from './terminalDb';

const KEY = 'ex_desk_v1';
const START_BALANCE = 1000; // fake E[X] credits handed to every new desk

export type Side = 'YES' | 'NO';

export type Position = {
  marketId: string;
  side: Side;
  shares: number;   // 1 share pays $1 if the side wins
  cost: number;     // total $ paid (cost basis)
};

export type DeskMarket = {
  id: string;        // WEEK-01 for seeded, share code (EX-XXXX) for custom
  q: string;
  cat: string;
  yes: number;       // current YES price in cents (0-100) = crowd probability
  closes: string;
  spark: number[];   // recent price path 0-100
  custom?: boolean;  // true for user-created markets
  owner?: string;    // handle of the creator
  pool?: number;     // total fake $ staked in a custom market
};

export type DeskState = {
  user: { handle: string } | null;
  seenIntro: boolean;
  balance: number;
  positions: Position[];
  markets: DeskMarket[];  // public demo markets (prices move as you trade)
  custom: DeskMarket[];   // markets this browser created or joined by code
  joined: string[];       // share codes joined
  live: boolean;          // true = real Supabase account; false = guest/localStorage demo
  userId?: string;        // Supabase auth user id (live mode only)
};

// Public demo markets — same flavour as the marketing board, but here the
// Yes/No buttons actually move money and nudge the price.
const SEED_PUBLIC: DeskMarket[] = [
  { id: 'WEEK-01', cat: 'Campus', q: 'Will it snow in Boston before Thanksgiving?', yes: 62, closes: 'Nov 27', spark: [38, 41, 40, 45, 44, 51, 49, 55, 58, 62] },
  { id: 'WEEK-02', cat: 'Econ', q: 'Does the Fed cut rates at the December FOMC?', yes: 71, closes: 'Dec 10', spark: [80, 78, 74, 76, 72, 75, 74, 73, 74, 71] },
  { id: 'WEEK-03', cat: 'Sports', q: 'Huskies make the Beanpot final?', yes: 44, closes: 'Feb 02', spark: [30, 32, 35, 33, 36, 38, 37, 40, 38, 44] },
  { id: 'WEEK-04', cat: 'Crypto', q: 'Bitcoin above $150k on Jan 1?', yes: 33, closes: 'Jan 01', spark: [52, 50, 47, 48, 44, 45, 41, 39, 41, 33] },
  { id: 'WEEK-05', cat: 'Tech', q: 'OpenAI ships GPT-6 before the semester ends?', yes: 26, closes: 'Dec 18', spark: [20, 21, 19, 22, 24, 23, 25, 24, 24, 26] },
  { id: 'WEEK-06', cat: 'Weather', q: 'Average finals-week temperature below 30°F?', yes: 39, closes: 'Dec 12', spark: [28, 30, 29, 32, 33, 31, 34, 36, 35, 39] },
  { id: 'WEEK-07', cat: 'E[X]', q: 'Club hits 100 signed-up members by opening day?', yes: 83, closes: 'Sep 01', spark: [60, 63, 66, 65, 70, 72, 74, 78, 76, 83] },
];

// A demo market that already exists so "enter a share code" works out of the
// box — try code EX-DEMO on the Personal tab before creating your own.
const SEED_CUSTOM: DeskMarket = {
  id: 'EX-DEMO',
  q: 'Will our intramural team win its next match?',
  cat: 'Private',
  yes: 55,
  closes: 'Fri',
  spark: [50, 52, 49, 53, 51, 54, 52, 55, 53, 55],
  custom: true,
  owner: 'oracle',
  pool: 120,
};

function fresh(): DeskState {
  return {
    user: null, seenIntro: false, balance: START_BALANCE, positions: [],
    markets: SEED_PUBLIC.map((m) => ({ ...m, spark: [...m.spark] })),
    custom: [], joined: [], live: false,
  };
}

function load(): DeskState {
  if (typeof localStorage === 'undefined') return fresh();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh();
    // Never restore a live session from localStorage — it re-hydrates from Supabase.
    return { ...fresh(), ...JSON.parse(raw), live: false, userId: undefined };
  } catch {
    return fresh();
  }
}

let state: DeskState = load();
const listeners = new Set<() => void>();

function persist() {
  if (state.live) return; // live state lives in Supabase, not localStorage
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore quota */ }
}

function set(next: Partial<DeskState>) {
  state = { ...state, ...next };
  persist();
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

export function useDesk(): DeskState {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

// ---- actions -------------------------------------------------------------

/** Guest sign-in (no account) — local demo mode only. */
export function signIn(handle: string) {
  const h = handle.trim() || 'trader';
  // Preserve seenIntro across sign-outs so the video is truly one-time.
  set({ user: { handle: h }, live: false });
}

/** Enter live mode for a real Supabase account and hydrate from the DB. */
export async function hydrateLive(userId: string) {
  const profile = await db.fetchProfile();
  if (!profile) { // tables not set up yet / no profile row — fall back to guest
    set({ live: false });
    return;
  }
  const [mine, betMarkets, bets] = await Promise.all([
    db.fetchMyMarkets(userId), db.fetchBetMarkets(), db.fetchMyBets(),
  ]);
  // merge fetched markets (for live price on Positions) into the public list
  const markets = SEED_PUBLIC.map((m) => ({ ...m, spark: [...m.spark] }));
  for (const bm of betMarkets) if (!bm.custom && !markets.some((x) => x.id === bm.id)) markets.push(bm);
  state = {
    ...state, live: true, userId,
    user: { handle: profile.handle }, seenIntro: profile.seenIntro, balance: profile.balance,
    positions: bets, markets, custom: mine, joined: mine.map((m) => m.id),
  };
  listeners.forEach((l) => l());
}

/** Leave live mode (after Supabase sign-out) → back to a signed-out desk. */
export function exitLive() {
  state = { ...fresh() };
  listeners.forEach((l) => l());
}

export function signOut() {
  if (state.live) { exitLive(); return; }
  set({ user: null });
}

export async function markIntroSeen() {
  if (state.live) { try { await db.rpcSetSeenIntro(); } catch { /* best-effort */ } }
  set({ seenIntro: true });
}

/** Reset the whole demo (fresh balance, clears the intro flag → video replays). */
export function resetDesk() {
  state = fresh();
  persist();
  listeners.forEach((l) => l());
}

/** Buy `dollars` worth of one side of a market at its current price. */
export async function placeBet(m: DeskMarket, side: Side, dollars: number): Promise<boolean> {
  if (dollars <= 0 || dollars > state.balance) return false;

  if (state.live) {
    try {
      if (!m.custom) await db.rpcUpsertPublicMarket(m);      // materialise public markets on first bet
      const res = await db.rpcPlaceBet(m.id, side, dollars); // atomic server-side money move
      applyBet(m, side, dollars, res.balance, res.yes);
    } catch { return false; }
    return true;
  }

  // guest/demo (localStorage): compute everything client-side
  const nudge = Math.min(6, Math.max(1, Math.round(dollars / 40)));
  const newYes = clamp(side === 'YES' ? m.yes + nudge : m.yes - nudge, 2, 98);
  applyBet(m, side, dollars, round2(state.balance - dollars), newYes);
  return true;
}

/** Shared local-state update after a bet (both live + guest use this). */
function applyBet(m: DeskMarket, side: Side, dollars: number, newBalance: number, newYes: number) {
  const price = side === 'YES' ? m.yes : 100 - m.yes;
  const shares = dollars / (price / 100);
  const positions = [...state.positions];
  const idx = positions.findIndex((p) => p.marketId === m.id && p.side === side);
  if (idx >= 0) positions[idx] = { ...positions[idx], shares: positions[idx].shares + shares, cost: positions[idx].cost + dollars };
  else positions.push({ marketId: m.id, side, shares, cost: dollars });

  // ensure the market is tracked so Positions can price it, then nudge it
  if (!state.markets.some((x) => x.id === m.id) && !state.custom.some((x) => x.id === m.id)) {
    state = { ...state, [m.custom ? 'custom' : 'markets']: [...(m.custom ? state.custom : state.markets), { ...m }] } as DeskState;
  }
  bumpMarketPrice(m.id, newYes);
  if (m.custom) {
    state = { ...state, custom: state.custom.map((c) => (c.id === m.id ? { ...c, pool: round2((c.pool || 0) + dollars) } : c)) };
  }
  set({ balance: round2(newBalance), positions });
}

export async function createMarket(input: { q: string; cat: string; closes: string; yes: number }): Promise<DeskMarket> {
  const yes = clamp(Math.round(input.yes), 2, 98);
  const code = state.live ? (await db.rpcCreateMarket({ ...input, yes })) ?? genCode() : genCode();
  const m: DeskMarket = {
    id: code,
    q: input.q.trim(),
    cat: input.cat.trim() || 'Private',
    yes,
    closes: input.closes.trim() || 'TBD',
    spark: [yes, yes, yes, yes, yes],
    custom: true,
    owner: state.user?.handle || 'you',
    pool: 0,
  };
  set({ custom: [m, ...state.custom], joined: [code, ...state.joined] });
  return m;
}

/** Look up a share code among created markets + the built-in demo seed. */
export function findByCode(code: string): DeskMarket | null {
  const c = code.trim().toUpperCase();
  if (!c) return null;
  const own = state.custom.find((m) => m.id === c);
  if (own) return own;
  if (c === SEED_CUSTOM.id) return SEED_CUSTOM;
  return null;
}

/** Join a market by code — pulls it into this account's/browser's list. */
export async function joinByCode(code: string): Promise<DeskMarket | null> {
  const m = state.live ? await db.getMarketByCode(code) : findByCode(code);
  if (!m) return null;
  if (!state.custom.some((x) => x.id === m.id)) {
    set({ custom: [m, ...state.custom], joined: [m.id, ...state.joined] });
  } else if (!state.joined.includes(m.id)) {
    set({ joined: [m.id, ...state.joined] });
  }
  return m;
}

function bumpMarketPrice(id: string, newYes: number) {
  const roll = (arr: DeskMarket[]) =>
    arr.map((c) => (c.id === id ? { ...c, yes: newYes, spark: [...c.spark.slice(-9), newYes] } : c));
  state = { ...state, markets: roll(state.markets), custom: roll(state.custom) };
}

/** Resolve a market id to its current record (public or custom). */
export function getMarket(id: string): DeskMarket | undefined {
  return state.markets.find((m) => m.id === id) || state.custom.find((m) => m.id === id);
}

/** Register a market in the public list if it isn't tracked yet (so bets on
 *  multi-outcome board markets resolve live P&L on the Positions tab). */
export function ensureMarket(m: DeskMarket) {
  if (state.markets.some((x) => x.id === m.id) || state.custom.some((x) => x.id === m.id)) return;
  set({ markets: [...state.markets, { ...m, spark: [...m.spark] }] });
}

// ---- helpers -------------------------------------------------------------

export const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
export const round2 = (n: number) => Math.round(n * 100) / 100;
export const money = (n: number) =>
  '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function genCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous 0/O/1/I
  let s = '';
  for (let i = 0; i < 4; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `EX-${s}`;
}

/** Current mark-to-market value of a position at a market's live price. */
export function positionValue(p: Position, m: DeskMarket | undefined): number {
  if (!m) return p.cost;
  const price = p.side === 'YES' ? m.yes : 100 - m.yes;
  return round2(p.shares * (price / 100));
}
