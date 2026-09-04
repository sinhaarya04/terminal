import MultiLineChart from '../MultiLineChart';
import Icon from '../../components/Icon';
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
      <div className="detail-meta">
        <span className="mkt-cat">{ev.cat}</span>
        {ev.live && <><span className="sep" /><span className="mkt-live" style={{ marginLeft: 0 }}><span className="t-shimmer" data-text="Live">Live</span></span></>}
        <span className="sep" />
        <span>Updated {ev.updated}</span>
        <span className="sep" />
        <span>{ev.outcomes.length} outcome{ev.outcomes.length === 1 ? '' : 's'}</span>
      </div>
      <h2 className="detail-h">{ev.title}</h2>

      <div className="detail-chart">
        <div className="detail-legend">
          {top.slice(0, 3).map((o) => (
            <span className="leg" key={o.name}>
              <span className="dot" style={{ background: o.color }} />{o.name} <b>{o.yes}%</b>
            </span>
          ))}
        </div>
        <MultiLineChart outcomes={top} />
      </div>

      <div className="detail-outcomes">
        <div className="detail-outcomes-head" aria-hidden="true">
          <span>Outcome</span><span>Yes</span><span>No</span>
        </div>
        {ev.outcomes.map((o) => (
          <div className="oc" key={o.name}>
            <span className="oc-name">
              <span className="dot" style={{ background: o.color }} />
              {o.meta && <span className="oc-meta">{o.meta}</span>}
              <span>{o.name}</span>
            </span>
            <button className="oc-p is-yes" onClick={() => onPick(o, 'YES')} aria-label={`Buy Yes on ${o.name} at ${o.yes} cents`}>
              Yes <b>{o.yes}¢</b>
            </button>
            <button className="oc-p is-no" onClick={() => onPick(o, 'NO')} aria-label={`Buy No on ${o.name} at ${100 - o.yes} cents`}>
              No <b>{100 - o.yes}¢</b>
            </button>
          </div>
        ))}
      </div>

      {ev.news && (
        <div className="detail-news">
          <span className="detail-news-mark" aria-hidden="true"><Icon name="signal" size={13} /></span>
          <p>{ev.news}</p>
        </div>
      )}
      <div className="detail-vol">
        <span>Volume {vol(ev.vol)}</span>
      </div>
    </div>
  );
}
