import { useState } from 'react';
import Rail, { type Destination } from './Rail';
import Workspace, { type PaneKey } from './Workspace';
import MarketsGrid from './markets/MarketsGrid';
import MarketScreen from './markets/MarketScreen';
import BoardMultiScreen from './markets/BoardMultiScreen';
import { ensureMarket, getMarket, type DeskMarket, type Side } from './deskStore';
import { outcomeToMarket, useBoardEvents, type MarketEvent, type Outcome } from './marketsData';
import PositionsList, { type PositionRow } from './positions/PositionsList';
import TradeHistoryPanel from './positions/TradeHistoryPanel';
import PositionDetail from './positions/PositionDetail';
import CloseTicket from './positions/CloseTicket';
import PersonalGrid from './personal/PersonalGrid';
import PersonalDetail, { type PersonalSel } from './personal/PersonalDetail';
import PersonalAction from './personal/PersonalAction';

// Opening a market stages its front-runner in the ticket, so the ticket is never
// blank on arrival. Staging is not placing — the order still needs an explicit Buy.
const leadOutcome = (e: MarketEvent): Outcome =>
  [...e.outcomes].sort((a, b) => b.yes - a.yes)[0];

const stageFor = (e: MarketEvent) => ({ m: outcomeToMarket(e, leadOutcome(e)), side: 'YES' as Side });

export default function DeskTerminal() {
  const [dest, setDest] = useState<Destination>('Markets');
  const [railOpen, setRailOpen] = useState(true);
  const [focus, setFocus] = useState<PaneKey>('list');
  // the id, not a snapshot: the open screen must re-render with live prices
  // after every trade, and a captured event object never would
  const [evId, setEvId] = useState<string | null>(null);
  const events = useBoardEvents();
  const ev = evId != null ? events.find((e) => e.id === evId) ?? null : null;
  const [order, setOrder] = useState<{ m: DeskMarket; side: Side } | null>(null);
  const [posRow, setPosRow] = useState<PositionRow | null>(null);
  const [pSel, setPSel] = useState<PersonalSel | null>(null);
  const [created, setCreated] = useState<DeskMarket | null>(null);

  const pickOutcome = (o: Outcome, side: Side) => {
    if (!ev) return;
    const m = outcomeToMarket(ev, o);   // ev is live-overlaid, so this prices from the store
    ensureMarket(m);
    setOrder({ m, side });
    setFocus('action');
  };

  const selectEvent = (next: MarketEvent) => {
    setEvId(next.id);
    setFocus('detail');
    // stage the new market's front-runner too, so the ticket never blanks out
    const staged = stageFor(next);
    ensureMarket(staged.m);
    setOrder(staged);
    setFocus('detail');
  };

  return (
    <div className={`desk-term ${railOpen ? '' : 'rail-hidden'}`}>
      <Rail
        active={dest}
        open={railOpen}
        onToggle={() => setRailOpen((o) => !o)}
        onChange={(d) => { setDest(d); setFocus('list'); }}
      />
      {/* pull-tab: the only way back once the rail is hidden, so it must stay
          reachable — it is outside the inert rail on purpose */}
      <button
        className="rail-tab mono"
        onClick={() => setRailOpen(true)}
        aria-label="Show navigation"
        aria-expanded={railOpen}
        aria-controls="desk-rail"
        {...(railOpen ? { inert: true } : {})}
      >
        ›
      </button>

      <main className="desk-main">
        {dest === 'Markets' && (
          ev
            ? (getMarket(ev.id)?.isMulti
              ? <BoardMultiScreen code={ev.id} onBack={() => { setEvId(null); setOrder(null); }} />
              : <MarketScreen
                ev={ev}
                order={order}
                onPick={pickOutcome}
                onSide={(sd) => setOrder((o) => (o ? { ...o, side: sd } : o))}
                onDone={() => setOrder(null)}
                onBack={() => { setEvId(null); setOrder(null); }}
              />)
            : <MarketsGrid events={events} onOpen={selectEvent} />
        )}
        {dest === 'Positions' && (
          <div className="pos-shell">
            <Workspace
              focus={focus}
              onFocus={setFocus}
              list={<PositionsList selectedKey={posRow?.key ?? null}
                onSelect={(r) => { setPosRow(r); setFocus('detail'); }} />}
              detail={<PositionDetail row={posRow} />}
              action={<CloseTicket row={posRow} onDone={() => { setPosRow(null); setFocus('list'); }} />}
            />
            {/* the ledger runs landscape under the workspace — a whole row per
                trade, not the sidebar's one-word truncations */}
            <TradeHistoryPanel />
          </div>
        )}
        {dest === 'Personal' && (
          pSel
            ? <div className="mscreen">
                <button className="mscreen-back mono"
                  onClick={() => { setPSel(null); setCreated(null); }}>← My markets</button>
                <div className="mscreen-body">
                  <div className="mscreen-main">
                    <PersonalDetail sel={pSel}
                      onCreated={(m) => { setCreated(m); setPSel({ kind: 'market', m }); }} />
                  </div>
                  <div className="mscreen-ticket">
                    <PersonalAction created={created}
                      market={pSel.kind === 'market' ? pSel.m : null}
                      onDone={() => setCreated(null)} />
                  </div>
                </div>
              </div>
            : <PersonalGrid
                onOpen={(m) => { setPSel({ kind: 'market', m }); setCreated(null); }}
                onNew={() => { setPSel({ kind: 'new' }); setCreated(null); }} />
        )}
      </main>
    </div>
  );
}
