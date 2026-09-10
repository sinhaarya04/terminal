import { useState, type FormEvent } from 'react';
import {
  useDesk, joinByCode, getMarket, marketPhase, positionValue, money, round2,
  type DeskMarket,
} from '../deskStore';
import { useNow } from '../../lib/useNow';
import { useTilt } from '../useTilt';
import { formatClose, relativeClose } from '../../lib/closeTime';
import Icon from '../../components/Icon';

// The Personal tab's home: sim wallet + P&L up top, then a compact grid of
// every market this account is in, ending on the tile that makes a new one.
// Personal markets play in their own $1,000 simulation wallet — deliberately
// not the platform balance, so a joke market among friends can never bankroll
// (or bankrupt) board positions.
export default function PersonalGrid({
  onOpen, onNew,
}: { onOpen: (m: DeskMarket) => void; onNew: () => void }) {
  const tilt = useTilt();
  const { custom, positions, pmBalance } = useDesk();
  const now = useNow();
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // P&L across every personal position: settled ones at what they actually
  // paid, open ones marked to the current price.
  const pnl = round2(positions.reduce((acc, p) => {
    const m = getMarket(p.marketId);
    if (!m?.custom) return acc;
    return acc + positionValue(p, m) - p.cost;
  }, 0));

  const join = async (e: FormEvent) => {
    e.preventDefault();
    const m = await joinByCode(code);
    if (m) { setMsg(null); setCode(''); onOpen(m); }
    else setMsg({ ok: false, text: 'No market for that code.' });
  };

  return (
    <div className="grid-wrap">
      <div className="pg-head">
        <div className="kicker">Personal<span className="title-count">{custom.length}</span></div>
        <div className="pg-stats">
          <span className="pg-stat" title="Personal markets play in private credits — a separate wallet from your public balance. Winnings here never touch the public board, and going broke here never touches it either.">
            <em>Private credits</em>
            <b className="mono">{money(pmBalance)}</b>
          </span>
          <span className="pg-stat">
            <em>Open P&amp;L</em>
            <b className={`mono ${pnl >= 0 ? 'is-yes' : 'is-no'}`}>{pnl >= 0 ? '+' : ''}{money(pnl)}</b>
          </span>
        </div>
        <form className="pg-join" onSubmit={join}>
          <input
            className="tk-input mono pg-join-input"
            value={code}
            maxLength={8}
            placeholder="EX-XXXX"
            aria-label="Join with a code"
            onChange={(e) => { setCode(e.target.value.toUpperCase()); setMsg(null); }}
          />
          <button className="btn btn-ghost pg-join-go" type="submit" disabled={!code.trim()}>Join</button>
        </form>
      </div>
      {msg && <p className="join-msg mono is-no" role="alert">{msg.text}</p>}
      <p className="pg-note">
        Personal markets play in <b>private credits</b>, a separate wallet from the public
        balance in the rail. The two never mix: winnings here stay here.
      </p>

      <div className="grid">
        {custom.map((m) => {
          const phase = marketPhase(m, now);
          return (
            <button key={m.id} className="mkt pg-card" onClick={() => onOpen(m)} {...tilt}>
              <div className="mkt-top">
                <span className="mkt-cat">{m.id}</span>
                <span className={`mkt-live pg-phase ${phase === 'settled' ? (m.resolved === 'YES' ? 'is-yes' : m.resolved === 'NO' ? 'is-no' : 'is-flat') : phase === 'closed' ? 'is-flat' : 'is-yes'}`}>
                  {phase === 'settled' ? (m.resolved === 'VOID' ? 'voided' : `settled ${m.resolved}`) : phase === 'closed' ? 'closed' : 'open'}
                </span>
              </div>
              <div className="mkt-title">{m.q}</div>
              <div className="pg-price mono">
                <span><span className="is-yes">Yes</span> {m.yes}¢ <span className="pg-pool">/ No {100 - m.yes}¢</span></span>
                <span className="pg-pool">{money(m.pool || 0)} pot</span>
              </div>
              <div className="mkt-foot">
                <span>by {m.owner}</span>
                <span>
                  {m.closesAt != null
                    ? (phase === 'open' ? relativeClose(m.closesAt, now) : formatClose(m.closesAt))
                    : m.closes}
                </span>
              </div>
            </button>
          );
        })}

        <button className="mkt pg-new" onClick={onNew} aria-label="Create a new market">
          <span className="pg-plus" aria-hidden="true"><Icon name="plus" /></span>
          <span className="pg-new-label">New market</span>
        </button>
      </div>
    </div>
  );
}
