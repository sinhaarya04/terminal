import MarketDetail from './MarketDetail';
import TradeTicket from './TradeTicket';
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
  return (
    <div className="mscreen">
      <button className="mscreen-back mono" onClick={onBack}>← All markets</button>
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
        </div>
      </div>
    </div>
  );
}
