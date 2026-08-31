import { useState } from 'react';
import TradeTicket from '../markets/TradeTicket';
import { useDesk, marketPhase, type DeskMarket, type Side } from '../deskStore';
import { useNow } from '../../lib/useNow';

export default function PersonalAction({
  created, market, onDone,
}: { created: DeskMarket | null; market: DeskMarket | null; onDone: () => void }) {
  const [side, setSide] = useState<Side>('YES');
  const [copied, setCopied] = useState(false);
  // `market` is the row that was clicked — a snapshot. Settling (or anyone's
  // bet) mutates the store, not that object, so the live record is re-read here
  // or a settled market would still be offered a buy ticket.
  const { custom } = useDesk();
  const now = useNow();
  const live = market ? custom.find((m) => m.id === market.id) ?? market : null;
  const phase = live ? marketPhase(live, now) : null;

  if (created) {
    const copy = () => {
      navigator.clipboard?.writeText(created.id).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1400);
      }).catch(() => { /* clipboard blocked — the code is still on screen */ });
    };
    return (
      <div className="pane-body">
        <div className="kicker">Share this code</div>
        <button type="button" className="code-pill" onClick={copy} title="Copy code">
          {created.id}<span className="code-pill-hint">{copied ? 'copied' : 'copy'}</span>
        </button>
        <p className="pane-empty-sub">Anyone with this code can join and bet.</p>
      </div>
    );
  }

  if (phase === 'settled' && live) {
    return (
      <div className="pane-body pane-empty">
        <p className="mono">Market settled {live.resolved}</p>
        <p className="pane-empty-sub">
          This one is closed — winning shares have already paid out. Check Positions for what it returned.
        </p>
      </div>
    );
  }

  if (phase === 'closed' && live) {
    return (
      <div className="pane-body pane-empty">
        <p className="mono">Betting closed</p>
        <p className="pane-empty-sub">
          This market reached its close time. It pays out once @{live.owner} settles the result.
        </p>
      </div>
    );
  }

  return (
    <TradeTicket
      market={live} side={side} onSide={setSide} onDone={onDone}
      emptyHint="Pick a market on the left to bet on it."
    />
  );
}
