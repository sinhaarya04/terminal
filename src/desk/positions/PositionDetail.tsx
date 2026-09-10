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
      <div className="kicker">Position<span className="mono" style={{ fontWeight: 500, letterSpacing: 0, textTransform: 'none' }}>{row.p.marketId}</span></div>
      <h2 className="detail-h">{m?.q || row.p.marketId}</h2>

      {m?.spark && (
        <DeskSpark pts={m.spark} up={m.spark[m.spark.length - 1] >= m.spark[0]} id={`pos-${row.key}`} />
      )}

      {row.p.settled && (
        <p className={`settled-banner mono ${row.p.settled.outcome === 'VOID' ? '' : row.p.settled.outcome === row.p.side ? 'is-yes' : 'is-no'}`} role="status">
          {row.p.settled.outcome === 'VOID'
            ? `Market voided · your ${money(row.p.settled.payout)} stake was refunded`
            : `Market settled ${row.p.settled.outcome} · your cut of the pot was ${money(row.p.settled.payout)}`}
        </p>
      )}

      <div className="tk-calc">
        <div><span>{row.p.outcomeIdx != null ? 'Outcome' : 'Side'}</span>
          <b className={row.p.outcomeIdx != null ? 'is-yes' : row.p.side === 'YES' ? 'is-yes' : 'is-no'}>
            {row.p.outcomeIdx != null
              ? (m?.outcomes?.find((o) => o.idx === row.p.outcomeIdx)?.name ?? `#${row.p.outcomeIdx}`)
              : (row.p.side === 'YES' ? 'Yes' : 'No')}
          </b></div>
        <div><span>Shares</span><b>{row.p.shares.toFixed(1)}</b></div>
        <div><span>Entry</span><b>{entry.toFixed(0)}¢</b></div>
        {/* a settled position has no mark — the outcome replaced the price.
            per-share is the pot split, not a fixed $1 */}
        <div><span>{row.p.settled ? 'Paid per share' : 'Mark'}</span>
          <b>{row.p.settled
            ? `${row.p.shares > 0 ? Math.round((row.p.settled.payout / row.p.shares) * 100) : 0}¢`
            : `${mark}¢`}</b></div>
        <div><span>Cost</span><b>{money(row.p.cost)}</b></div>
        <div><span>{row.p.settled ? 'Payout' : 'Value'}</span><b>{money(row.value)}</b></div>
        <div className="is-total"><span>P&amp;L</span><b className={row.pnl >= 0 ? 'is-yes' : 'is-no'}>
          {row.pnl >= 0 ? '+' : ''}{money(row.pnl)}</b></div>
      </div>
    </div>
  );
}
