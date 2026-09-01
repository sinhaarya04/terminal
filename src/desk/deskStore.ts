// Client-only state for the /desk demo terminal. Everything lives in
// localStorage so "the intro video plays only on first sign-in" and fake
// balances / positions / custom markets survive reloads. No backend — this is
// a self-contained demo of what the E[X] terminal will feel like.

import { useSyncExternalStore } from 'react';
import * as db from './terminalDb';
import { endOfDay } from '../lib/closeTime';

const KEY = 'ex_desk_v1';
const START_BALANCE = 1000;    // main platform credits (board markets)
const START_PM_BALANCE = 1000; // personal-market fun money — a separate wallet

export type Side = 'YES' | 'NO';

export type Position = {
  marketId: string;
  side: Side;
  shares: number;   // 1 share pays $1 if the side wins
  cost: number;     // total $ paid (cost basis)
  // Set once the market settles. The position stops marking to market and is
  // worth exactly what it paid out, so Positions can show a closed row with a
  // final P&L instead of a price that will never move again.
  settled?: { outcome: Side; payout: number };
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
  resolved?: Side;   // set when the owner settles it; blocks further betting
  // Live mode only: the owner's auth id. `owner` is a display handle and is not
  // unique, so settlement authority is checked against this when it exists.
  ownerId?: string;
  // When betting stops, epoch ms. Private markets only — the public board fills
  // `closes` with a display string that was never a date. Absent means the
  // market never closes on its own, which is how every market behaved before
  // close dates existed.
  closesAt?: number;
};

/** open → closed → settled. Derived from the clock every time it's asked
 *  rather than stored, so it stays right across reloads, sleeping laptops and
 *  two tabs disagreeing — none of which a setTimeout survives. */
export type MarketPhase = 'open' | 'closed' | 'settled';

export function marketPhase(m: DeskMarket, now: number = Date.now()): MarketPhase {
  if (m.resolved) return 'settled';
  if (m.closesAt != null && now >= m.closesAt) return 'closed';
  return 'open';
}

/** One line of a private market's history — who did what, when. Private markets
 *  are played with people you know, so the feed is the point: without it a
 *  market is a price with no evidence anyone else is there. */
export type Activity = {
  id: string;
  code: string;      // market share code the event belongs to
  handle: string;
  kind: 'create' | 'join' | 'bet' | 'resolve';
  side?: Side;       // bet + resolve
  dollars?: number;  // bet only
  at: number;        // epoch ms
};

export type DeskState = {
  user: { handle: string } | null;
  seenIntro: boolean;
  balance: number;    // main platform credits — board markets bet in this
  // Personal markets settle in their own simulation wallet. Keeping the two
  // apart is the point: private jokes can't bankroll board positions.
  pmBalance: number;
  positions: Position[];
  markets: DeskMarket[];  // public demo markets (prices move as you trade)
  custom: DeskMarket[];   // markets this browser created or joined by code
  joined: string[];       // share codes joined
  activity: Activity[];   // newest-first feed across all private markets
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
// box — try code EX-DEMO on the Personal tab before creating your own. It also
// ships in every fresh desk (see `fresh()`): landing on Personal with an empty
// list and no way to see what a private market looks like taught nothing.
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

// Backdated so the demo market reads as a going concern rather than something
// that happened at page load. Minutes before now, newest last.
const SEED_ACTIVITY: [string, Activity['kind'], number, Side | undefined, number | undefined][] = [
  ['oracle', 'create', 310, undefined, undefined],
  ['oracle', 'bet', 295, 'YES', 40],
  ['dmitri', 'join', 180, undefined, undefined],
  ['dmitri', 'bet', 176, 'NO', 25],
  ['priya', 'join', 92, undefined, undefined],
  ['priya', 'bet', 88, 'YES', 55],
];

function seedActivity(): Activity[] {
  const now = Date.now();
  return SEED_ACTIVITY
    .map(([handle, kind, minsAgo, side, dollars], i) => ({
      id: `seed-${i}`, code: SEED_CUSTOM.id, handle, kind, side, dollars,
      at: now - minsAgo * 60_000,
    }))
    .sort((a, b) => b.at - a.at);
}

function fresh(): DeskState {
  return {
    user: null, seenIntro: false, balance: START_BALANCE, pmBalance: START_PM_BALANCE, positions: [],
    markets: SEED_PUBLIC.map((m) => ({ ...m, spark: [...m.spark] })),
    // computed at seed time, like seedActivity, so the demo market is always a
    // few days from closing rather than frozen at whenever this shipped
    custom: [{ ...SEED_CUSTOM, spark: [...SEED_CUSTOM.spark], closesAt: endOfDay(3) }],
    joined: [SEED_CUSTOM.id], activity: seedActivity(), live: false,
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

/** Enter live mode for a real Supabase account and hydrate from the DB. */
export async function hydrateLive(userId: string) {
  // No trigger creates this row (the auth table is shared with the poker portal
  // and the applicant flow), so the terminal makes its own profile on arrival.
  try { await db.rpcEnsureProfile(); } catch { /* fall through to the null check */ }
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
    user: { handle: profile.handle }, seenIntro: profile.seenIntro,
    balance: profile.balance, pmBalance: profile.pmBalance,
    positions: bets, markets, custom: mine, joined: mine.map((m) => m.id),
    // The server has no activity table yet, so live mode starts with an empty
    // feed rather than inventing one. Local events still append as you play.
    activity: [],
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

/** Append one event to the private-market feed. Only private markets have a
 *  feed — the public board's crowd is implied by its volume, not named. */
function recordActivity(e: Omit<Activity, 'id' | 'at' | 'handle'> & { handle?: string }) {
  const ev: Activity = {
    id: `${e.code}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    at: Date.now(),
    handle: e.handle || state.user?.handle || 'you',
    ...e,
  };
  set({ activity: [ev, ...state.activity].slice(0, 200) });
}

/** Live mode: re-fetch one market's row and feed, so the pool, price, resolved
 *  state and other people's activity reflect the server rather than whatever
 *  this browser last saw. Guest mode has no server to ask, so it's a no-op. */
export async function refreshLiveMarket(code: string): Promise<void> {
  if (!state.live) return;
  try {
    const [m, feed] = await Promise.all([db.getMarketByCode(code), db.fetchActivity(code)]);
    if (!m) return;
    const roll = (arr: DeskMarket[]) => arr.map((c) => (c.id === code ? { ...m, spark: c.spark } : c));
    // Server truth replaces this market's slice of the feed — but only when the
    // server actually answered. A failed fetch (feed null) keeps whatever this
    // browser already recorded rather than erasing it.
    const activity = feed == null
      ? state.activity
      : [...feed, ...state.activity.filter((a) => a.code !== code)].sort((a, b) => b.at - a.at);
    set({ custom: roll(state.custom), markets: roll(state.markets), activity });
  } catch { /* stale view is better than an error here */ }
}

/** Everyone who has shown up in a market's feed, most recently active first. */
export function participants(code: string): { handle: string; at: number }[] {
  const seen = new Map<string, number>();
  for (const a of state.activity) {
    if (a.code !== code) continue;
    if (!seen.has(a.handle)) seen.set(a.handle, a.at);
  }
  return [...seen.entries()]
    .map(([handle, at]) => ({ handle, at }))
    .sort((a, b) => b.at - a.at);
}

/** A market's feed, newest first. */
export function marketActivity(code: string): Activity[] {
  return state.activity.filter((a) => a.code === code);
}

/** Buy `dollars` worth of one side of a market at its current price. */
/** Which wallet a market bets in. Private markets play with fun money. */
export function walletFor(m: DeskMarket): 'balance' | 'pmBalance' {
  return m.custom ? 'pmBalance' : 'balance';
}

export async function placeBet(m: DeskMarket, side: Side, dollars: number): Promise<boolean> {
  if (dollars <= 0 || dollars > state[walletFor(m)]) return false;
  // Betting is an `open`-only action: a settled market has already paid out, and
  // a closed one is waiting on its result. Either way the share being sold could
  // never come to anything. Checked against the stored record, since `m` may be
  // a snapshot taken before the market closed.
  if (marketPhase(getMarket(m.id) ?? m) !== 'open') return false;

  if (state.live) {
    try {
      if (!m.custom) await db.rpcUpsertPublicMarket(m);      // materialise public markets on first bet
      const res = await db.rpcPlaceBet(m.id, side, dollars); // atomic server-side money move
      applyBet(m, side, dollars, { balance: res.balance, pmBalance: res.pm_balance }, res.yes);
    } catch { return false; }
    return true;
  }

  // guest/demo (localStorage): compute everything client-side
  const nudge = Math.min(6, Math.max(1, Math.round(dollars / 40)));
  const newYes = clamp(side === 'YES' ? m.yes + nudge : m.yes - nudge, 2, 98);
  const w = walletFor(m);
  applyBet(m, side, dollars, { ...pick(), [w]: round2(state[w] - dollars) }, newYes);
  return true;
}

const pick = () => ({ balance: state.balance, pmBalance: state.pmBalance });

/** Shared local-state update after a bet (both live + guest use this). */
function applyBet(
  m: DeskMarket, side: Side, dollars: number,
  wallets: { balance: number; pmBalance: number }, newYes: number,
) {
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
  if (m.custom) recordActivity({ code: m.id, kind: 'bet', side, dollars });
  if (m.custom) {
    state = { ...state, custom: state.custom.map((c) => (c.id === m.id ? { ...c, pool: round2((c.pool || 0) + dollars) } : c)) };
  }
  set({ balance: round2(wallets.balance), pmBalance: round2(wallets.pmBalance), positions });
}

export async function createMarket(
  input: { q: string; cat: string; closes: string; yes: number; closesAt?: number },
): Promise<DeskMarket> {
  const yes = clamp(Math.round(input.yes), 2, 98);
  // A popover left open across midnight could hand us a time that has already
  // passed, which would create a market born closed.
  const closesAt = input.closesAt != null && input.closesAt > Date.now()
    ? input.closesAt
    : undefined;
  const code = state.live
    ? (await db.rpcCreateMarket({ ...input, yes, closesAt })) ?? genCode()
    : genCode();
  const m: DeskMarket = {
    id: code,
    q: input.q.trim(),
    cat: input.cat.trim() || 'Private',
    yes,
    closes: input.closes.trim() || 'TBD',
    closesAt,
    spark: [yes, yes, yes, yes, yes],
    custom: true,
    owner: state.user?.handle || 'you',
    pool: 0,
  };
  set({ custom: [m, ...state.custom], joined: [code, ...state.joined] });
  recordActivity({ code, kind: 'create' });
  return m;
}

/** Settle a private market. Only its owner may call this, and only once.
 *
 *  Payout is the standard binary-market rule: every share of the winning side
 *  pays $1, every share of the losing side pays $0. The position isn't deleted
 *  — it's stamped `settled` so Positions can show what it finally paid instead
 *  of a live price for a market that no longer moves.
 *
 *  Returns the amount credited to this desk, or null if the call wasn't allowed.
 */
export async function resolveMarket(code: string, outcome: Side): Promise<number | null> {
  const m = state.custom.find((x) => x.id === code);
  if (!m || m.resolved) return null;
  // Live markets carry the owner's auth id; guest markets only have a handle.
  const mine = m.ownerId != null
    ? m.ownerId === state.userId
    : m.owner === (state.user?.handle || 'you');
  if (!mine) return null;

  if (state.live) {
    try { await db.rpcResolveMarket(code, outcome); }
    catch { return null; }
  }

  let credited = 0;
  const positions = state.positions.map((pos) => {
    if (pos.marketId !== code || pos.settled) return pos;
    const payout = pos.side === outcome ? round2(pos.shares) : 0;
    credited = round2(credited + payout);
    return { ...pos, settled: { outcome, payout } };
  });

  // Price goes to the certainty the outcome now has, so any chart or sparkline
  // ends where the market actually landed rather than at its last guess.
  const settledYes = outcome === 'YES' ? 100 : 0;
  const roll = (arr: DeskMarket[]) => arr.map((c) => (
    c.id === code ? { ...c, resolved: outcome, yes: settledYes, spark: [...c.spark.slice(-9), settledYes] } : c
  ));
  set({
    positions,
    pmBalance: round2(state.pmBalance + credited),
    custom: roll(state.custom),
    markets: roll(state.markets),
  });
  recordActivity({ code, kind: 'resolve', side: outcome });
  return credited;
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
  const isNew = !state.custom.some((x) => x.id === m.id);
  if (isNew) {
    set({ custom: [m, ...state.custom], joined: [m.id, ...state.joined] });
  } else if (!state.joined.includes(m.id)) {
    set({ joined: [m.id, ...state.joined] });
  }
  if (isNew) {
    recordActivity({ code: m.id, kind: 'join' });
    if (state.live) { try { await db.rpcLogJoin(m.id); } catch { /* feed only */ } }
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
  if (p.settled) return p.settled.payout;   // final, not a live mark
  if (!m) return p.cost;
  const price = p.side === 'YES' ? m.yes : 100 - m.yes;
  return round2(p.shares * (price / 100));
}
