// Multi-outcome demo events for the Kalshi/Gemini-style board — E[X] colours,
// campus/finance flavour, politics-free by club policy. Prices are illustrative.
import type { DeskMarket, Side } from './deskStore';

export type Outcome = {
  name: string;
  yes: number;       // YES price in cents = crowd probability
  color: string;     // chart line colour
  path: number[];    // price path 0-100 for the chart
  meta?: string;     // optional short text tag rendered before the outcome name
};

export type MarketEvent = {
  id: string;
  cat: Category;
  title: string;
  outcomes: Outcome[];
  vol: number;       // fake $ volume
  updated: string;   // "21m ago"
  news?: string;     // headline blurb under the featured chart
  live?: boolean;
};

export type Category =
  | 'Sports' | 'Crypto' | 'Econ' | 'Tech' | 'Weather' | 'Campus' | 'Culture';

export const CATEGORIES: Category[] = ['Sports', 'Crypto', 'Econ', 'Tech', 'Weather', 'Campus', 'Culture'];

// E[X] chart palette — distinct hues that read on the dark board.
const C = {
  red: '#ff3b3b',
  green: '#34d399',
  gold: '#f5b53a',
  blue: '#5b9dff',
  violet: '#b57bff',
};

// Deterministic wiggle so the multi-line chart looks alive but stable.
function path(end: number, seed: number, drift = 0): number[] {
  const n = 40;
  const out: number[] = [];
  let v = clamp(end - drift, 4, 96);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const target = (end - drift) + (end - (end - drift)) * t;
    const noise = (Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453 % 1) * 6 - 3;
    v = clamp(target + noise, 3, 97);
    out.push(v);
  }
  out[n - 1] = end;
  return out;
}
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export const EVENTS: MarketEvent[] = [
  {
    id: 'BEANPOT27', cat: 'Sports', live: true, vol: 242202, updated: '21m ago',
    title: 'Beanpot 2027 — Tournament Winner',
    news: 'Northeastern enters the Beanpot on a five-game win streak, but Boston College and BU are close behind after strong Hockey East showings.',
    outcomes: [
      { name: 'Northeastern', yes: 41, color: C.green, path: path(41, 3, -12) },
      { name: 'Boston College', yes: 27, color: C.blue, path: path(27, 7, 8) },
      { name: 'Boston University', yes: 21, color: C.gold, path: path(21, 11, 5) },
      { name: 'Harvard', yes: 11, color: C.violet, path: path(11, 15, 3) },
    ],
  },
  {
    id: 'FED-DEC', cat: 'Econ', vol: 208626, updated: '1h ago',
    title: 'Fed decision at the December FOMC',
    outcomes: [
      { name: 'Hold rates', yes: 54, color: C.green, path: path(54, 21) },
      { name: 'Cut 25bps', yes: 39, color: C.gold, path: path(39, 22) },
      { name: 'Cut 50bps', yes: 7, color: C.blue, path: path(7, 23) },
    ],
  },
  {
    id: 'BTC-EOY', cat: 'Crypto', vol: 111852, updated: '48m ago',
    title: 'Bitcoin price on January 1',
    outcomes: [
      { name: 'Above $150k', yes: 33, color: C.gold, path: path(33, 31) },
      { name: 'Above $120k', yes: 61, color: C.green, path: path(61, 32) },
      { name: 'Above $100k', yes: 82, color: C.blue, path: path(82, 33) },
    ],
  },
  {
    id: 'GPT6', cat: 'Tech', vol: 139345, updated: '1m ago', live: true,
    title: 'OpenAI ships GPT-6 before the semester ends',
    outcomes: [
      { name: 'Yes', yes: 26, color: C.green, path: path(26, 41) },
      { name: 'No', yes: 74, color: C.red, path: path(74, 42) },
    ],
  },
  {
    id: 'SNOW-BOS', cat: 'Weather', vol: 67823, updated: '2h ago',
    title: 'First snow in Boston before Thanksgiving',
    outcomes: [
      { name: 'Yes', yes: 62, color: C.green, path: path(62, 51) },
      { name: 'No', yes: 38, color: C.red, path: path(38, 52) },
    ],
  },
  {
    id: 'USNEWS', cat: 'Campus', vol: 89077, updated: '2h ago',
    title: 'Northeastern ranks top-40 in next US News',
    outcomes: [
      { name: 'Yes', yes: 57, color: C.green, path: path(57, 61) },
      { name: 'No', yes: 43, color: C.red, path: path(43, 62) },
    ],
  },
  {
    id: 'MEMBERS', cat: 'Campus', vol: 42011, updated: '18m ago', live: true,
    title: 'E[X] hits 100 signed-up members by opening day',
    outcomes: [
      { name: 'Yes', yes: 83, color: C.green, path: path(83, 71) },
      { name: 'No', yes: 17, color: C.red, path: path(17, 72) },
    ],
  },
  {
    id: 'BEANPOT-FINAL', cat: 'Sports', vol: 54120, updated: '35m ago',
    title: 'Huskies reach the Beanpot final',
    outcomes: [
      { name: 'Yes', yes: 48, color: C.green, path: path(48, 81) },
      { name: 'No', yes: 52, color: C.red, path: path(52, 82) },
    ],
  },
  {
    id: 'ETH-EOM', cat: 'Crypto', vol: 100417, updated: '2h ago',
    title: 'Ether price at end of month',
    outcomes: [
      { name: 'Above $5k', yes: 32, color: C.gold, path: path(32, 91) },
      { name: 'Above $4k', yes: 58, color: C.green, path: path(58, 92) },
      { name: 'Above $3k', yes: 79, color: C.blue, path: path(79, 93) },
    ],
  },
  {
    id: 'ALBUM', cat: 'Culture', vol: 38221, updated: '3h ago',
    title: 'Which drops first this term?',
    outcomes: [
      { name: 'GTA 6', yes: 44, color: C.green, path: path(44, 101) },
      { name: 'New Kendrick album', yes: 33, color: C.gold, path: path(33, 102) },
      { name: 'Half-Life 3', yes: 9, color: C.violet, path: path(9, 103) },
    ],
  },
];

// Turn one outcome into a bettable DeskMarket (id namespaced per event+outcome).
export function outcomeToMarket(ev: MarketEvent, o: Outcome): DeskMarket {
  return {
    id: `${ev.id}:${o.name}`,
    q: `${ev.title} — ${o.name}`,
    cat: ev.cat,
    yes: o.yes,
    closes: ev.updated,
    spark: o.path.slice(-10),
  };
}

export const impliedMultiplier = (yes: number) => (yes > 0 ? (100 / yes) : 0);
export type { Side };

// ---- live overlay ----------------------------------------------------------
// The static EVENTS above are seeds. Once an outcome has a real market in the
// store (someone traded it), the store's price is the truth: the card, the
// list row, the ladder and the chart's final point all follow it. Without this
// the engine moved real meters while the board kept showing fiction.
import { useMemo } from 'react';
import { useDesk } from './deskStore';

export function useBoardEvents(): MarketEvent[] {
  const { markets, custom } = useDesk();
  return useMemo(() => EVENTS.map((ev) => {
    let touched = false;
    const outcomes = ev.outcomes.map((o) => {
      const live = [...markets, ...custom].find((m) => m.id === `${ev.id}:${o.name}`);
      if (!live || live.yes === o.yes) return o;
      touched = true;
      return { ...o, yes: live.yes, path: [...o.path.slice(0, -1), live.yes] };
    });
    return touched ? { ...ev, outcomes } : ev;
  }), [markets, custom]);
}
