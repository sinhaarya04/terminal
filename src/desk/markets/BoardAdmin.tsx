import { useState } from 'react';
import { resolveMarket, adminDeleteMarket, getMarket, useDesk, marketPhase, money, type Side } from '../deskStore';

// Officer-only controls on an open board market: settle it YES/NO (or watch it
// void if a side is empty). Board markets have no owner, so before the admin
// role existed nothing could ever pay them out. Mirrors the personal SettleBox
// but pays the PUB wallet.
export default function BoardAdmin({ code, onDeleted }: { code: string; onDeleted?: () => void }) {
  const { isAdmin } = useDesk();
  const m = getMarket(code);
  const [pending, setPending] = useState<Side | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [delArm, setDelArm] = useState(false);

  if (!isAdmin || !m || m.custom) return null;   // admins, board markets only

  const remove = async () => {
    if (busy) return;
    setBusy(true);
    const ok = await adminDeleteMarket(code);
    setBusy(false);
    if (!ok) setErr('Could not remove this market.');
    else onDeleted?.();
  };
  const removeBox = (
    <section className="pv-block">
      <div className="pv-head mono">Officer · remove this market</div>
      {delArm ? (
        <>
          <p className="pv-confirm">
            Delete <b>{m.q}</b> from the board? {m.resolved
              ? 'It already settled, so this only removes its history.'
              : 'Everyone with a position gets their stake back first.'} Can't be undone.
          </p>
          <div className="pv-settle-row">
            <button className="btn btn-no pv-btn" type="button" onClick={remove} disabled={busy}>{busy ? 'Removing…' : 'Remove market'}</button>
            <button className="pv-cancel" type="button" onClick={() => setDelArm(false)} disabled={busy}>Keep</button>
          </div>
        </>
      ) : (
        <>
          <p className="pv-sub">For a market that should never have been listed. Stakes refund; the market and its history go.</p>
          <div className="pv-settle-row">
            <button className="btn btn-quiet pv-btn" type="button" onClick={() => setDelArm(true)}>Remove from the board</button>
          </div>
        </>
      )}
      {err && <p className="join-msg mono is-no" role="alert">{err}</p>}
    </section>
  );

  if (m.resolved) return removeBox;   // settled: nothing left to settle, only to tidy
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
    <>
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
    {removeBox}
    </>
  );
}
