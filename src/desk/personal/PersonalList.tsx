import { useState, type FormEvent } from 'react';
import { useDesk, joinByCode, money, marketPhase, type DeskMarket } from '../deskStore';
import { useNow } from '../../lib/useNow';

export type PersonalSel = { kind: 'new' } | { kind: 'market'; m: DeskMarket };

export default function PersonalList({
  sel, onSelect,
}: { sel: PersonalSel | null; onSelect: (s: PersonalSel) => void }) {
  const { custom } = useDesk();
  const now = useNow();
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
      setMsg({ ok: false, text: 'No market for that code.' });
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
          <em className="li-code mono">
            {m.id}
            {m.resolved ? (
              <b className={`li-settled ${m.resolved === 'YES' ? 'is-yes' : 'is-no'}`}>
                settled {m.resolved}
              </b>
            ) : marketPhase(m, now) === 'closed' && (
              <b className="li-settled is-flat">closed</b>
            )}
          </em>
          <span className="li-q">{m.q}</span>
          {/* an empty pool is not a gain — only colour it once there's money in */}
          <span className={`li-pnl mono ${(m.pool || 0) > 0 ? 'is-yes' : 'is-flat'}`}>{money(m.pool || 0)}</span>
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
