import { useMemo, useState } from 'react';
import { ensureMarket, type DeskMarket, type Side } from './deskStore';
import { EVENTS, CATEGORIES, outcomeToMarket, impliedMultiplier, type MarketEvent, type Outcome } from './marketsData';
import MultiLineChart from './MultiLineChart';
import BetTicket from './BetTicket';

type Filter = 'All' | 'Live' | (typeof CATEGORIES)[number];
const TABS: Filter[] = ['All', 'Live', ...CATEGORIES];

const vol = (n: number) => '$' + (n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n)) + ' vol';

export default function DeskMarkets() {
  const [filter, setFilter] = useState<Filter>('All');
  const [ticket, setTicket] = useState<{ m: DeskMarket; side: Side } | null>(null);

  const list = useMemo(() => {
    if (filter === 'All') return EVENTS;
    if (filter === 'Live') return EVENTS.filter((e) => e.live);
    return EVENTS.filter((e) => e.cat === filter);
  }, [filter]);

  const featured = list[0];
  const grid = list.slice(1);

  const bet = (ev: MarketEvent, o: Outcome, side: Side) => {
    const m = outcomeToMarket(ev, o);
    ensureMarket(m);
    setTicket({ m, side });
  };

  return (
    <div className="desk-tab board">
      <nav className="cat-tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={filter === t}
            className={`cat-tab ${filter === t ? 'active' : ''} ${t === 'Live' ? 'live' : ''}`}
            onClick={() => setFilter(t)}>
            {t === 'Live' && <span className="cat-live-dot" />}{t}
          </button>
        ))}
      </nav>

      {featured && <Featured ev={featured} onBet={bet} />}

      <div className="card-grid">
        {grid.map((ev) => <MarketCard key={ev.id} ev={ev} onBet={bet} />)}
      </div>

      {ticket && <BetTicket market={ticket.m} side={ticket.side} onClose={() => setTicket(null)} />}
    </div>
  );
}

function Featured({ ev, onBet }: { ev: MarketEvent; onBet: (e: MarketEvent, o: Outcome, s: Side) => void }) {
  const top = [...ev.outcomes].sort((a, b) => b.yes - a.yes).slice(0, 5);
  return (
    <section className="feat">
      <div className="feat-left">
        <div className="feat-head">
          <span className="feat-icon">{ev.icon}</span>
          <h2 className="feat-title">{ev.title}</h2>
          {ev.live && <span className="live-badge"><span className="cat-live-dot" />Live</span>}
        </div>
        <div className="feat-outcomes">
          {ev.outcomes.map((o) => (
            <div className="feat-row" key={o.name}>
              <span className="feat-name">
                <span className="feat-dot" style={{ background: o.color }} />
                {o.meta && <span className="feat-meta">{o.meta}</span>}
                {o.name}
              </span>
              <button className="pill-yes" onClick={() => onBet(ev, o, 'YES')}>Yes {o.yes}%</button>
              <button className="pill-no" onClick={() => onBet(ev, o, 'NO')}>No {100 - o.yes}%</button>
            </div>
          ))}
        </div>
        <div className="feat-vol">{vol(ev.vol)}</div>
      </div>

      <div className="feat-right">
        <div className="feat-legend">
          {top.slice(0, 3).map((o) => (
            <span className="leg" key={o.name}>
              <span className="feat-dot" style={{ background: o.color }} />{o.name} <b>{o.yes}%</b>
            </span>
          ))}
        </div>
        <MultiLineChart outcomes={top} />
        {ev.news && (
          <div className="feat-news">
            <span className="feat-news-mark" aria-hidden="true">◉</span>
            <p>{ev.news}</p>
            <span className="feat-updated">Updated {ev.updated}</span>
          </div>
        )}
      </div>
    </section>
  );
}

function MarketCard({ ev, onBet }: { ev: MarketEvent; onBet: (e: MarketEvent, o: Outcome, s: Side) => void }) {
  const shown = ev.outcomes.slice(0, 2);
  const more = ev.outcomes.length - shown.length;
  return (
    <div className="mcard">
      <div className="mcard-top">
        <span className="mcard-icon">{ev.icon}</span>
        <span className="mcard-cat">{ev.cat}</span>
        {ev.live && <span className="live-badge sm"><span className="cat-live-dot" />Live</span>}
      </div>
      <h3 className="mcard-title">{ev.title}</h3>
      <div className="mcard-rows">
        {shown.map((o) => (
          <button className="mcard-row" key={o.name} onClick={() => onBet(ev, o, 'YES')} title={`Buy Yes on ${o.name}`}>
            <span className="mcard-name">{o.meta && <span className="feat-meta">{o.meta}</span>}{o.name}</span>
            <span className="mcard-mult">{impliedMultiplier(o.yes).toFixed(1)}x</span>
            <span className="mcard-pct">{o.yes}%</span>
          </button>
        ))}
      </div>
      {more > 0 && <div className="mcard-more">+{more} more</div>}
      <div className="mcard-foot">
        <span className="mcard-updated">{ev.updated}</span>
        <span className="mcard-vol">{vol(ev.vol)}</span>
      </div>
    </div>
  );
}
