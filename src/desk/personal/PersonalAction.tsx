import { useState } from 'react';
import TradeTicket from '../markets/TradeTicket';
import type { DeskMarket, Side } from '../deskStore';

export default function PersonalAction({
  created, market, onDone,
}: { created: DeskMarket | null; market: DeskMarket | null; onDone: () => void }) {
  const [side, setSide] = useState<Side>('YES');
  const [copied, setCopied] = useState(false);

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

  return <TradeTicket market={market} side={side} onSide={setSide} onDone={onDone} />;
}
