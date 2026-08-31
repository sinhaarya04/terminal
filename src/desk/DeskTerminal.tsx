import { useState } from 'react';
import Rail, { type Destination } from './Rail';
import Workspace, { type PaneKey } from './Workspace';
import MarketsList from './markets/MarketsList';
import MarketDetail from './markets/MarketDetail';
import TradeTicket from './markets/TradeTicket';
import { ensureMarket, type DeskMarket, type Side } from './deskStore';
import { outcomeToMarket, type MarketEvent, type Outcome } from './marketsData';
import DeskPositions from './DeskPositions';
import DeskPersonal from './DeskPersonal';

export default function DeskTerminal() {
  const [dest, setDest] = useState<Destination>('Markets');
  const [focus, setFocus] = useState<PaneKey>('list');
  const [ev, setEv] = useState<MarketEvent | null>(null);
  const [order, setOrder] = useState<{ m: DeskMarket; side: Side } | null>(null);

  const pickOutcome = (o: Outcome, side: Side) => {
    if (!ev) return;
    const m = outcomeToMarket(ev, o);
    ensureMarket(m);
    setOrder({ m, side });
    setFocus('action');
  };

  const selectEvent = (next: MarketEvent) => {
    setEv(next);
    setOrder(null);
    setFocus('detail');
  };

  return (
    <div className="desk-term">
      <Rail active={dest} onChange={(d) => { setDest(d); setFocus('list'); }} />

      <main className="desk-main">
        {dest === 'Markets' && (
          <Workspace
            focus={focus}
            onFocus={setFocus}
            list={<MarketsList selectedId={ev?.id ?? null} onSelect={selectEvent} />}
            detail={<MarketDetail ev={ev} onPick={pickOutcome} />}
            action={
              <TradeTicket
                market={order?.m ?? null}
                side={order?.side ?? 'YES'}
                onSide={(s) => setOrder((o) => (o ? { ...o, side: s } : o))}
                onDone={() => { setOrder(null); setFocus('detail'); }}
              />
            }
          />
        )}
        {dest === 'Positions' && <DeskPositions />}
        {dest === 'Personal' && <DeskPersonal />}
      </main>
    </div>
  );
}
