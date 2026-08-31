import { useState, type FormEvent } from 'react';
import { useDesk, joinByCode, money, type DeskMarket } from '../deskStore';

export type PersonalSel = { kind: 'new' } | { kind: 'market'; m: DeskMarket };

export default function PersonalList({
  sel, onSelect,
}: { sel: PersonalSel | null; onSelect: (s: PersonalSel) => void }) {
  const { custom } = useDesk();
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const join = async (e: FormEvent) => {
    e.preventDefault();
    const m = await joinByCode(code);
    if (m) {
      setMsg({ ok: true, text: `Joined “${m.q}”.` });
      onSelect({ kind: 'market', m });
      setCode('');
    } else {
      setMsg({ ok: false, text: 'No market for that code. Try EX-DEMO.' });
    }
  };

  return (
    <div className="pane-body">
      <div className="kicker">Private markets</div>

      <button
        className={`li li-new ${sel?.kind === 'new' ? 'is-on' : ''}`}
        onClick={() => onSelect({ kind: 'new' })}
      >
        <span className="li-q">＋ New market</span>
      </button>

      {custom.map((m) => (
        <button
          key={m.id}
          className={`li ${sel?.kind === 'market' && sel.m.id === m.id ? 'is-on' : ''}`}
          onClick={() => onSelect({ kind: 'market', m })}
        >
          <em className="li-code mono">{m.id}</em>
          <span className="li-q">{m.q}</span>
          <span className="li-pnl mono is-yes">{money(m.pool || 0)}</span>
        </button>
      ))}

      <form className="join" onSubmit={join}>
        <label className="tk-label mono" htmlFor="join-code">Join with a code</label>
        <input
          id="join-code"
          className="tk-input mono"
          value={code}
          maxLength={8}
          placeholder="EX-XXXX"
          onChange={(e) => { setCode(e.target.value.toUpperCase()); setMsg(null); }}
        />
        <button className="btn btn-red join-go" type="submit" disabled={!code.trim()}>Join</button>
        {msg && (
          <p className={`join-msg mono ${msg.ok ? 'is-yes' : 'is-no'}`} role={msg.ok ? 'status' : 'alert'}>
            {msg.text}
          </p>
        )}
      </form>
    </div>
  );
}
