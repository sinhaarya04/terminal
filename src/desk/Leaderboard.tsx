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
    return (
      <div className="grid-wrap">
        <div className="kicker">Leaderboard</div>
        <div className="pane-empty">
          <p className="pane-empty-title">Standings need a live account</p>
          <p className="pane-empty-sub">The leaderboard ranks real board accounts. Sign in with your Northeastern email to see it.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid-wrap lb-wrap">
      <div className="grid-head">
        <div className="kicker">Leaderboard<span className="title-count">{rows?.length ?? '…'}</span></div>
        <span className="lb-note">Public board · ranked by balance · P&amp;L from $1,000</span>
      </div>
      <div className="lb">
        <div className="lb-row lb-head">
          <span>#</span><span>Member</span><span className="lb-r">Balance</span>
          <span className="lb-r">P&amp;L</span><span className="lb-r" title="Brier score: mean squared error of the prices you took vs what actually happened. 0 is perfect, lower is sharper — calibration, not luck.">Brier</span>
          <span className="lb-r">Bets</span>
        </div>
        {(rows ?? []).map((r) => (
          <div key={r.handle} className={`lb-row ${r.isMe ? 'is-me' : ''} ${r.rank <= 3 ? 'is-top' : ''}`}>
            <span className="lb-rank mono">{r.rank}</span>
            <span className="lb-name">@{r.handle}{r.isMe && <em className="lb-you">you</em>}</span>
            <span className="lb-bal mono lb-r">{money(r.balance)}</span>
            <span className={`lb-pnl mono lb-r ${r.pnl > 0 ? 'is-yes' : r.pnl < 0 ? 'is-no' : 'is-flat'}`}>
              {r.pnl > 0 ? '+' : ''}{money(r.pnl)}
            </span>
            <span className={`lb-brier mono lb-r ${r.brier == null ? 'is-flat' : r.brier <= 0.25 ? 'is-yes' : r.brier >= 0.5 ? 'is-no' : ''}`}>
              {r.brier == null ? '—' : r.brier.toFixed(3)}
            </span>
            <span className="lb-n mono lb-r">{r.nSettled || '—'}</span>
          </div>
        ))}
        {rows && rows.length === 0 && <p className="pane-empty-sub" style={{ padding: '24px 0' }}>No members yet.</p>}
      </div>
      <p className="lb-explain">
        <b>Brier</b> scores how well-judged your bets were: the squared gap between the price you paid
        and what actually happened, averaged over your settled bets. <b>0</b> is perfect, and lower is
        sharper — it rewards being right, not just lucky. Dash means no settled bets yet.
      </p>
    </div>
  );
}
