import { useEffect, useMemo, useState } from 'react';
import { CATEGORIES, type Category, type MarketEvent } from '../marketsData';

type Filter = 'All' | 'Live' | Category;
type View = 'grid' | 'list';
const FILTERS: Filter[] = ['All', 'Live', ...CATEGORIES];
const VIEW_KEY = 'ex.markets.view';

const vol = (n: number) => (n >= 1000 ? (n / 1000).toFixed(1) + 'K' : String(n));

// the choice is a per-viewer convenience, so a failed read must never block the
// board — private windows and blocked site data both throw here
function readView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid';
  } catch {
    return 'grid';
  }
}

export default function MarketsGrid({ events, onOpen }: { events: MarketEvent[]; onOpen: (ev: MarketEvent) => void }) {
  const [filter, setFilter] = useState<Filter>('All');
  const [view, setView] = useState<View>(readView);

  useEffect(() => {
    try { localStorage.setItem(VIEW_KEY, view); } catch { /* not worth surfacing */ }
  }, [view]);

  const list = useMemo(() => {
    if (filter === 'All') return events;
    if (filter === 'Live') return events.filter((e) => e.live);
    return events.filter((e) => e.cat === filter);
  }, [filter, events]);

  return (
    <div className="grid-wrap">
      <div className="kicker">Markets · {list.length}</div>

      <div className="grid-bar">
        <nav className="grid-filters" role="tablist" aria-label="Category">
          {FILTERS.map((f) => (
            <button
              key={f}
              role="tab"
              aria-selected={filter === f}
              className={`grid-filter mono ${filter === f ? 'is-on' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f === 'Live' ? <span className="t-shimmer" data-text="Live">Live</span> : f}
            </button>
          ))}
        </nav>

        <div className="view-toggle" role="group" aria-label="View">
          <button
            className={`view-btn ${view === 'grid' ? 'is-on' : ''}`}
            aria-pressed={view === 'grid'}
            onClick={() => setView('grid')}
            title="Grid view"
          >
            <svg viewBox="0 0 16 16" aria-hidden="true" width="13" height="13">
              <rect x="1" y="1" width="6" height="6" /><rect x="9" y="1" width="6" height="6" />
              <rect x="1" y="9" width="6" height="6" /><rect x="9" y="9" width="6" height="6" />
            </svg>
            <span className="u-sr">Grid</span>
          </button>
          <button
            className={`view-btn ${view === 'list' ? 'is-on' : ''}`}
            aria-pressed={view === 'list'}
            onClick={() => setView('list')}
            title="List view"
          >
            <svg viewBox="0 0 16 16" aria-hidden="true" width="13" height="13">
              <rect x="1" y="2" width="14" height="2" /><rect x="1" y="7" width="14" height="2" />
              <rect x="1" y="12" width="14" height="2" />
            </svg>
            <span className="u-sr">List</span>
          </button>
        </div>
      </div>

      {view === 'grid' ? (
        <div className="grid">
          {list.map((ev) => <Card key={ev.id} ev={ev} onOpen={onOpen} />)}
        </div>
      ) : (
        <div className="mlist">
          <div className="mlist-head mono" aria-hidden="true">
            <span>Market</span><span>Top outcome</span><span className="r">Vol</span><span className="r">Updated</span>
          </div>
          {list.map((ev) => <Row key={ev.id} ev={ev} onOpen={onOpen} />)}
        </div>
      )}

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
        {ev.live && (
          <span className="mkt-live mono">
            <span className="t-shimmer" data-text="Live">Live</span>
          </span>
        )}
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

function Row({ ev, onOpen }: { ev: MarketEvent; onOpen: (e: MarketEvent) => void }) {
  const lead = [...ev.outcomes].sort((a, b) => b.yes - a.yes)[0];
  const more = ev.outcomes.length - 1;

  return (
    <button className="mrow" onClick={() => onOpen(ev)} aria-label={`Open ${ev.title}`}>
      <span className="mrow-main">
        <span className="mrow-meta mono">
          {ev.cat}
          {ev.live && <> · <span className="t-shimmer" data-text="Live">Live</span></>}
        </span>
        <span className="mrow-title">{ev.title}</span>
      </span>

      <span className="mrow-lead">
        <span className="mrow-name">
          <i className="dot" style={{ background: lead.color }} />
          {lead.name}
          {more > 0 && <em className="mrow-more mono">+{more}</em>}
        </span>
        <span className="mrow-bar"><i style={{ width: `${lead.yes}%`, background: lead.color }} /></span>
      </span>

      <span className="mrow-pct mono">{lead.yes}%</span>
      <span className="mrow-vol mono r">{vol(ev.vol)}</span>
      <span className="mrow-upd mono r">{ev.updated}</span>
    </button>
  );
}
