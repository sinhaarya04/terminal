import { useEffect, useState } from 'react';
import { money, useDesk } from './deskStore';
import { fetchLeaderboard, type LeaderRow } from './terminalDb';
import { useNow } from '../lib/useNow';

// Public board standings. Ranks the PUB wallet only — personal markets play in
// separate fun-money and don't count toward the leaderboard. Everyone opens at
// $1,000, so P&L is balance − 1,000. Refreshes on the shared tick.
export default function Leaderboard() {
  const { live } = useDesk();
  const now = useNow();
  const [rows, setRows] = useState<LeaderRow[] | null>(null);

  useEffect(() => { let on = true; void fetchLeaderboard().then((r) => on && setRows(r)); return () => { on = false; }; }, [now]);

  if (!live) {
    return <div className="grid-wrap"><div className="kicker">Leaderboard</div>
      <p className="pane-empty-sub" style={{ marginTop: 16 }}>The leaderboard ranks real board accounts — sign in to see it.</p></div>;
  }

  return (
    <div className="grid-wrap lb-wrap">
      <div className="grid-head">
        <div className="kicker">Leaderboard · {rows?.length ?? '…'}</div>
        <span className="lb-note mono">public board · P&L from $1,000</span>
      </div>
      <div className="lb">
        <div className="lb-row lb-head mono">
          <span>#</span><span>MEMBER</span><span>BALANCE</span><span>P&amp;L</span>
        </div>
        {(rows ?? []).map((r) => (
          <div key={r.handle} className={`lb-row ${r.isMe ? 'is-me' : ''} ${r.rank <= 3 ? 'is-top' : ''}`}>
            <span className="lb-rank mono">{r.rank}</span>
            <span className="lb-name">@{r.handle}{r.isMe && <em className="lb-you mono">you</em>}</span>
            <span className="lb-bal mono">{money(r.balance)}</span>
            <span className={`lb-pnl mono ${r.pnl > 0 ? 'is-yes' : r.pnl < 0 ? 'is-no' : 'is-flat'}`}>
              {r.pnl > 0 ? '+' : ''}{money(r.pnl)}
            </span>
          </div>
        ))}
        {rows && rows.length === 0 && <p className="pane-empty-sub" style={{ padding: '24px 0' }}>No members yet.</p>}
      </div>
    </div>
  );
}
