import { useEffect, useRef, useState } from 'react';
import { placeBet, money, useDesk, marketPhase, walletFor, engineOf, type DeskMarket, type Side } from '../deskStore';
import * as lmsr from '../../lib/lmsr';
import { useNow } from '../../lib/useNow';
import SuccessCheck from '../../components/SuccessCheck';

export default function TradeTicket({
  market, side, onSide, onDone,
  // The board picks an outcome out of several; a private market has only the
  // one question, so each caller names its own nothing-selected state.
  emptyHint = 'Choose an outcome to build an order.',
}: {
  market: DeskMarket | null;
  side: Side;
  onSide: (s: Side) => void;
  onDone: () => void;
  emptyHint?: string;
}) {
  // Private markets spend the personal fun-money wallet, the board spends the
  // main balance — the ticket must budget against the one this market uses.
  const desk = useDesk();
  const balance = market ? desk[walletFor(market)] : desk.balance;
  const now = useNow();
  const [amount, setAmount] = useState(25);
  const [busy, setBusy] = useState(false);
  // Monotonic nonce: overspending by the same amount twice produces an
  // identical error state, so an effect keyed only on `tooMuch` would never
  // re-run and the shake would fire once, ever.
  const [nonce, setNonce] = useState(0);
  const [placed, setPlaced] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!nonce) return;
    const el = inputRef.current;
    if (!el) return;
    el.classList.remove('is-shaking');   // `t-input` and `is-error` stay put
    void el.offsetWidth;                 // forces layout; without it nothing replays
    el.classList.add('is-shaking');
  }, [nonce]);

  if (placed) {
    return (
      <div className="pane-body">
        <div className="kicker">Ticket</div>
        <div className="success-wrap">
          <SuccessCheck label="Bet placed" />
          <p>Bet placed</p>
        </div>
      </div>
    );
  }

  // A market past its close (or already settled) can't take an order. Personal
  // renders its own explanation for those, but the board reaches this component
  // too, so the guard lives here rather than only in the caller.
  if (!market || marketPhase(market, now) !== 'open') {
    return (
      <div className="pane-body pane-empty">
        <div className="kicker">Ticket</div>
        <p className="pane-empty-sub">
          {!market ? emptyHint : 'This market has closed and is no longer taking bets.'}
        </p>
      </div>
    );
  }

  // The hybrid engine quotes the real cost: shares come from the LMSR meter,
  // and the payout estimate is your cut of the pot as it would stand after
  // this trade — not "each share pays $1", which minted points from nowhere.
  const eng = engineOf(market);
  const q = { qYes: eng.qYes, qNo: eng.qNo };
  const price = side === 'YES' ? market.yes : 100 - market.yes; // cents, display
  const shares = lmsr.sharesForSpend(q, side, amount, eng.b);
  const potAfter = (market.pool || 0) + amount;
  const winSharesAfter = (side === 'YES' ? eng.sqYes : eng.sqNo) + shares;
  const cutIfWins = winSharesAfter > 0 ? shares * (potAfter / winSharesAfter) : 0;
  const potPct = winSharesAfter > 0 ? Math.round((shares / winSharesAfter) * 100) : 0;
  const tooMuch = amount > balance;
  const invalid = amount <= 0 || tooMuch;

  const confirm = async () => {
    if (busy) return;
    if (invalid) { setNonce((n) => n + 1); return; }   // shake rather than fail silently
    setBusy(true);
    const ok = await placeBet(market, side, amount);
    setBusy(false);
    if (ok) {
      setPlaced(true);                      // hold the check on screen, then hand back
      setTimeout(() => { setPlaced(false); onDone(); }, 900);
    }
  };

  const chip = (v: number) => (
    <button type="button" className="tk-chip mono" onClick={() => setAmount(v)} disabled={v > balance}>
      {money(v)}
    </button>
  );

  return (
    <div className="pane-body">
      <div className="kicker">Ticket</div>
      <p className="tk-q">{market.q}</p>
      <div className="tk-code mono">{market.id}{market.cat ? ` · ${market.cat}` : ''}</div>

      <div className="tk-sides">
        <button className={`tk-side is-yes ${side === 'YES' ? 'is-on' : ''}`} onClick={() => onSide('YES')}>YES</button>
        <button className={`tk-side is-no ${side === 'NO' ? 'is-on' : ''}`} onClick={() => onSide('NO')}>NO</button>
      </div>

      <label className={`tk-field t-input-wrap ${tooMuch ? 'is-error' : ''}`}>
        <span className="tk-label mono">Amount ($)</span>
        <input
          ref={inputRef}
          className={`tk-input mono t-input ${tooMuch ? 'is-error' : ''}`}
          type="number"
          min={1}
          value={amount}
          onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))}
        />
        <span className="t-error-msg tk-err mono" role="alert">Not enough credits.</span>
      </label>
      <div className="tk-chips">{chip(10)}{chip(25)}{chip(50)}{chip(100)}</div>

      <div className="tk-calc mono">
        <div><span>PRICE</span><b>{price}¢</b></div>
        <div><span>SHARES</span><b>{shares.toFixed(1)}</b></div>
        <div><span>COST</span><b>{money(amount)}</b></div>
        {/* your slice of the pot as it stands after this buy — it grows as the
            other side pays in and shrinks as your side gets crowded */}
        <div><span>CUT IF {side} WINS</span><b className="is-yes">{money(cutIfWins)} · {potPct}%</b></div>
        <div>
          <span>{market.custom ? 'SIM BALANCE AFTER' : 'BALANCE AFTER'}</span>
          <b className={tooMuch ? 'is-no' : ''}>{money(Math.max(0, balance - amount))}</b>
        </div>
      </div>

      <button className="btn btn-red tk-go" disabled={amount <= 0 || busy} onClick={confirm}>
        {busy ? 'Placing…' : `Buy ${side} · ${money(amount)}`}
      </button>
    </div>
  );
}
