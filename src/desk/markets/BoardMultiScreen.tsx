import { useState } from 'react';
import { getMarket, outcomePrices, resolveMulti, marketPhase, useDesk, money } from '../deskStore';
import { useNow } from '../../lib/useNow';
import { formatClose, relativeClose } from '../../lib/closeTime';
import MultiTicket from './MultiTicket';

// The expanded view of a multi-outcome board market: outcome ladder + live
// prices on the left, the multi ticket docked right. Officers get a
// pick-the-winner settle. Board markets pay the PUB wallet.
export default function BoardMultiScreen({ code, onBack }: { code: string; onBack: () => void }) {
  const { positions, isAdmin } = useDesk();
  const now = useNow();
  const m = getMarket(code);
  const [pending, setPending] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  if (!m) return <div className="mscreen"><button className="mscreen-back mono" onClick={onBack}>← All markets</button><div className="pane-body pane-empty"><p className="mono">Market not found</p></div></div>;

  const prices = outcomePrices(m);
  const outs = m.outcomes ?? [];
  const phase = marketPhase(m, now);
  const chosen = outs.find((o) => o.idx === pending);

  const confirm = async () => {
    if (pending == null || busy) return;
    setBusy(true);
    await resolveMulti(m, pending);
    setBusy(false);
    setPending(null);
  };

  return (
    <div className="mscreen">
      <button className="mscreen-back mono" onClick={onBack}>← All markets</button>
      <div className="mscreen-body">
        <div className="mscreen-main">
          <div className="pane-body">
            <div className="kicker">
              {m.cat}{m.closesAt != null && phase !== 'settled' && <> · {relativeClose(m.closesAt, now)}</>}
              {m.closesAt != null && ` · closes ${formatClose(m.closesAt)}`}
            </div>
            <h2 className="detail-h">{m.q}</h2>
            {m.resolved === 'MULTI' && (
              <p className="settled-banner mono is-yes" role="status">
                Settled · {outs.find((o) => o.idx === m.resolvedIdx)?.name ?? 'a winner'} won — the {money(m.pool || 0)} pot split across its holders
              </p>
            )}
            {m.resolved === 'VOID' && <p className="settled-banner mono" role="status">Voided — every stake refunded.</p>}
            <div className="tk-calc mono"><div><span>POT</span><b className="is-yes">{money(m.pool || 0)}</b></div></div>
            <div className="mo-list">
              {outs.map((o, i) => {
                const held = positions.filter((p) => p.marketId === m.id && p.outcomeIdx === o.idx && !p.settled).reduce((a, p) => a + p.shares, 0);
                const won = m.resolved === 'MULTI' && m.resolvedIdx === o.idx;
                return (
                  <div className={`mo-row ${won ? 'is-won' : ''}`} key={o.idx}>
                    <span className="mo-name">{o.name}{won && <em className="mo-badge mono">winner</em>}</span>
                    <span className="mo-held mono">{held > 0 ? `${held.toFixed(1)} sh` : ''}</span>
                    <span className="mo-price mono">{prices[i]}¢</span>
                  </div>
                );
              })}
            </div>
            {isAdmin && phase !== 'settled' && (
              <section className="pv-block pv-settle">
                <div className="pv-head mono">Officer · pick the winner</div>
                {pending != null ? (
                  <>
                    <p className="pv-confirm">Settle <b>{chosen?.name}</b> as the winner? The {money(m.pool || 0)} pot splits across its holders, paid to their public balance. Can't be undone.</p>
                    <div className="pv-settle-row">
                      <button className="btn btn-red pv-btn" type="button" onClick={confirm} disabled={busy}>{busy ? 'Settling…' : `Confirm ${chosen?.name}`}</button>
                      <button className="pv-cancel" type="button" onClick={() => setPending(null)} disabled={busy}>Cancel</button>
                    </div>
                  </>
                ) : (
                  <div className="mo-settle-grid">
                    {outs.map((o) => <button key={o.idx} type="button" className="tk-side pv-btn" onClick={() => setPending(o.idx)}>{o.name}</button>)}
                  </div>
                )}
              </section>
            )}
          </div>
        </div>
        <div className="mscreen-ticket">
          {phase === 'open'
            ? <MultiTicket market={m} onDone={() => { /* stays on screen */ }} />
            : <div className="pane-body pane-empty"><div className="kicker">Ticket</div><p className="pane-empty-sub">This market is closed.</p></div>}
        </div>
      </div>
    </div>
  );
}
