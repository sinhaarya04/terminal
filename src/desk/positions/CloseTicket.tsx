import { useState } from 'react';
import { sellShares, sellMulti, getMarket, engineOf, marketPhase, money, round2 } from '../deskStore';
import * as lmsr from '../../lib/lmsr';
import type { PositionRow } from './PositionsList';

// A real exit, not the old "offset" hack. Shares go back to the LMSR meter for
// their live value C(q) − C(q−s): cash lands now, the price ticks down, and
// the pot shrinks by exactly the proceeds. (Offsetting — buying the other side
// — only ever locked anything under the fixed $1 payout; under parimutuel it
// just spent more money without closing the position.)
export default function CloseTicket({
  row, onDone,
}: { row: PositionRow | null; onDone: () => void }) {
  const [sellN, setSellN] = useState<number | null>(null);   // null = all
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  if (!row) {
    return (
      <div className="pane-body pane-empty">
        <div className="kicker">Sell</div>
        <p className="pane-empty-sub">Select a position to sell out of it.</p>
      </div>
    );
  }

  if (row.p.settled) {
    return (
      <div className="pane-body pane-empty">
        <div className="kicker">Sell</div>
        <p className="mono">Already settled</p>
        <p className="pane-empty-sub">
          {row.p.settled.outcome === 'VOID'
            ? `This market voided and your ${money(row.p.settled.payout)} stake was refunded.`
            : `This market resolved ${row.p.settled.outcome} and paid ${money(row.p.settled.payout)}. Nothing left to sell.`}
        </p>
      </div>
    );
  }

  const m = getMarket(row.p.marketId);
  const open = m != null && marketPhase(m) === 'open';
  const held = row.p.shares;
  const amount = Math.min(sellN ?? held, held);

  // Multi positions hold one outcome of N, so they sell back to the N-outcome
  // meter through term_sell_multi; the binary RPC refuses them.
  const outcomeIdx = row.p.outcomeIdx;
  const isMulti = outcomeIdx != null;
  const outcome = isMulti ? m?.outcomes?.find((o) => o.idx === outcomeIdx) : undefined;
  const sideLabel = isMulti ? (outcome?.name ?? `#${outcomeIdx}`) : row.p.side;

  let proceeds = 0;
  if (m && open && amount > 0) {
    if (isMulti) {
      const outs = m.outcomes ?? [];
      const iPos = outs.findIndex((o) => o.idx === outcomeIdx);
      if (iPos >= 0) proceeds = round2(lmsr.proceedsForSellN(outs.map((o) => o.pq), iPos, amount, m.b ?? lmsr.DEFAULT_B));
    } else {
      const eng = engineOf(m);
      proceeds = round2(lmsr.proceedsForSell({ qYes: eng.qYes, qNo: eng.qNo }, row.p.side, amount, eng.b));
    }
  }
  const costOut = held > 0 ? round2(row.p.cost * (amount / held)) : 0;

  const sell = async () => {
    if (!m || busy || amount <= 0) return;
    setBusy(true);
    const got = isMulti ? await sellMulti(m, outcomeIdx, amount) : await sellShares(m, row.p.side, amount);
    setBusy(false);
    if (got == null) { setErr('Could not sell — the market may have closed.'); return; }
    setErr('');
    onDone();
  };

  return (
    <div className="pane-body">
      <div className="kicker">Sell</div>
      <p className="tk-q">{m?.q || row.p.marketId}</p>

      <label className="tk-field">
        <span className="tk-label mono">Shares to sell (of {held.toFixed(1)} {sideLabel})</span>
        <input
          className="tk-input mono"
          type="number"
          min={0}
          max={held}
          step="any"
          value={amount.toFixed(1)}
          onChange={(e) => setSellN(Math.max(0, Math.min(held, Number(e.target.value) || 0)))}
        />
      </label>
      <div className="tk-chips">
        <button type="button" className="tk-chip mono" onClick={() => setSellN(round2(held / 2))}>Half</button>
        <button type="button" className="tk-chip mono" onClick={() => setSellN(null)}>All</button>
      </div>

      <div className="tk-calc mono">
        <div><span>YOU RECEIVE</span><b className="is-yes">{money(proceeds)}</b></div>
        <div><span>COST BASIS OUT</span><b>{money(costOut)}</b></div>
        <div><span>REALISED P&amp;L</span>
          <b className={proceeds - costOut >= 0 ? 'is-yes' : 'is-no'}>
            {proceeds - costOut >= 0 ? '+' : ''}{money(round2(proceeds - costOut))}
          </b>
        </div>
      </div>

      {!open && <p className="join-msg mono is-no" role="alert">This market is closed — positions settle when the owner resolves it.</p>}
      {err && <p className="join-msg mono is-no" role="alert">{err}</p>}

      <button className="btn btn-red tk-go" disabled={!m || !open || busy || amount <= 0} onClick={sell}>
        {busy ? 'Selling…' : `Sell ${amount.toFixed(1)} ${sideLabel} · ${money(proceeds)}`}
      </button>
    </div>
  );
}
