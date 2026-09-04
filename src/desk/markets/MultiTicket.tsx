import { useState } from 'react';
import { placeBetMulti, money, useDesk, walletFor, outcomePrices, marketPhase, getMarket, type DeskMarket } from '../deskStore';
import * as lmsr from '../../lib/lmsr';

// Trade panel for a multi-outcome market: pick an outcome, buy in. Prices are a
// softmax across all outcomes (they sum to 100%). Your "cut if it wins" is your
// slice of the pot as it would stand after this buy.
export default function MultiTicket({ market, onDone }: { market: DeskMarket; onDone: () => void }) {
  const desk = useDesk();
  const live = (getMarket(market.id) ?? market);
  const [idx, setIdx] = useState<number>(live.outcomes?.[0]?.idx ?? 1);
  const [amount, setAmount] = useState(25);
  const [busy, setBusy] = useState(false);

  if (marketPhase(live) !== 'open') {
    return (
      <div className="pane-body pane-empty">
        <div className="kicker">Ticket</div>
        <p className="pane-empty-sub">This market is closed and no longer taking bets.</p>
      </div>
    );
  }

  const outs = live.outcomes ?? [];
  const prices = outcomePrices(live);
  const wallet = walletFor(live);
  const balance = desk[wallet];
  const chosen = outs.find((o) => o.idx === idx);
  const q = outs.map((o) => o.pq);
  const iPos = outs.findIndex((o) => o.idx === idx);
  const shares = iPos >= 0 ? lmsr.sharesForSpendN(q, iPos, amount, live.b ?? 100) : 0;
  const potAfter = (live.pool || 0) + amount;
  const winSharesAfter = (chosen?.sq ?? 0) + shares;
  const cutIfWins = winSharesAfter > 0 ? shares * (potAfter / winSharesAfter) : 0;
  const tooMuch = amount > balance;

  const buy = async () => {
    if (busy || amount <= 0 || tooMuch) return;
    setBusy(true);
    const ok = await placeBetMulti(live, idx, amount);
    setBusy(false);
    if (ok) onDone();
  };

  return (
    <div className="pane-body">
      <div className="kicker">Ticket</div>
      <p className="tk-q">{live.q}</p>
      <div className="tk-code"><span className="mono">{live.id}</span><span className="mkt-cat">{outs.length} outcomes</span></div>

      <div className="mt-outcomes" role="radiogroup" aria-label="Outcome">
        {outs.map((o, i) => (
          <button key={o.idx} type="button" role="radio" aria-checked={o.idx === idx}
            className={`mt-outcome ${o.idx === idx ? 'is-on' : ''}`} onClick={() => setIdx(o.idx)}>
            <span className="mt-name">{o.name}</span>
            <span className="mt-price mono">{prices[i]}¢</span>
          </button>
        ))}
      </div>

      <label className={`tk-field t-input-wrap ${tooMuch ? 'is-error' : ''}`}>
        <span className="tk-label">Amount<span className="mono">{live.custom ? 'Private' : 'Public'} {money(balance)}</span></span>
        <span className="tk-amount">
          <input className={`tk-input mono ${tooMuch ? 'is-error' : ''}`} type="number" min={1}
            value={amount} onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))} />
        </span>
      </label>
      <div className="tk-chips">
        {[10, 25, 50, 100].map((v) => (
          <button key={v} type="button" className="tk-chip mono" disabled={v > balance} onClick={() => setAmount(v)}>{money(v)}</button>
        ))}
      </div>

      <div className="tk-calc">
        <div><span>Price</span><b>{iPos >= 0 ? prices[iPos] : 0}¢</b></div>
        <div><span>Shares</span><b>{shares.toFixed(1)}</b></div>
        <div><span>Cost</span><b>{money(amount)}</b></div>
        <div><span>Cut if it wins</span><b className="is-yes">{money(cutIfWins)}</b></div>
        <div className="is-total"><span>{live.custom ? 'Private' : 'Public'} balance after</span>
          <b className={tooMuch ? 'is-no' : ''}>{money(Math.max(0, balance - amount))}</b></div>
      </div>

      <button className="btn btn-red tk-go" disabled={amount <= 0 || tooMuch || busy} onClick={buy}>
        {busy ? 'Placing…' : `Buy ${chosen?.name ?? ''} · ${money(amount)}`}
      </button>
    </div>
  );
}
