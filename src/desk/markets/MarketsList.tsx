import { CATEGORIES, EVENTS, type Category, type MarketEvent } from '../marketsData';

export default function MarketsList({
  selectedId, onSelect,
}: { selectedId: string | null; onSelect: (ev: MarketEvent) => void }) {
  const groups: { cat: Category; items: MarketEvent[] }[] = CATEGORIES
    .map((cat) => ({ cat, items: EVENTS.filter((e) => e.cat === cat) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="pane-body">
      <div className="kicker">Markets</div>
      {groups.map(({ cat, items }) => (
        <section className="grp" key={cat} data-open="true">
          <h3 className="grp-h mono">{cat}<span className="grp-n">{items.length}</span></h3>
          <div className="grp-items">
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
        </section>
      ))}
    </div>
  );
}
