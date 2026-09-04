import { useEffect } from 'react';
import MarketDetail from './MarketDetail';
import TradeTicket from './TradeTicket';
import BoardAdmin from './BoardAdmin';
import Icon from '../../components/Icon';
import { refreshLiveMarket } from '../deskStore';
import { useNow } from '../../lib/useNow';
import type { MarketEvent, Outcome } from '../marketsData';
import type { DeskMarket, Side } from '../deskStore';

// The expanded market: chart and outcomes on the left, ticket docked right.
// Mounted fresh each time a card is opened, so the entrance animation in
// panes.css replays on every open without needing a reflow nudge.
export default function MarketScreen({
  ev, order, onPick, onSide, onDone, onBack,
}: {
  ev: MarketEvent;
  order: { m: DeskMarket; side: Side } | null;
  onPick: (o: Outcome, side: Side) => void;
  onSide: (s: Side) => void;
  onDone: () => void;
  onBack: () => void;
}) {
  // live mode: other people's board trades reprice this screen on the shared
  // 30s tick, same as the personal detail pane
  const now = useNow();
  const stagedId = order?.m.id;
  useEffect(() => { if (stagedId) void refreshLiveMarket(stagedId); }, [stagedId, now]);
  return (
    <div className="mscreen">
      <div className="mscreen-bar">
        <button className="mscreen-back" onClick={onBack}><Icon name="arrow-left" size={14} />All markets</button>
        <span className="mscreen-crumb"><Icon name="chevron-right" size={12} /><b>{ev.title}</b></span>
      </div>
      <div className="mscreen-body">
        <div className="mscreen-main">
          <MarketDetail ev={ev} onPick={onPick} />
        </div>
        <div className="mscreen-ticket">
          <TradeTicket
            market={order?.m ?? null}
            side={order?.side ?? 'YES'}
            onSide={onSide}
            onDone={onDone}
          />
          {order && <BoardAdmin code={order.m.id} />}
        </div>
      </div>
    </div>
  );
}
