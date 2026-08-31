import MultiLineChart from '../MultiLineChart';
import type { MarketEvent, Outcome } from '../marketsData';
import type { Side } from '../deskStore';

const vol = (n: number) =>
  (n >= 1000 ? (n / 1000).toFixed(1) + 'K' : String(n));

export default function MarketDetail({
  ev, onPick,
}: { ev: MarketEvent | null; onPick: (o: Outcome, side: Side) => void }) {
  if (!ev) {
    return (
      <div className="pane-body pane-empty">
        <p className="mono">No market selected</p>
        <p className="pane-empty-sub">Pick one from the list to see its chart and trade it.</p>
      </div>
    );
  }

  const top = [...ev.outcomes].sort((a, b) => b.yes - a.yes).slice(0, 5);

  return (
    <div className="pane-body">
      <div className="kicker">{ev.cat}{ev.live ? ' · Live' : ''} · {ev.updated}</div>
      <h2 className="detail-h">{ev.title}</h2>

      <div className="detail-legend mono">
        {top.slice(0, 3).map((o) => (
          <span className="leg" key={o.name}>
            <span className="dot" style={{ background: o.color }} />{o.name} <b>{o.yes}%</b>
          </span>
        ))}
      </div>

      <MultiLineChart outcomes={top} />

      <div className="detail-outcomes">
        {ev.outcomes.map((o) => (
          <div className="oc" key={o.name}>
            <span className="oc-name">
              <span className="dot" style={{ background: o.color }} />
              {o.meta && <span className="oc-meta mono">{o.meta}</span>}
              {o.name}
            </span>
            <button className="oc-p is-yes mono" onClick={() => onPick(o, 'YES')}>Y {o.yes}</button>
            <button className="oc-p is-no mono" onClick={() => onPick(o, 'NO')}>N {100 - o.yes}</button>
          </div>
        ))}
      </div>

      {ev.news && (
        <div className="detail-news">
          <span className="detail-news-mark" aria-hidden="true">◉</span>
          <p>{ev.news}</p>
        </div>
      )}
      <div className="detail-vol mono">VOL {vol(ev.vol)}</div>
    </div>
  );
}
