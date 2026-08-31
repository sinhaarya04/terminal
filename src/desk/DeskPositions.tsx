import { useDesk, getMarket, positionValue, money, round2 } from './deskStore';

// Your open positions with live mark-to-market P&L against current prices.
export default function DeskPositions() {
  const { positions } = useDesk();

  if (positions.length === 0) {
    return (
      <div className="desk-tab">
        <div className="desk-empty">
          <p>No positions yet.</p>
          <p className="desk-empty-sub">Head to <b>MARKETS</b> or <b>PERSONAL</b> and place a bet — it shows up here.</p>
        </div>
      </div>
    );
  }

  let totalCost = 0, totalValue = 0;
  const rows = positions.map((p, i) => {
    const m = getMarket(p.marketId);
    const value = positionValue(p, m);
    const pnl = round2(value - p.cost);
    totalCost += p.cost; totalValue += value;
    return { key: `${p.marketId}-${p.side}-${i}`, p, m, value, pnl };
  });
  const totalPnl = round2(totalValue - totalCost);

  return (
    <div className="desk-tab">
      <div className="desk-board">
        <div className="desk-row desk-prow desk-head">
          <span>Market</span><span className="r">Side</span><span className="r">Shares</span>
          <span className="r">Cost</span><span className="r">Value</span><span className="r">P&amp;L</span>
        </div>
        {rows.map(({ key, p, m, value, pnl }) => (
          <div className="desk-row desk-prow" key={key}>
            <span className="desk-q">{m?.q || p.marketId}<em className="desk-pmeta mono">{p.marketId}</em></span>
            <span className={`r mono ${p.side === 'YES' ? 'is-yes' : 'is-no'}`}>{p.side}</span>
            <span className="r mono">{p.shares.toFixed(1)}</span>
            <span className="r mono">{money(p.cost)}</span>
            <span className="r mono">{money(value)}</span>
            <span className={`r mono ${pnl >= 0 ? 'is-yes' : 'is-no'}`}>{pnl >= 0 ? '+' : ''}{money(pnl)}</span>
          </div>
        ))}
      </div>
      <div className="desk-total mono">
        <span>PORTFOLIO</span>
        <span>cost {money(totalCost)}</span>
        <span>value {money(totalValue)}</span>
        <span className={totalPnl >= 0 ? 'is-yes' : 'is-no'}>P&amp;L {totalPnl >= 0 ? '+' : ''}{money(totalPnl)}</span>
      </div>
    </div>
  );
}
