import { useState, type FormEvent } from 'react';
import { useDesk, createMarket, joinByCode, money, type DeskMarket, type Side } from './deskStore';
import DeskSpark from './DeskSpark';
import BetTicket from './BetTicket';

// Personalized markets: spin up your own market, get a share code, hand it to
// friends. They punch in the code, decide how much to put in, and bet. Every
// bet grows the market's pool.
export default function DeskPersonal() {
  const { custom } = useDesk();
  const [ticket, setTicket] = useState<{ m: DeskMarket; side: Side } | null>(null);

  return (
    <div className="desk-tab desk-personal">
      <div className="desk-personal-grid">
        <CreatePanel />
        <JoinPanel />
      </div>

      <div className="desk-mine">
        <div className="desk-mine-head">Your private markets</div>
        {custom.length === 0 ? (
          <p className="desk-empty-sub">None yet. Create one above, or join with code <b>EX-DEMO</b>.</p>
        ) : (
          custom.map((m) => (
            <div className="desk-mine-card" key={m.id}>
              <div className="desk-mine-top">
                <CodePill code={m.id} />
                <span className="desk-mine-pool">pool {money(m.pool || 0)}</span>
              </div>
              <p className="desk-mine-q">{m.q}</p>
              <div className="desk-mine-bot">
                <DeskSpark pts={m.spark} up={m.spark[m.spark.length - 1] >= m.spark[0]} id={`p-${m.id}`} />
                <span className="desk-mine-meta">{m.cat} · closes {m.closes} · by {m.owner}</span>
                <span className="desk-trade">
                  <button className="desk-mini yes mono" onClick={() => setTicket({ m, side: 'YES' })}>Yes {m.yes}¢</button>
                  <button className="desk-mini no mono" onClick={() => setTicket({ m, side: 'NO' })}>No {100 - m.yes}¢</button>
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {ticket && <BetTicket market={ticket.m} side={ticket.side} onClose={() => setTicket(null)} />}
    </div>
  );
}

function CreatePanel() {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('Private');
  const [closes, setCloses] = useState('');
  const [yes, setYes] = useState(50);
  const [created, setCreated] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!q.trim()) return;
    const m = await createMarket({ q, cat, closes, yes });
    setCreated(m.id);
    setQ(''); setCloses(''); setYes(50);
  };

  return (
    <form className="desk-panel" onSubmit={submit}>
      <div className="desk-panel-h">Create a market</div>
      <label className="desk-field">
        <span className="desk-label">Question</span>
        <input className="desk-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Will we hit the gym 4x this week?" maxLength={120} />
      </label>
      <div className="desk-field-row">
        <label className="desk-field">
          <span className="desk-label">Category</span>
          <input className="desk-input" value={cat} onChange={(e) => setCat(e.target.value)} maxLength={16} />
        </label>
        <label className="desk-field">
          <span className="desk-label">Closes</span>
          <input className="desk-input" value={closes} onChange={(e) => setCloses(e.target.value)} placeholder="Sun" maxLength={12} />
        </label>
      </div>
      <label className="desk-field">
        <span className="desk-label">Opening Yes odds · {yes}¢</span>
        <input className="desk-range" type="range" min={5} max={95} value={yes} onChange={(e) => setYes(Number(e.target.value))} />
      </label>
      <button className="desk-btn desk-btn-red" type="submit" disabled={!q.trim()}>Generate share code</button>

      {created && (
        <div className="desk-created">
          <p className="desk-created-label">Share this code</p>
          <CodePill code={created} big />
          <p className="desk-created-sub">Anyone with this code can join and bet.</p>
        </div>
      )}
    </form>
  );
}

function JoinPanel() {
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const m = await joinByCode(code);
    if (m) setMsg({ ok: true, text: `Joined “${m.q}” — it's now in your private markets below.` });
    else setMsg({ ok: false, text: 'No market found for that code. Try EX-DEMO.' });
  };

  return (
    <form className="desk-panel" onSubmit={submit}>
      <div className="desk-panel-h">Join with a code</div>
      <p className="desk-panel-sub">Got a share code from a friend? Drop it in — then decide how much to put in and bet.</p>
      <label className="desk-field">
        <span className="desk-label">Share code</span>
        <input className="desk-input desk-code-in" value={code} onChange={(e) => { setCode(e.target.value.toUpperCase()); setMsg(null); }} placeholder="EX-XXXX" maxLength={8} />
      </label>
      <button className="desk-btn desk-btn-outline" type="submit" disabled={!code.trim()}>Join market</button>
      {msg && <p className={`desk-join-msg ${msg.ok ? 'is-yes' : 'is-no'}`}>{msg.text}</p>}
      <p className="desk-panel-hint">try <b>EX-DEMO</b> · a live sample private market</p>
    </form>
  );
}

function CodePill({ code, big }: { code: string; big?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    }).catch(() => {});
  };
  return (
    <button type="button" className={`desk-pill ${big ? 'big' : ''}`} onClick={copy} title="Copy code">
      {code}<span className="desk-pill-copy">{copied ? 'copied' : 'copy'}</span>
    </button>
  );
}
