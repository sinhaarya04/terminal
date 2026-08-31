import DeskSpark from '../DeskSpark';
import { getMarket, money } from '../deskStore';
import type { PositionRow } from './PositionsList';

export default function PositionDetail({ row }: { row: PositionRow | null }) {
  if (!row) {
    return (
      <div className="pane-body pane-empty">
        <p className="mono">No position selected</p>
        <p className="pane-empty-sub">Pick one from the list to see how it is marking.</p>
      </div>
    );
  }

  const m = getMarket(row.p.marketId);
  const entry = row.p.shares > 0 ? (row.p.cost / row.p.shares) * 100 : 0;
  const mark = m ? (row.p.side === 'YES' ? m.yes : 100 - m.yes) : 0;

  return (
    <div className="pane-body">
      <div className="kicker">Position · {row.p.marketId}</div>
      <h2 className="detail-h">{m?.q || row.p.marketId}</h2>

      {m?.spark && (
        <DeskSpark pts={m.spark} up={m.spark[m.spark.length - 1] >= m.spark[0]} id={`pos-${row.key}`} />
      )}

      {row.p.settled && (
        <p className={`settled-banner mono ${row.p.settled.outcome === row.p.side ? 'is-yes' : 'is-no'}`} role="status">
          Market settled {row.p.settled.outcome} · this position paid {money(row.p.settled.payout)}
        </p>
      )}

      <div className="tk-calc mono">
        <div><span>SIDE</span><b className={row.p.side === 'YES' ? 'is-yes' : 'is-no'}>{row.p.side}</b></div>
        <div><span>SHARES</span><b>{row.p.shares.toFixed(1)}</b></div>
        <div><span>ENTRY</span><b>{entry.toFixed(0)}¢</b></div>
        {/* a settled position has no mark — the outcome replaced the price */}
        <div><span>{row.p.settled ? 'PAID' : 'MARK'}</span><b>{row.p.settled ? '100¢ / 0¢' : `${mark}¢`}</b></div>
        <div><span>COST</span><b>{money(row.p.cost)}</b></div>
        <div><span>{row.p.settled ? 'PAYOUT' : 'VALUE'}</span><b>{money(row.value)}</b></div>
        <div><span>P&amp;L</span><b className={row.pnl >= 0 ? 'is-yes' : 'is-no'}>
          {row.pnl >= 0 ? '+' : ''}{money(row.pnl)}</b></div>
      </div>
    </div>
  );
}
