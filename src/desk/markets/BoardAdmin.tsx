import { useState } from 'react';
import { resolveMarket, getMarket, useDesk, marketPhase, money, type Side } from '../deskStore';

// Officer-only controls on an open board market: settle it YES/NO (or watch it
// void if a side is empty). Board markets have no owner, so before the admin
// role existed nothing could ever pay them out. Mirrors the personal SettleBox
// but pays the PUB wallet.
export default function BoardAdmin({ code }: { code: string }) {
  const { isAdmin } = useDesk();
  const m = getMarket(code);
  const [pending, setPending] = useState<Side | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  if (!isAdmin || !m || m.custom || m.resolved) return null;   // admins, open board markets only
  const phase = marketPhase(m);

  const confirm = async () => {
    if (!pending || busy) return;
    setBusy(true);
    const credited = await resolveMarket(code, pending);
    setBusy(false);
    if (credited === null) setErr('Could not settle — are you still an admin?');
    else setPending(null);
  };

  return (
    <section className="pv-block pv-settle">
      <div className="pv-head mono">Officer · settle this market</div>
      {pending ? (
        <>
          <p className="pv-confirm">
            Settle <b>{pending}</b>? The {money(m.pool || 0)} pot splits across
            everyone holding {pending}, paid into their public balance. If nobody
            holds {pending} the market voids and stakes refund. Can't be undone.
          </p>
          <div className="pv-settle-row">
            <button className="btn btn-red pv-btn" type="button" onClick={confirm} disabled={busy}>
              {busy ? 'Settling…' : `Confirm ${pending}`}
            </button>
            <button className="pv-cancel" type="button" onClick={() => setPending(null)} disabled={busy}>Cancel</button>
          </div>
        </>
      ) : (
        <>
          <p className="pv-sub">
            {phase === 'closed' ? 'Closed and waiting on a result.' : 'Pick the outcome that actually happened.'}
          </p>
          <div className="pv-settle-row">
            <button className="tk-side is-yes pv-btn" type="button" onClick={() => setPending('YES')}>YES</button>
            <button className="tk-side is-no pv-btn" type="button" onClick={() => setPending('NO')}>NO</button>
          </div>
        </>
      )}
      {err && <p className="join-msg mono is-no" role="alert">{err}</p>}
    </section>
  );
}
