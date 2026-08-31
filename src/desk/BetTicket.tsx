import { useState } from 'react';
import { placeBet, money, useDesk, type DeskMarket, type Side } from './deskStore';

// Modal bet slip. Opens from a market's Yes/No button, lets you size the trade
// in fake $, shows cost + potential payout, and commits it to the store.
export default function BetTicket({
  market,
  side,
  onClose,
}: {
  market: DeskMarket;
  side: Side;
  onClose: () => void;
}) {
  const { balance } = useDesk();
  const [amount, setAmount] = useState(25);
  const price = side === 'YES' ? market.yes : 100 - market.yes; // cents
  const shares = price > 0 ? amount / (price / 100) : 0;
  const maxPayout = shares * 1; // each share pays $1 if it wins
  const tooMuch = amount > balance;
  const invalid = amount <= 0 || tooMuch;

  const [busy, setBusy] = useState(false);
  const confirm = async () => {
    if (invalid || busy) return;
    setBusy(true);
    const ok = await placeBet(market, side, amount);
    setBusy(false);
    if (ok) onClose();
  };

  const chip = (v: number) => (
    <button type="button" className="ticket-chip mono" onClick={() => setAmount(v)} disabled={v > balance}>
      {money(v)}
    </button>
  );

  return (
    <div className="ticket-backdrop" onClick={onClose}>
      <div className="ticket glass" onClick={(e) => e.stopPropagation()}>
        <div className="ticket-head">
          <span className={`ticket-side mono ${side === 'YES' ? 'is-yes' : 'is-no'}`}>{side}</span>
          <span className="ticket-price mono">{price}¢</span>
          <button className="ticket-x mono" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <p className="ticket-q">{market.q}</p>
        <div className="ticket-code mono">{market.id}{market.cat ? ` · ${market.cat}` : ''}</div>

        <label className="ticket-field">
          <span className="desk-label">Amount ($)</span>
          <input
            className="desk-input mono"
            type="number"
            min={1}
            value={amount}
            onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))}
          />
        </label>
        <div className="ticket-chips">{chip(10)}{chip(25)}{chip(50)}{chip(100)}</div>

        <div className="ticket-calc mono">
          <div><span>Shares</span><b>{shares.toFixed(1)}</b></div>
          <div><span>Cost</span><b>{money(amount)}</b></div>
          <div><span>Max payout</span><b className="is-yes">{money(maxPayout)}</b></div>
          <div><span>Balance after</span><b className={tooMuch ? 'is-no' : ''}>{money(Math.max(0, balance - amount))}</b></div>
        </div>

        {tooMuch && <p className="ticket-err mono">Not enough credits.</p>}

        <button className={`desk-btn ${side === 'YES' ? 'desk-btn-green' : 'desk-btn-red'}`} disabled={invalid || busy} onClick={confirm}>
          {busy ? 'Placing…' : `Buy ${side} · ${money(amount)}`}
        </button>
      </div>
    </div>
  );
}
