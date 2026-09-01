import { useDesk, getMarket, money, round2, type Trade } from '../deskStore';
import { useNow } from '../../lib/useNow';
import { relativeClose } from '../../lib/closeTime';

// Full-width history strip under the Positions workspace. The sidebar version
// truncated questions to a word — here each trade gets a whole row, plus the
// balance curve those trades imply. No new tables behind this: the ledger and
// the markets' resolved_at timestamps already determine the whole line, so the
// chart is reconstructed client-side at render time.

type Ev = { at: number; pub: number; pri: number };

/** Walk the ledger backwards from the current balances to place every point. */
function balanceSeries(
  trades: Trade[],
  settles: { at: number; amount: number }[],
  nowPub: number, nowPri: number,
): Ev[] {
  type Delta = { at: number; pub: number; pri: number };
  const deltas: Delta[] = [
    ...trades.map((t) => ({
      at: t.at,
      pub: t.wallet === 'board' ? (t.kind === 'buy' ? -t.dollars : t.dollars) : 0,
      pri: t.wallet === 'sim' ? (t.kind === 'buy' ? -t.dollars : t.dollars) : 0,
    })),
    ...settles.map((s) => ({ at: s.at, pub: 0, pri: s.amount })),
  ].sort((a, b) => a.at - b.at);
  if (deltas.length === 0) return [];

  const sumPub = deltas.reduce((a, d) => a + d.pub, 0);
  const sumPri = deltas.reduce((a, d) => a + d.pri, 0);
  let pub = round2(nowPub - sumPub);
  let pri = round2(nowPri - sumPri);
  const pts: Ev[] = [{ at: deltas[0].at - 1, pub, pri }];
  for (const d of deltas) {
    pub = round2(pub + d.pub);
    pri = round2(pri + d.pri);
    pts.push({ at: d.at, pub, pri });
  }
  pts.push({ at: Date.now(), pub, pri });
  return pts;
}

function Curve({ pts }: { pts: Ev[] }) {
  if (pts.length < 3) return null;
  const W = 560, H = 72, PAD = 4;
  const t0 = pts[0].at, t1 = pts[pts.length - 1].at || t0 + 1;
  const vals = pts.flatMap((p) => [p.pub, p.pri]);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const x = (t: number) => PAD + ((t - t0) / Math.max(1, t1 - t0)) * (W - 2 * PAD);
  const y = (v: number) => hi === lo ? H / 2 : PAD + (1 - (v - lo) / (hi - lo)) * (H - 2 * PAD);
  // step lines: a balance holds until the next event, it doesn't glide
  const path = (key: 'pub' | 'pri') =>
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.at).toFixed(1)},${y(pts[Math.max(0, i - 1)][key]).toFixed(1)} L${x(p.at).toFixed(1)},${y(p[key]).toFixed(1)}`).join(' ');
  return (
    <svg className="thp-curve" viewBox={`0 0 ${W} ${H}`} role="img"
      aria-label={`Balance history. Public from ${money(pts[0].pub)} to ${money(pts[pts.length - 1].pub)}; private from ${money(pts[0].pri)} to ${money(pts[pts.length - 1].pri)}.`}>
      <path d={path('pub')} fill="none" stroke="var(--green)" strokeWidth="1.5" />
      <path d={path('pri')} fill="none" stroke="#b9a7e8" strokeWidth="1.5" />
    </svg>
  );
}

export default function TradeHistoryPanel() {
  const { trades, positions, balance, pmBalance } = useDesk();
  const now = useNow();
  if (trades.length === 0) return null;

  // settlement credits, placed at the market's resolved_at
  const settles = positions
    .filter((p) => p.settled && p.settled.payout > 0)
    .map((p) => ({
      at: getMarket(p.marketId)?.resolvedAt,
      amount: p.settled!.payout,
    }))
    .filter((s): s is { at: number; amount: number } => s.at != null && Number.isFinite(s.at));

  const pts = balanceSeries(trades, settles, balance, pmBalance);

  return (
    <section className="thp" aria-label="Trade history">
      <div className="thp-head">
        <div className="kicker">Trade history · {trades.length}</div>
        <div className="thp-legend mono">
          <span className="thp-key"><i className="thp-dot is-pub" />PUB</span>
          <span className="thp-key"><i className="thp-dot is-pri" />PRI</span>
        </div>
      </div>
      <div className="thp-body">
        <div className="thp-chart">
          <Curve pts={pts} />
        </div>
        <div className="thp-table" role="table">
          <div className="thp-row thp-cols mono" role="row">
            <span>KIND</span><span>MARKET</span><span>SIDE</span><span>SHARES</span><span>PRICE</span><span>AMOUNT</span><span>WALLET</span><span>WHEN</span>
          </div>
          {trades.slice(0, 60).map((t) => (
            <div key={t.id} className="thp-row" role="row">
              <span className={`mono thp-kind ${t.kind === 'sell' ? 'is-yes' : ''}`}>{t.kind}</span>
              <span className="thp-q" title={t.q}>{t.q}</span>
              <span className={`mono ${t.side === 'YES' ? 'is-yes' : 'is-no'}`}>{t.side}</span>
              <span className="mono">{t.shares.toFixed(1)}</span>
              <span className="mono">{t.shares > 0 ? `${Math.round((t.dollars / t.shares) * 100)}¢` : '—'}</span>
              <span className="mono">{t.kind === 'sell' ? '+' : '−'}{money(t.dollars)}</span>
              <span className={`mono thp-wallet ${t.wallet === 'sim' ? 'is-pri' : ''}`}>{t.wallet === 'sim' ? 'pri' : 'pub'}</span>
              <span className="mono thp-when">{relativeClose(t.at, now).replace('closed ', '').replace('in ', '').replace('less than a minute ago', 'now')}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
