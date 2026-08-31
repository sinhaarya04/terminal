import { useState } from 'react';
import { CATEGORIES, EVENTS, type Category, type MarketEvent } from '../marketsData';

export default function MarketsList({
  selectedId, onSelect,
}: { selectedId: string | null; onSelect: (ev: MarketEvent) => void }) {
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const isOpen = (cat: string) => !closed[cat];

  const groups: { cat: Category; items: MarketEvent[] }[] = CATEGORIES
    .map((cat) => ({ cat, items: EVENTS.filter((e) => e.cat === cat) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="pane-body">
      <div className="kicker">Markets</div>
      {groups.map(({ cat, items }) => {
        const open = isOpen(cat);
        return (
          <section className="grp t-acc" key={cat} data-open={open}>
            <h3 className="grp-hh">
              <button
                type="button"
                className="grp-h mono"
                aria-expanded={open}
                aria-controls={`grp-${cat}`}
                // read the toggle out of the updater, never the enclosing
                // closure, so rapid clicks can't act on a stale snapshot
                onClick={() => setClosed((c) => ({ ...c, [cat]: !c[cat] }))}
              >
                {cat}<span className="grp-n">{items.length}</span>
              </button>
            </h3>
            <div className="t-acc-panel" id={`grp-${cat}`} inert={!open}>
              <div className="t-acc-panel-inner grp-items">
                {items.map((ev) => (
                  <button
                    key={ev.id}
                    className={`li ${selectedId === ev.id ? 'is-on' : ''}`}
                    onClick={() => onSelect(ev)}
                  >
                    <em className="li-code mono">{ev.id}{ev.live && <i className="li-live" />}</em>
                    <span className="li-q">{ev.title}</span>
                  </button>
                ))}
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}
