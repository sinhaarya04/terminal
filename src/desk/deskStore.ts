// Client-only state for the /desk demo terminal. Everything lives in
// localStorage so "the intro video plays only on first sign-in" and fake
// balances / positions / custom markets survive reloads. No backend — this is
// a self-contained demo of what the E[X] terminal will feel like.

import { useSyncExternalStore } from 'react';
import * as db from './terminalDb';
import { endOfDay } from '../lib/closeTime';
import * as lmsr from '../lib/lmsr';

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
  settled?: { outcome: Side | 'VOID' | 'MULTI'; payout: number };
  outcomeIdx?: number;   // multi-market positions: which outcome this holds
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
  // YES/NO = the binary outcome; MULTI = a multi-outcome market settled to
  // resolvedIdx; VOID = the winning side held zero shares, everyone refunded.
  resolved?: Side | 'VOID' | 'MULTI';
  resolvedIdx?: number;
  // Multi-outcome markets ("who wins"): one market, N mutually-exclusive
  // outcomes, softmax prices summing to 1. Absent on binary markets.
  isMulti?: boolean;
  outcomes?: { idx: number; name: string; pq: number; sq: number }[];
  resolvedAt?: number;   // when it settled — places payouts on the balance timeline
  // Live mode only: the owner's auth id. `owner` is a display handle and is not
  // unique, so settlement authority is checked against this when it exists.
  ownerId?: string;
  // When betting stops, epoch ms. Private markets only — the public board fills
  // `closes` with a display string that was never a date. Absent means the
  // market never closes on its own, which is how every market behaved before
  // close dates existed.
  closesAt?: number;
  // Hybrid engine state (LMSR pricing, parimutuel payout — docs/market-engine-notes.md).
  // pricing quantities include the phantom opening-odds seed; sq* are the real
  // held shares the payout splits over. Markets predating the engine lack
  // these and get them seeded from their displayed price on first bet.
  qYes?: number;
  qNo?: number;
  sqYes?: number;
  sqNo?: number;
  b?: number;
  c0?: number;
};

/** Engine state for a market, seeding it from the displayed price when the
 *  market predates the engine. Pure — returns the fields, doesn't store them. */
export function engineOf(m: DeskMarket): Required<Pick<DeskMarket, 'qYes' | 'qNo' | 'sqYes' | 'sqNo' | 'b' | 'c0'>> {
  if (m.qYes != null && m.qNo != null && m.b != null && m.c0 != null) {
    return { qYes: m.qYes, qNo: m.qNo, sqYes: m.sqYes ?? 0, sqNo: m.sqNo ?? 0, b: m.b, c0: m.c0 };
  }
  const seed = lmsr.seedForOdds(m.yes / 100);
  return { qYes: seed.qYes, qNo: seed.qNo, sqYes: 0, sqNo: 0, b: lmsr.DEFAULT_B, c0: lmsr.cost(seed) };
}

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
  kind: 'create' | 'join' | 'bet' | 'sell' | 'resolve';
  side?: Side;       // bet + resolve (binary)
  outcome?: string;  // bet + resolve (multi): the outcome name
  dollars?: number;  // bet only
  at: number;        // epoch ms
};

/** One line of the account's own ledger: every bet, whichever board it was on. */
export type Trade = {
  id: string;
  marketId: string;
  q: string;             // market question at trade time, so history survives markets
  kind: 'buy' | 'sell';
  side: Side;
  dollars: number;       // spent on a buy; received on a sell
  shares: number;
  wallet: 'board' | 'sim';
  at: number;
};

export type DeskState = {
  user: { handle: string } | null;
  isAdmin: boolean;   // officer flag — may resolve any market, create board markets
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
  trades: Trade[];        // this account's own bets, newest first, both wallets
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
    user: null, isAdmin: false, seenIntro: false, balance: START_BALANCE, pmBalance: START_PM_BALANCE, positions: [],
    markets: SEED_PUBLIC.map((m) => ({ ...m, spark: [...m.spark] })),
    // computed at seed time, like seedActivity, so the demo market is always a
    // few days from closing rather than frozen at whenever this shipped
    custom: [{ ...SEED_CUSTOM, spark: [...SEED_CUSTOM.spark], closesAt: endOfDay(3) }],
    joined: [SEED_CUSTOM.id], activity: seedActivity(), trades: [], live: false,
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
  let [mine, betMarkets, bets, trades, board] = await Promise.all([
    db.fetchMyMarkets(userId), db.fetchBetMarkets(), db.fetchMyBets(), db.fetchMyTrades(), db.fetchBoardMarkets(),
  ]);
  // multi markets need their outcome rows for prices + trading
  [mine, board] = await Promise.all([db.withOutcomes(mine), db.withOutcomes(board)]);
  // merge fetched markets (for live price on Positions) into the public list,
  // plus every officer-created / materialised board market so the grid shows them
  const markets = SEED_PUBLIC.map((m) => ({ ...m, spark: [...m.spark] }));
  for (const bm of [...board, ...betMarkets]) if (!bm.custom && !markets.some((x) => x.id === bm.id)) markets.push(bm);

  // The bets table has no settled flag — settlement is a fact about the
  // MARKET. Rehydrated positions on resolved markets get their settled stamp
  // derived here, or a paid-out position would come back marking to a price
  // that can never move again.
  const lookup = new Map<string, DeskMarket>([...markets, ...mine, ...betMarkets].map((x) => [x.id, x]));
  const positions: Position[] = bets.map((p) => {
    const mk = lookup.get(p.marketId);
    if (!mk?.resolved) return p;
    const winTotal = p.side === 'YES' ? mk.sqYes ?? 0 : mk.sqNo ?? 0;
    // markets settled before the hybrid engine have no share totals — those
    // actually paid the old $1/share, so their history reads what really happened
    const perShare = winTotal > 0 ? (mk.pool || 0) / winTotal : 1;
    const payout = mk.resolved === 'VOID'
      ? round2(p.cost)
      : p.side === mk.resolved ? round2(p.shares * perShare) : 0;
    return { ...p, settled: { outcome: mk.resolved, payout } };
  });
  state = {
    ...state, live: true, userId,
    user: { handle: profile.handle }, isAdmin: profile.isAdmin, seenIntro: profile.seenIntro,
    balance: profile.balance, pmBalance: profile.pmBalance,
    positions, markets, custom: mine, joined: mine.map((m) => m.id),
    // The server has no activity table yet, so live mode starts with an empty
    // feed rather than inventing one. Local events still append as you play.
    activity: [],
    trades,
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

/** Live prices (cents) for a multi market's outcomes — softmax, sums to 100. */
export function outcomePrices(m: DeskMarket): number[] {
  if (!m.outcomes?.length) return [];
  const b = m.b ?? 100;
  return lmsr.pricesN(m.outcomes.map((o) => o.pq), b).map((p) => Math.round(p * 100));
}

/** Create a multi-outcome market. `board` (admin only) makes a public BX-
 *  market; otherwise a private EX- market in the caller's own list. */
export async function createMultiMarket(input: {
  q: string; cat: string; closes: string; closesAt?: number;
  outcomes: string[]; probs: number[]; board: boolean;
}): Promise<string | null> {
  if (!state.live) return null;   // multi markets are server-side only
  if (input.board && !state.isAdmin) return null;
  try {
    const code = await db.rpcCreateMultiMarket(input);
    if (!code) return null;
    const fresh = await db.getMarketByCode(code);
    if (fresh) {
      const [withO] = await db.withOutcomes([fresh]);
      const key = input.board ? 'markets' : 'custom';
      set({ [key]: [withO, ...state[key]], joined: input.board ? state.joined : [code, ...state.joined] } as Partial<DeskState>);
    }
    return code;
  } catch { return null; }
}

/** Refresh one multi market's row + outcomes from the server. */
async function refreshMulti(code: string) {
  if (!state.live) return;
  try {
    const m = await db.getMarketByCode(code);
    if (!m) return;
    const [withO] = await db.withOutcomes([m]);
    const roll = (arr: DeskMarket[]) => arr.map((c) => (c.id === code ? { ...withO, spark: c.spark } : c));
    set({ custom: roll(state.custom), markets: roll(state.markets) });
  } catch { /* stale is better than an error */ }
}
export { refreshMulti };

/** Buy `dollars` of outcome `idx` on a multi market. */
export async function placeBetMulti(m: DeskMarket, idx: number, dollars: number): Promise<boolean> {
  if (!state.live) return false;
  const wallet = walletFor(m);
  if (dollars <= 0 || dollars > state[wallet]) return false;
  if (marketPhase(getMarket(m.id) ?? m) !== 'open') return false;
  try {
    const res = await db.rpcPlaceBetMulti(m.id, idx, dollars);
    const name = m.outcomes?.find((o) => o.idx === idx)?.name ?? `#${idx}`;
    state = { ...state, positions: upsertPos(state.positions, m.id, undefined, res.shares, dollars, idx),
      trades: [{ id: `${m.id}-${Date.now()}-${Math.random().toString(36).slice(2,7)}`, marketId: m.id, q: `${m.q} — ${name}`,
        kind: 'buy' as const, side: 'YES' as const, dollars, shares: res.shares, wallet: (wallet === 'pmBalance' ? 'sim' : 'board') as 'sim'|'board', at: Date.now() }, ...state.trades].slice(0,300) };
    if (m.custom) recordActivity({ code: m.id, kind: 'bet', dollars, outcome: name });
    set({ balance: round2(res.balance), pmBalance: round2(res.pm_balance) });
    await refreshMulti(m.id);
    return true;
  } catch { return false; }
}

/** Sell `shares` of outcome `idx` back to the multi meter. */
export async function sellMulti(m: DeskMarket, idx: number, shares: number): Promise<number | null> {
  if (!state.live || shares <= 0) return null;
  const held = state.positions.filter((p) => p.marketId === m.id && p.outcomeIdx === idx && !p.settled).reduce((a, p) => a + p.shares, 0);
  if (shares > held + 1e-9) return null;
  try {
    const res = await db.rpcSellMulti(m.id, idx, shares);
    const wallet = walletFor(m);
    const positions = state.positions.map((p) => {
      if (p.marketId !== m.id || p.outcomeIdx !== idx || p.settled) return p;
      const frac = Math.min(1, shares / p.shares);
      return { ...p, shares: p.shares - shares, cost: round2(p.cost * (1 - frac)) };
    }).filter((p) => p.settled || p.shares > 1e-9);
    const name = m.outcomes?.find((o) => o.idx === idx)?.name ?? `#${idx}`;
    state = { ...state, positions, trades: [{ id: `${m.id}-${Date.now()}-${Math.random().toString(36).slice(2,7)}`, marketId: m.id, q: `${m.q} — ${name}`,
      kind: 'sell' as const, side: 'YES' as const, dollars: res.proceeds, shares, wallet: (wallet === 'pmBalance' ? 'sim' : 'board') as 'sim'|'board', at: Date.now() }, ...state.trades].slice(0,300) };
    if (m.custom) recordActivity({ code: m.id, kind: 'sell', dollars: res.proceeds, outcome: name });
    set({ balance: round2(res.balance), pmBalance: round2(res.pm_balance) });
    await refreshMulti(m.id);
    return res.proceeds;
  } catch { return null; }
}

/** Settle a multi market to winning outcome `idx` (owner or admin). */
export async function resolveMulti(m: DeskMarket, idx: number): Promise<boolean> {
  if (!state.live) return false;
  const owns = m.ownerId != null ? m.ownerId === state.userId : m.owner === (state.user?.handle || 'you');
  if (!owns && !state.isAdmin) return false;
  try {
    await db.rpcResolveMulti(m.id, idx);
    const wallet = walletFor(m);
    const winName = m.outcomes?.find((o) => o.idx === idx)?.name;
    const winSq = m.outcomes?.find((o) => o.idx === idx)?.sq ?? 0;
    const pot = m.pool ?? 0;
    let credited = 0;
    const positions = state.positions.map((pos) => {
      if (pos.marketId !== m.id || pos.settled) return pos;
      const payout = pos.outcomeIdx === idx && winSq > 0 ? round2(pos.shares * (pot / winSq)) : 0;
      credited = round2(credited + payout);
      return { ...pos, settled: { outcome: 'MULTI' as const, payout } };
    });
    const roll = (arr: DeskMarket[]) => arr.map((c) => (c.id === m.id ? { ...c, resolved: 'MULTI' as const, resolvedIdx: idx } : c));
    set({ positions, [wallet]: round2(state[wallet] + credited), custom: roll(state.custom), markets: roll(state.markets) } as Partial<DeskState>);
    recordActivity({ code: m.id, kind: 'resolve', outcome: winName });
    return true;
  } catch { return false; }
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
      // stamp the engine deltas locally too — the settle mirror reads sq* to
      // split the pot, and a blind local copy once declared a market VOID
      // while the server was correctly paying its winner
      stampEngine(m, side, res.shares);
      applyBet(m, side, dollars, res.shares, { balance: res.balance, pmBalance: res.pm_balance }, res.yes);
    } catch { return false; }
    return true;
  }

  // guest/demo (localStorage): the same LMSR engine, run locally
  const eng = engineOf(m);
  const q = { qYes: eng.qYes, qNo: eng.qNo };
  const shares = lmsr.sharesForSpend(q, side, dollars, eng.b);
  const nextQ = side === 'YES' ? { qYes: q.qYes + shares, qNo: q.qNo } : { qYes: q.qYes, qNo: q.qNo + shares };
  const newYes = clamp(Math.round(lmsr.priceYes(nextQ, eng.b) * 100), 1, 99);
  const w = walletFor(m);
  stampEngine(m, side, shares);
  applyBet(m, side, dollars, shares, { ...pick(), [w]: round2(state[w] - dollars) }, newYes);
  return true;
}

/** Advance the stored market's engine state after a bet of `shares` on `side`.
 *  Shared by the live path (server-computed shares) and the guest path. */
function stampEngine(m: DeskMarket, side: Side, shares: number) {
  const eng = engineOf(m);
  const stamp = (arr: DeskMarket[]) => arr.map((c) => (c.id === m.id ? {
    ...c, ...eng,
    qYes: eng.qYes + (side === 'YES' ? shares : 0),
    qNo: eng.qNo + (side === 'NO' ? shares : 0),
    sqYes: eng.sqYes + (side === 'YES' ? shares : 0),
    sqNo: eng.sqNo + (side === 'NO' ? shares : 0),
  } : c));
  state = { ...state, markets: stamp(state.markets), custom: stamp(state.custom) };
}

const pick = () => ({ balance: state.balance, pmBalance: state.pmBalance });

/** Insert or accumulate a position row for a market+side (binary) or
 *  market+outcome (multi). */
function upsertPos(positions: Position[], marketId: string, side: Side | undefined, shares: number, cost: number, outcomeIdx?: number): Position[] {
  const out = [...positions];
  const idx = out.findIndex((p) => p.marketId === marketId && p.outcomeIdx === outcomeIdx && p.side === side && !p.settled);
  if (idx >= 0) out[idx] = { ...out[idx], shares: out[idx].shares + shares, cost: round2(out[idx].cost + cost) };
  else out.push({ marketId, side: side ?? 'YES', shares, cost, outcomeIdx });
  return out;
}

/** Shared local-state update after a bet (both live + guest use this). */
function applyBet(
  m: DeskMarket, side: Side, dollars: number, shares: number,
  wallets: { balance: number; pmBalance: number }, newYes: number,
) {
  const positions = [...state.positions];
  const idx = positions.findIndex((p) => p.marketId === m.id && p.side === side);
  if (idx >= 0) positions[idx] = { ...positions[idx], shares: positions[idx].shares + shares, cost: positions[idx].cost + dollars };
  else positions.push({ marketId: m.id, side, shares, cost: dollars });

  // ensure the market is tracked so Positions can price it, then nudge it
  if (!state.markets.some((x) => x.id === m.id) && !state.custom.some((x) => x.id === m.id)) {
    state = { ...state, [m.custom ? 'custom' : 'markets']: [...(m.custom ? state.custom : state.markets), { ...m }] } as DeskState;
  }
  bumpMarketPrice(m.id, newYes);
  // the account's own ledger — every bet lands here, board and sim alike
  state = { ...state, trades: [{
    id: `${m.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    marketId: m.id, q: m.q, kind: 'buy' as const, side, dollars, shares,
    wallet: walletFor(m) === 'pmBalance' ? 'sim' as const : 'board' as const,
    at: Date.now(),
  }, ...state.trades].slice(0, 300) };
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

/** Admin only: create a public board market. Returns the new code or null. */
export async function adminCreateBoardMarket(
  input: { q: string; cat: string; yes: number; closesAt?: number },
): Promise<string | null> {
  if (!state.isAdmin) return null;
  if (!state.live) return null;   // board markets are server-side only
  try {
    const code = await db.rpcAdminCreateBoardMarket(input);
    if (code) {
      const board = await db.fetchBoardMarkets();
      const markets = [...state.markets];
      for (const bm of board) if (!markets.some((x) => x.id === bm.id)) markets.push(bm);
      set({ markets });
    }
    return code;
  } catch { return null; }
}

/** Sell shares back to the meter for their live LMSR value: C(q) − C(q−s).
 *  A true exit — cash lands now, the price ticks down, and the pot shrinks by
 *  exactly the proceeds, so conservation holds. Returns the proceeds, or null
 *  if the sell wasn't allowed. */
export async function sellShares(m: DeskMarket, side: Side, shares: number): Promise<number | null> {
  const stored = getMarket(m.id) ?? m;
  if (marketPhase(stored) !== 'open' || shares <= 0) return null;
  const held = state.positions
    .filter((p) => p.marketId === m.id && p.side === side && !p.settled)
    .reduce((a, p) => a + p.shares, 0);
  if (shares > held + 1e-9) return null;

  const eng = engineOf(stored);
  let proceeds: number;
  let wallets: { balance: number; pmBalance: number };
  let newYes: number;
  if (state.live) {
    try {
      const res = await db.rpcSellShares(m.id, side, shares);
      proceeds = res.proceeds;
      wallets = { balance: res.balance, pmBalance: res.pm_balance };
      newYes = res.yes;
    } catch { return null; }
  } else {
    proceeds = round2(lmsr.proceedsForSell({ qYes: eng.qYes, qNo: eng.qNo }, side, shares, eng.b));
    const w = walletFor(stored);
    wallets = { ...{ balance: state.balance, pmBalance: state.pmBalance }, [w]: round2(state[w] + proceeds) } as { balance: number; pmBalance: number };
    const nq = side === 'YES' ? { qYes: eng.qYes - shares, qNo: eng.qNo } : { qYes: eng.qYes, qNo: eng.qNo - shares };
    newYes = clamp(Math.round(lmsr.priceYes(nq, eng.b) * 100), 1, 99);
  }

  stampEngine(stored, side, -shares);
  bumpMarketPrice(m.id, newYes);
  // the position shrinks; its cost basis leaves proportionally, so remaining
  // P&L still reads against what the remaining shares actually cost
  const positions = state.positions.map((p) => {
    if (p.marketId !== m.id || p.side !== side || p.settled) return p;
    const frac = Math.min(1, shares / p.shares);
    return { ...p, shares: p.shares - shares, cost: round2(p.cost * (1 - frac)) };
  }).filter((p) => p.settled || p.shares > 1e-9);
  if (stored.custom) {
    state = { ...state, custom: state.custom.map((c) => (c.id === m.id ? { ...c, pool: Math.max(0, round2((c.pool || 0) - proceeds)) } : c)) };
  }
  state = { ...state, trades: [{
    id: `${m.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    marketId: m.id, q: stored.q, kind: 'sell' as const, side, dollars: proceeds, shares,
    wallet: walletFor(stored) === 'pmBalance' ? 'sim' as const : 'board' as const,
    at: Date.now(),
  }, ...state.trades].slice(0, 300) };
  set({ positions, balance: round2(wallets.balance), pmBalance: round2(wallets.pmBalance) });
  if (stored.custom) recordActivity({ code: m.id, kind: 'sell', side, dollars: proceeds });
  return proceeds;
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
  // any market — private (owner-settled) or board (admin-settled)
  const m = getMarket(code);
  if (!m || m.resolved) return null;
  const owns = m.ownerId != null ? m.ownerId === state.userId
    : m.owner === (state.user?.handle || 'you');
  if (!owns && !state.isAdmin) return null;
  // board markets pay the PUB wallet, private markets pay PRI
  const wallet: 'balance' | 'pmBalance' = m.custom ? 'pmBalance' : 'balance';

  // Parimutuel payout: the pot (everything actually paid in) splits across the
  // winning side's REAL shares. Never shares × $1 — that rule could pay out
  // more than the market took in, minting points from nowhere. If the winning
  // side holds zero shares there is nobody to pay, so the market voids and
  // every stake is refunded instead. Mirrors term_resolve_market.
  let eng = engineOf(m);
  let finalOutcome: Side | 'VOID';
  if (state.live) {
    try {
      await db.rpcResolveMarket(code, outcome);
      // the server judged VOID-or-not against the real bets table; read its
      // verdict and its share totals back rather than trusting this browser's
      // possibly-stale copy of the market
      const fresh = await db.getMarketByCode(code);
      if (fresh) { eng = engineOf(fresh); }
      finalOutcome = (fresh?.resolved as Side | 'VOID' | undefined) ?? outcome;
    } catch { return null; }
  } else {
    finalOutcome = (outcome === 'YES' ? eng.sqYes : eng.sqNo) <= 1e-9 ? 'VOID' : outcome;
  }
  // The pot is the CASH (pool = Σbuys − Σsells, exact by construction), not
  // the meter: sells credit rounded proceeds while the meter moves by exact
  // share amounts, and after enough sells the meter claims cents nobody paid.
  const potValue = round2((getMarket(m.id) ?? m).pool ?? lmsr.pot({ qYes: eng.qYes, qNo: eng.qNo }, eng.c0, eng.b));
  const winShares = outcome === 'YES' ? eng.sqYes : eng.sqNo;
  const voided = finalOutcome === 'VOID';

  let credited = 0;
  const positions = state.positions.map((pos) => {
    if (pos.marketId !== code || pos.settled) return pos;
    const payout = voided
      ? round2(pos.cost)
      : pos.side === outcome ? round2(pos.shares * (potValue / winShares)) : 0;
    credited = round2(credited + payout);
    return { ...pos, settled: { outcome: finalOutcome, payout } };
  });

  // Price goes to the certainty the outcome now has; a void keeps its last
  // price, since reality never picked a side the market could express.
  const settledYes = voided ? m.yes : outcome === 'YES' ? 100 : 0;
  const roll = (arr: DeskMarket[]) => arr.map((c) => (
    c.id === code ? { ...c, resolved: finalOutcome, yes: settledYes, spark: [...c.spark.slice(-9), settledYes] } : c
  ));
  set({
    positions,
    [wallet]: round2(state[wallet] + credited),
    custom: roll(state.custom),
    markets: roll(state.markets),
  } as Partial<DeskState>);
  recordActivity({ code, kind: 'resolve', side: voided ? undefined : outcome });
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
