import { useDesk, getMarket, positionValue, money, round2, type Position } from '../deskStore';

export type PositionRow = { key: string; p: Position; value: number; pnl: number };

export function buildRows(positions: Position[]): PositionRow[] {
  return positions.map((p, i) => {
    const m = getMarket(p.marketId);
    const value = positionValue(p, m);
    return { key: `${p.marketId}-${p.side}-${i}`, p, value, pnl: round2(value - p.cost) };
  });
}

export default function PositionsList({
  selectedKey, onSelect,
}: { selectedKey: string | null; onSelect: (r: PositionRow) => void }) {
  const { positions } = useDesk();
  const rows = buildRows(positions);

  if (rows.length === 0) {
    return (
      <div className="pane-body pane-empty">
        <p className="mono">No positions yet</p>
        <p className="pane-empty-sub">Place a bet from Markets or Personal and it shows up here.</p>
      </div>
    );
  }

  return (
    <div className="pane-body">
      <div className="kicker">
        Portfolio · {rows.filter((r) => !r.p.settled).length} open
        {rows.some((r) => r.p.settled) && ` · ${rows.filter((r) => r.p.settled).length} settled`}
      </div>
      {rows.map((r) => {
        const m = getMarket(r.p.marketId);
        return (
          <button
            key={r.key}
            className={`li ${selectedKey === r.key ? 'is-on' : ''}`}
            onClick={() => onSelect(r)}
          >
            <em className="li-code mono">
              {r.p.marketId} · {r.p.outcomeIdx != null
                ? <span className="is-yes">{getMarket(r.p.marketId)?.outcomes?.find((o) => o.idx === r.p.outcomeIdx)?.name ?? `#${r.p.outcomeIdx}`}</span>
                : <span className={r.p.side === 'YES' ? 'is-yes' : 'is-no'}>{r.p.side}</span>}
              {r.p.settled && <b className="li-settled is-flat">closed</b>}
            </em>
            <span className={`li-q ${r.p.settled ? 'is-dim' : ''}`}>{m?.q || r.p.marketId}</span>
            <span className={`li-pnl mono ${r.pnl >= 0 ? 'is-yes' : 'is-no'}`}>
              {r.pnl >= 0 ? '+' : ''}{money(r.pnl)}
              {r.p.settled && <em className="li-final mono">final</em>}
            </span>
          </button>
        );
      })}
    </div>
  );
}
