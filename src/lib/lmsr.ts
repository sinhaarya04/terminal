// The hybrid market engine: LMSR pricing, parimutuel payout.
// See docs/market-engine-notes.md for the decision record.
//
// Two jobs, one tool each. PRICING runs on an LMSR cost function, so every
// market has a live price that moves with trades and never waits for a
// counterparty. PAYOUT runs on the pot: everything traders paid in is split
// across the winning side's real shares at resolution. The LMSR maker's fixed
// $1/share payout is deliberately NOT used — it can pay out more than it took
// in, and with no house to fund the gap it mints points and rots the
// leaderboard. Here, profit only ever comes from other players.
//
// This module is the client engine (guest mode, and display estimates in live
// mode). The plpgsql helpers in supabase/terminal-schema.sql are the
// authoritative copy for live trades; both must agree on the worked example in
// scripts/lmsr-test (b=100: 50 YES costs 28.10, then 50 NO costs 21.88,
// pot 49.98, YES pays ~1.00/share).

export type Quantities = { qYes: number; qNo: number };

export const DEFAULT_B = 100;

/** The LMSR cost meter, with the log-sum-exp trick so a big lopsided market
 *  can't overflow into Infinity − Infinity = NaN. */
export function cost(q: Quantities, b: number = DEFAULT_B): number {
  const a = q.qYes / b;
  const c = q.qNo / b;
  const m = Math.max(a, c);
  return b * (m + Math.log(Math.exp(a - m) + Math.exp(c - m)));
}

/** Live YES price in [0,1] — the slope of the meter, softmax of the totals. */
export function priceYes(q: Quantities, b: number = DEFAULT_B): number {
  const a = q.qYes / b;
  const c = q.qNo / b;
  const m = Math.max(a, c);
  const ey = Math.exp(a - m);
  const en = Math.exp(c - m);
  return ey / (ey + en);
}

/** What buying `shares` of one side costs right now: the change in the meter. */
export function costToTrade(q: Quantities, side: 'YES' | 'NO', shares: number, b: number = DEFAULT_B): number {
  const next: Quantities = side === 'YES'
    ? { qYes: q.qYes + shares, qNo: q.qNo }
    : { qYes: q.qYes, qNo: q.qNo + shares };
  return cost(next, b) - cost(q, b);
}

/** How many shares `spend` buys on one side — the closed-form inverse of
 *  costToTrade. Derivation: e^((q_x+Δ)/b) = e^(K/b)·(e^(q_x/b)+e^(q_o/b)) − e^(q_o/b). */
export function sharesForSpend(q: Quantities, side: 'YES' | 'NO', spend: number, b: number = DEFAULT_B): number {
  if (spend <= 0) return 0;
  const qx = (side === 'YES' ? q.qYes : q.qNo) / b;
  const qo = (side === 'YES' ? q.qNo : q.qYes) / b;
  // exponents here are bounded (|q|/b stays small at club scale), so the plain
  // form is safe: e^(K/b)·(e^qx+e^qo) − e^qo, then log back out
  const inner = Math.exp(spend / b + Math.log(Math.exp(qx) + Math.exp(qo))) - Math.exp(qo);
  return b * Math.log(inner) - qx * b;
}

/** Pricing-quantity seed that opens a market at `p` (0<p<1) instead of 50/50.
 *  These are PHANTOM shares: they steer the opening price and nothing else —
 *  payout is split over real held shares, and the pot baseline is the meter's
 *  reading at this seed, so the pot still starts at zero. */
export function seedForOdds(p: number, b: number = DEFAULT_B): Quantities {
  const clamped = Math.min(0.98, Math.max(0.02, p));
  const offset = b * Math.log(clamped / (1 - clamped));
  return offset >= 0 ? { qYes: offset, qNo: 0 } : { qYes: 0, qNo: -offset };
}

/** Points sitting in the market: everything paid in minus everything sold out,
 *  measured from the seeded opening, not from (0,0). */
export function pot(q: Quantities, c0: number, b: number = DEFAULT_B): number {
  return Math.max(0, cost(q, b) - c0);
}

/** Payout per winning share. `winningShares` is the REAL held total on the
 *  winning side (from positions/bets), never the pricing quantities — the
 *  opening-odds seed must not eat anyone's payout. Zero winners → void:
 *  the caller refunds every stake instead. */
export function resolvePot(potValue: number, winningShares: number):
  { perShare: number; voided: boolean } {
  if (winningShares <= 0) return { perShare: 0, voided: true };
  return { perShare: potValue / winningShares, voided: false };
}
