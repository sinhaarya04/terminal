import { useState } from 'react';
import { adminDeleteMarket, adminEditMarket, getMarket, useDesk } from '../deskStore';
import Icon from '../../components/Icon';

// Officer tools that apply to any board market, binary or multi: correct the
// wording, or remove the market. Settling lives with each screen because the
// two shapes settle differently. Wording edits touch the question and the
// outcome names only — the engine state is never sent, so a live market's
// odds cannot move from here.
export function BoardEdit({ code }: { code: string }) {
  const { isAdmin } = useDesk();
  const m = getMarket(code);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [names, setNames] = useState<{ idx: number; name: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (!isAdmin || !m || m.custom) return null;

  const start = () => {
    setQ(m.q);
    setNames((m.outcomes ?? []).map((o) => ({ idx: o.idx, name: o.name })));
    setErr('');
    setOpen(true);
  };
  const dirty = q.trim() !== m.q || names.some((n) => n.name.trim() !== (m.outcomes?.find((o) => o.idx === n.idx)?.name ?? ''));
  const valid = q.trim().length >= 3 && names.every((n) => n.name.trim().length > 0);
  const save = async () => {
    if (busy || !dirty || !valid) return;
    setBusy(true);
    const ok = await adminEditMarket(code, q, names);
    setBusy(false);
    if (!ok) setErr('Could not save the wording.'); else setOpen(false);
  };

  return (
    <section className="pv-block">
      <div className="pv-head mono">Officer · fix the wording</div>
      {open ? (
        <>
          <label className="tk-field">
            <span className="tk-label">Question<span className="mono">{q.trim().length}/120</span></span>
            <input className="tk-input" value={q} maxLength={120} onChange={(e) => setQ(e.target.value)} />
          </label>
          {names.length > 0 && (
            <div className="tk-field">
              <span className="tk-label">Outcome names</span>
              {names.map((n, i) => (
                <div className="oe-row" key={n.idx}>
                  <span className="oe-idx mono">{i + 1}</span>
                  <input className="tk-input oe-input" value={n.name} maxLength={40} aria-label={`Outcome ${i + 1} name`}
                    onChange={(e) => setNames(names.map((x) => (x.idx === n.idx ? { ...x, name: e.target.value } : x)))} />
                </div>
              ))}
            </div>
          )}
          <p className="pv-sub">Text only. Prices, positions and the close time stay exactly as they are.</p>
          <div className="pv-settle-row">
            <button className="btn btn-red pv-btn" type="button" onClick={save} disabled={busy || !dirty || !valid}>
              {busy ? 'Saving…' : 'Save wording'}
            </button>
            <button className="pv-cancel" type="button" onClick={() => setOpen(false)} disabled={busy}>Cancel</button>
          </div>
          {err && <p className="join-msg mono is-no" role="alert">{err}</p>}
        </>
      ) : (
        <>
          <p className="pv-sub">Correct a typo in the question{m.outcomes?.length ? ' or an outcome name' : ''} without touching the odds.</p>
          <div className="pv-settle-row">
            <button className="btn btn-quiet pv-btn" type="button" onClick={start}><Icon name="flag" />Edit wording</button>
          </div>
        </>
      )}
    </section>
  );
}

export function BoardRemove({ code, onDeleted }: { code: string; onDeleted?: () => void }) {
  const { isAdmin } = useDesk();
  const m = getMarket(code);
  const [arm, setArm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (!isAdmin || !m || m.custom) return null;

  const remove = async () => {
    if (busy) return;
    setBusy(true);
    const ok = await adminDeleteMarket(code);
    setBusy(false);
    if (!ok) setErr('Could not remove this market.'); else onDeleted?.();
  };

  return (
    <section className="pv-block">
      <div className="pv-head mono">Officer · remove this market</div>
      {arm ? (
        <>
          <p className="pv-confirm">
            Delete <b>{m.q}</b> from the board? {m.resolved
              ? 'It already settled, so this only removes its history.'
              : 'Everyone with a position gets their stake back first.'} Can't be undone.
          </p>
          <div className="pv-settle-row">
            <button className="btn btn-no pv-btn" type="button" onClick={remove} disabled={busy}>{busy ? 'Removing…' : 'Remove market'}</button>
            <button className="pv-cancel" type="button" onClick={() => setArm(false)} disabled={busy}>Keep</button>
          </div>
        </>
      ) : (
        <>
          <p className="pv-sub">For a market that should never have been listed. Stakes refund; the market and its history go.</p>
          <div className="pv-settle-row">
            <button className="btn btn-quiet pv-btn" type="button" onClick={() => setArm(true)}>Remove from the board</button>
          </div>
        </>
      )}
      {err && <p className="join-msg mono is-no" role="alert">{err}</p>}
    </section>
  );
}
