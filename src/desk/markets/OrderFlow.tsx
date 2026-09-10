import { useDesk, marketActivity, money, type Activity } from '../deskStore';
import { useNow } from '../../lib/useNow';

// Order flow for one binary market: how much money sits on each side, and the
// latest orders as they land. Reads the market's feed, which every bet and
// sell writes to (this browser's own instantly; everyone else's on the 30s
// poll in live mode). Buys add to a side, sells take away from it.
const age = (at: number, now: number) => {
  const mins = Math.max(0, Math.round((now - at) / 60_000));
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  return hrs < 24 ? `${hrs}h` : `${Math.round(hrs / 24)}d`;
};

export default function OrderFlow({ code }: { code: string }) {
  useDesk();              // subscribe: the feed lives in the store
  const now = useNow();
  const orders = marketActivity(code).filter((a): a is Activity & { dollars: number } =>
    (a.kind === 'bet' || a.kind === 'sell') && a.dollars != null && a.side != null);

  const flow = orders.reduce((acc, a) => {
    const sign = a.kind === 'sell' ? -1 : 1;
    if (a.side === 'YES') acc.yes += sign * a.dollars; else acc.no += sign * a.dollars;
    return acc;
  }, { yes: 0, no: 0 });
  const total = Math.max(0, flow.yes) + Math.max(0, flow.no);
  const yesPct = total > 0 ? Math.round((Math.max(0, flow.yes) / total) * 100) : 50;

  return (
    <section className="of" aria-label="Order flow">
      <div className="of-head">
        <div className="kicker">Order flow</div>
        <span className="of-live"><span className="t-shimmer" data-text="Live">Live</span></span>
      </div>

      <div className="of-split" role="img" aria-label={`${money(Math.max(0, flow.yes))} on Yes, ${money(Math.max(0, flow.no))} on No`}>
        <div className="of-split-row">
          <span className="of-side is-yes">Yes <b className="mono">{money(Math.max(0, flow.yes))}</b></span>
          <span className="of-side is-no"><b className="mono">{money(Math.max(0, flow.no))}</b> No</span>
        </div>
        <div className="of-bar">
          <i className="is-yes" style={{ width: `${yesPct}%` }} />
          <i className="is-no" style={{ width: `${100 - yesPct}%` }} />
        </div>
        <div className="of-split-row of-pct mono">
          <span>{yesPct}%</span><span>{100 - yesPct}%</span>
        </div>
      </div>

      {orders.length === 0 ? (
        <p className="of-empty">No orders yet. The first one shows up here the moment it lands.</p>
      ) : (
        <ul className="of-list">
          {orders.slice(0, 14).map((a) => (
            <li key={a.id} className={`of-row ${a.kind === 'sell' ? 'is-sell' : ''}`}>
              <span className={`side-chip ${a.side === 'YES' ? 'is-yes' : 'is-no'}`}>{a.side === 'YES' ? 'Yes' : 'No'}</span>
              <span className="of-who mono">@{a.handle}</span>
              <span className="of-kind">{a.kind === 'sell' ? 'sold' : 'bought'}</span>
              <span className={`of-amt mono ${a.kind === 'sell' ? 'is-flat' : a.side === 'YES' ? 'is-yes' : 'is-no'}`}>
                {a.kind === 'sell' ? '\u2212' : '+'}{money(a.dollars)}
              </span>
              <span className="of-when mono">{age(a.at, now)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
