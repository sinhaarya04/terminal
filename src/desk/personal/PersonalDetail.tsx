import { useState, type FormEvent } from 'react';
import DeskSpark from '../DeskSpark';
import { createMarket, money, type DeskMarket } from '../deskStore';
import type { PersonalSel } from './PersonalList';

export default function PersonalDetail({
  sel, onCreated,
}: { sel: PersonalSel | null; onCreated: (m: DeskMarket) => void }) {
  if (!sel) {
    return (
      <div className="pane-body pane-empty">
        <p className="mono">Nothing selected</p>
        <p className="pane-empty-sub">Create a market, or pick one you already have.</p>
      </div>
    );
  }
  if (sel.kind === 'new') return <CreateForm onCreated={onCreated} />;

  const m = sel.m;
  return (
    <div className="pane-body">
      <div className="kicker">{m.cat} · closes {m.closes} · by {m.owner}</div>
      <h2 className="detail-h">{m.q}</h2>
      {m.spark && <DeskSpark pts={m.spark} up={m.spark[m.spark.length - 1] >= m.spark[0]} id={`pv-${m.id}`} />}
      <div className="tk-calc mono">
        <div><span>POOL</span><b className="is-yes">{money(m.pool || 0)}</b></div>
        <div><span>YES</span><b>{m.yes}¢</b></div>
        <div><span>NO</span><b>{100 - m.yes}¢</b></div>
      </div>
    </div>
  );
}

function CreateForm({ onCreated }: { onCreated: (m: DeskMarket) => void }) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('Private');
  const [closes, setCloses] = useState('');
  const [yes, setYes] = useState(50);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!q.trim() || busy) return;
    setBusy(true);
    const m = await createMarket({ q, cat, closes, yes });
    setBusy(false);
    setQ(''); setCloses(''); setYes(50);
    onCreated(m);
  };

  return (
    <form className="pane-body" onSubmit={submit}>
      <div className="kicker">Create a market</div>
      <label className="tk-field">
        <span className="tk-label mono">Question</span>
        <input
          className="tk-input"
          value={q}
          maxLength={120}
          placeholder="Will we hit the gym 4x this week?"
          onChange={(e) => setQ(e.target.value)}
        />
      </label>
      <label className="tk-field">
        <span className="tk-label mono">Category</span>
        <input className="tk-input" value={cat} maxLength={16} onChange={(e) => setCat(e.target.value)} />
      </label>
      <label className="tk-field">
        <span className="tk-label mono">Closes</span>
        <input
          className="tk-input"
          value={closes}
          maxLength={12}
          placeholder="Sun"
          onChange={(e) => setCloses(e.target.value)}
        />
      </label>
      <label className="tk-field">
        <span className="tk-label mono">Opening Yes odds · {yes}¢</span>
        <input
          className="tk-range"
          type="range"
          min={5}
          max={95}
          value={yes}
          onChange={(e) => setYes(Number(e.target.value))}
        />
      </label>
      <button className="btn btn-red tk-go" type="submit" disabled={!q.trim() || busy}>
        {busy ? 'Creating…' : 'Generate share code'}
      </button>
    </form>
  );
}
