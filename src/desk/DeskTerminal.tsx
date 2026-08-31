import { useEffect, useState } from 'react';
import Rail, { type Destination } from './Rail';
import Workspace, { type PaneKey } from './Workspace';
import MarketsList from './markets/MarketsList';
import MarketDetail from './markets/MarketDetail';
import TradeTicket from './markets/TradeTicket';
import { ensureMarket, type DeskMarket, type Side } from './deskStore';
import { EVENTS, outcomeToMarket, type MarketEvent, type Outcome } from './marketsData';
import PositionsList, { type PositionRow } from './positions/PositionsList';
import PositionDetail from './positions/PositionDetail';
import CloseTicket from './positions/CloseTicket';
import PersonalList, { type PersonalSel } from './personal/PersonalList';
import PersonalDetail from './personal/PersonalDetail';
import PersonalAction from './personal/PersonalAction';

// The desk opens on the leading market with its front-runner staged in the
// ticket, so no pane starts empty. Staging is not placing — the order still
// needs an explicit Buy.
const leadOutcome = (e: MarketEvent): Outcome =>
  [...e.outcomes].sort((a, b) => b.yes - a.yes)[0];

const stageFor = (e: MarketEvent) => ({ m: outcomeToMarket(e, leadOutcome(e)), side: 'YES' as Side });

export default function DeskTerminal() {
  const [dest, setDest] = useState<Destination>('Markets');
  const [railOpen, setRailOpen] = useState(true);
  const [focus, setFocus] = useState<PaneKey>('list');
  const [ev, setEv] = useState<MarketEvent | null>(EVENTS[0] ?? null);
  const [order, setOrder] = useState<{ m: DeskMarket; side: Side } | null>(
    () => (EVENTS[0] ? stageFor(EVENTS[0]) : null),
  );
  const [posRow, setPosRow] = useState<PositionRow | null>(null);
  const [pSel, setPSel] = useState<PersonalSel | null>(null);
  const [created, setCreated] = useState<DeskMarket | null>(null);

  // register the staged market once on mount — pickOutcome does this for every
  // later selection, but the opening one never goes through it
  useEffect(() => { if (EVENTS[0]) ensureMarket(stageFor(EVENTS[0]).m); }, []);

  const pickOutcome = (o: Outcome, side: Side) => {
    if (!ev) return;
    const m = outcomeToMarket(ev, o);
    ensureMarket(m);
    setOrder({ m, side });
    setFocus('action');
  };

  const selectEvent = (next: MarketEvent) => {
    setEv(next);
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
        {dest === 'Positions' && (
          <Workspace
            focus={focus}
            onFocus={setFocus}
            list={<PositionsList selectedKey={posRow?.key ?? null}
              onSelect={(r) => { setPosRow(r); setFocus('detail'); }} />}
            detail={<PositionDetail row={posRow} />}
            action={<CloseTicket row={posRow} onDone={() => { setPosRow(null); setFocus('list'); }} />}
          />
        )}
        {dest === 'Personal' && (
          <Workspace
            focus={focus}
            onFocus={setFocus}
            list={<PersonalList sel={pSel}
              onSelect={(s) => { setPSel(s); setCreated(null); setFocus('detail'); }} />}
            detail={<PersonalDetail sel={pSel}
              onCreated={(m) => { setCreated(m); setPSel({ kind: 'market', m }); setFocus('action'); }} />}
            action={<PersonalAction created={created}
              market={pSel?.kind === 'market' ? pSel.m : null}
              onDone={() => { setCreated(null); setFocus('detail'); }} />}
          />
        )}
      </main>
    </div>
  );
}
