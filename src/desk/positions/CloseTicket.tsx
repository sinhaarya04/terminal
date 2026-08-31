import { useState } from 'react';
import { placeBet, getMarket, money } from '../deskStore';
import type { PositionRow } from './PositionsList';

// deskStore has no close-out primitive and the spec forbids adding business
// logic, so closing is expressed as the opposite-side bet the store already
// supports: buying the other side for the position's current value offsets it.
export default function CloseTicket({
  row, onDone,
}: { row: PositionRow | null; onDone: () => void }) {
  const [busy, setBusy] = useState(false);

  if (!row) {
    return (
      <div className="pane-body pane-empty">
        <div className="kicker">Close out</div>
        <p className="pane-empty-sub">Select a position to close it.</p>
      </div>
    );
  }

  // A settled position is already cashed out; offsetting it would place a live
  // bet on a market that can no longer move (placeBet rejects it anyway).
  if (row.p.settled) {
    return (
      <div className="pane-body pane-empty">
        <div className="kicker">Close out</div>
        <p className="mono">Already settled</p>
        <p className="pane-empty-sub">
          This market resolved {row.p.settled.outcome} and paid {money(row.p.settled.payout)}. Nothing left to close.
        </p>
      </div>
    );
  }

  const m = getMarket(row.p.marketId);
  const opposite = row.p.side === 'YES' ? 'NO' : 'YES';

  const close = async () => {
    if (!m || busy) return;
    setBusy(true);
    const ok = await placeBet(m, opposite, row.value);
    setBusy(false);
    if (ok) onDone();
  };

  return (
    <div className="pane-body">
      <div className="kicker">Close out</div>
      <p className="tk-q">{m?.q || row.p.marketId}</p>
      <div className="tk-calc mono">
        <div><span>HOLDING</span><b>{row.p.shares.toFixed(1)} {row.p.side}</b></div>
        <div><span>VALUE</span><b>{money(row.value)}</b></div>
        <div><span>OFFSET WITH</span><b className={opposite === 'YES' ? 'is-yes' : 'is-no'}>{opposite}</b></div>
      </div>
      <button className="btn btn-red tk-go" disabled={!m || busy} onClick={close}>
        {busy ? 'Closing…' : `Offset · ${money(row.value)}`}
      </button>
    </div>
  );
}
