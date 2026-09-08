// Multi-outcome demo events for the Kalshi/Gemini-style board — E[X] colours,
// campus/finance flavour, politics-free by club policy. Prices are illustrative.
import type { DeskMarket, Side } from './deskStore';

export type Outcome = {
  name: string;
  yes: number;       // YES price in cents = crowd probability
  color: string;     // chart line colour
  path: number[];    // price path 0-100 for the chart
  meta?: string;     // optional short text tag rendered before the outcome name
  code?: string;     // real DB market code (officer board markets); else derived
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

// Kalshi's own category names don't match the board's tabs; fold them in so a
// picked market lands under the right filter instead of defaulting to Campus.
const KALSHI_CAT_MAP: Record<string, Category> = {
  Sports: 'Sports', Crypto: 'Crypto', Economics: 'Econ', Financials: 'Econ', Companies: 'Econ',
  'Science and Technology': 'Tech', 'Climate and Weather': 'Weather', Entertainment: 'Culture',
  Politics: 'Culture', Elections: 'Culture', World: 'Culture', Health: 'Culture',
  Social: 'Culture', Transportation: 'Culture',
};
export function toBoardCategory(c: string): Category {
  return (CATEGORIES as string[]).includes(c) ? (c as Category) : (KALSHI_CAT_MAP[c] ?? 'Campus');
}

// Turn one outcome into a bettable DeskMarket (id namespaced per event+outcome).
export function outcomeToMarket(ev: MarketEvent, o: Outcome): DeskMarket {
  return {
    // officer board markets are a single binary market with a real code;
    // multi-outcome demo events derive one id per outcome
    id: o.code ?? `${ev.id}:${o.name}`,
    q: `${ev.title} — ${o.name}`,
    cat: ev.cat,
    yes: o.yes,
    closes: ev.updated,
    spark: o.path.slice(-10),
  };
}

export const impliedMultiplier = (yes: number) => (yes > 0 ? (100 / yes) : 0);
export type { Side };

// ---- board events ----------------------------------------------------------
// The board is built entirely from real store markets — officer-created (BX-)
// and Kalshi-launched (KX-/KM-). Prices, volume and settlement all come from
// the engine; there are no hardcoded demo cards.
import { useMemo } from 'react';
import { useDesk } from './deskStore';

export function useBoardEvents(): MarketEvent[] {
  const { markets } = useDesk();
  return useMemo(() => {
    // The board shows ONLY real markets from the store — officer-created (BX-)
    // and Kalshi-launched (KX-/KM-). No hardcoded demo/sample cards.
    const PAL = ['#34d399','#5b9dff','#f5b53a','#b57bff','#ff3b3b','#2dd4bf','#f472b6','#a3e635'];
    const boardEvents: MarketEvent[] = markets
      .filter((m) => /^(BX|KX|KM)-/.test(m.id))
      .map((m) => {
        const base = {
          id: m.id,
          cat: toBoardCategory(m.cat),
          title: m.q,
          vol: Math.round(m.pool || 0),
          updated: m.resolved ? 'settled' : 'open',
          live: !m.resolved,
        };
        if (m.isMulti && m.outcomes?.length) {
          // softmax prices across the real outcomes
          const b = m.b ?? 100;
          const ex = m.outcomes.map((o) => Math.exp(o.pq / b));
          const S = ex.reduce((a, v) => a + v, 0);
          return { ...base, outcomes: m.outcomes.map((o, i) => ({
            name: o.name, code: m.id, yes: Math.round(ex[i] / S * 100),
            color: PAL[i % PAL.length], path: [Math.round(ex[i] / S * 100)],
          })) };
        }
        return { ...base, outcomes: [{
          name: 'Yes', code: m.id, yes: m.yes, color: '#34d399',
          path: m.spark && m.spark.length ? m.spark : [m.yes, m.yes],
        }] };
      });
    return boardEvents;
  }, [markets]);
}
