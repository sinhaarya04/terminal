import { useMemo, useState } from 'react';
import { CATEGORIES, EVENTS, type Category, type MarketEvent } from '../marketsData';

type Filter = 'All' | 'Live' | Category;
const FILTERS: Filter[] = ['All', 'Live', ...CATEGORIES];

const vol = (n: number) => (n >= 1000 ? (n / 1000).toFixed(1) + 'K' : String(n));

export default function MarketsGrid({ onOpen }: { onOpen: (ev: MarketEvent) => void }) {
  const [filter, setFilter] = useState<Filter>('All');

  const list = useMemo(() => {
    if (filter === 'All') return EVENTS;
    if (filter === 'Live') return EVENTS.filter((e) => e.live);
    return EVENTS.filter((e) => e.cat === filter);
  }, [filter]);

  return (
    <div className="grid-wrap">
      <div className="kicker">Markets · {list.length}</div>

      <nav className="grid-filters" role="tablist" aria-label="Category">
        {FILTERS.map((f) => (
          <button
            key={f}
            role="tab"
            aria-selected={filter === f}
            className={`grid-filter mono ${filter === f ? 'is-on' : ''}`}
            onClick={() => setFilter(f)}
          >
            {f === 'Live' && <i className="grid-filter-dot" />}{f}
          </button>
        ))}
      </nav>

      <div className="grid">
        {list.map((ev) => <Card key={ev.id} ev={ev} onOpen={onOpen} />)}
      </div>

      {list.length === 0 && <p className="pane-empty-sub">Nothing in this category yet.</p>}
    </div>
  );
}

function Card({ ev, onOpen }: { ev: MarketEvent; onOpen: (e: MarketEvent) => void }) {
  const top = [...ev.outcomes].sort((a, b) => b.yes - a.yes).slice(0, 3);
  const more = ev.outcomes.length - top.length;

  return (
    <button className="mkt" onClick={() => onOpen(ev)} aria-label={`Open ${ev.title}`}>
      <span className="mkt-top">
        <span className="mkt-cat mono">{ev.cat}</span>
        {ev.live && <span className="mkt-live mono"><i />Live</span>}
      </span>

      <span className="mkt-title">{ev.title}</span>

      <span className="mkt-rows">
        {top.map((o) => (
          <span className="mkt-row" key={o.name}>
            <span className="mkt-name">
              {o.meta && <span className="mkt-meta">{o.meta}</span>}{o.name}
            </span>
            <span className="mkt-pct mono">{o.yes}%</span>
            {/* the bar is the whole reason these read at a glance */}
            <span className="mkt-bar"><i style={{ width: `${o.yes}%`, background: o.color }} /></span>
          </span>
        ))}
        {more > 0 && <span className="mkt-more mono">+{more} more</span>}
      </span>

      <span className="mkt-foot mono">
        <span>VOL {vol(ev.vol)}</span>
        <span>{ev.updated}</span>
      </span>
    </button>
  );
}
