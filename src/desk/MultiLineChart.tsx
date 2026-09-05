import type { Outcome } from './marketsData';
import type { Tick } from './deskStore';

// Multi-line probability chart for the featured market. One coloured line per
// outcome: the seeded history first, then the live tick tail with a marker at
// every order that repriced the market. Marker size follows the order size.
const TIME_LABELS = ['12:00', '15:00', '18:00', '21:00', '00:00', '03:00', '06:00', '09:00'];

type Pt = { v: number; tick?: Tick };
const series = (o: Outcome): Pt[] => [
  ...o.path.map((v) => ({ v })),
  ...(o.ticks ?? []).map((t) => ({ v: t.yes, tick: t })),
];

const markerR = (t: Tick) => (t.dollars ? 2.6 + Math.min(4.4, Math.sqrt(t.dollars) / 3.2) : 2.6);

export default function MultiLineChart({ outcomes }: { outcomes: Outcome[] }) {
  const w = 560, h = 300, padL = 8, padR = 46, padT = 14, padB = 26;
  const iw = w - padL - padR, ih = h - padT - padB;

  const lines = outcomes.map((o) => ({ o, pts: series(o) })).filter((l) => l.pts.length > 1);
  const all = lines.flatMap((l) => l.pts.map((p) => p.v));
  const min = Math.max(0, Math.min(...all) - 6);
  const max = Math.min(100, Math.max(...all) + 6);
  const span = max - min || 1;
  const liveN = lines.reduce((n, l) => n + (l.o.ticks?.length ?? 0), 0);

  // A screen reader gets nothing from the polylines, so the label carries the
  // reading: who is in the market, where each sits now, and which way it moved.
  const summary = lines.map(({ o, pts }) => {
    const delta = o.yes - pts[0].v;
    const dir = delta > 0.5 ? 'up' : delta < -0.5 ? 'down' : 'flat';
    return `${o.name} ${o.yes}%, ${dir}`;
  }).join('; ');

  // With live ticks present the seeded history takes the left part of the
  // width and the ticks share the right, so a handful of orders are readable
  // instead of being crushed into the last few pixels of a long seed.
  const seedN = Math.max(...lines.map((l) => l.o.path.length), 0);
  const tickN = Math.max(...lines.map((l) => l.o.ticks?.length ?? 0), 0);
  const split = liveN && seedN > 1 ? 0.66 : 0;
  const seamX = padL + split * iw;
  const x = (i: number, n: number) => {
    if (!split) return padL + (i / Math.max(1, n - 1)) * iw;
    if (i < seedN) return padL + (i / Math.max(1, seedN - 1)) * split * iw;
    return seamX + ((i - seedN + 1) / Math.max(1, tickN)) * (1 - split) * iw;
  };
  const y = (v: number) => padT + (1 - (v - min) / span) * ih;

  const grid = [0, 0.25, 0.5, 0.75, 1].map((t) => {
    const val = max - t * span;
    return { yy: padT + t * ih, label: (val / 100).toFixed(2) };
  });

  return (
    <svg
      className="mchart"
      viewBox={`0 0 ${w} ${h}`}
      role="img"
      aria-label={`Outcome probability over time. ${summary}.${liveN ? ` ${liveN} live orders.` : ''}`}
    >
      {grid.map((g, i) => (
        <g key={i}>
          <line x1={padL} y1={g.yy} x2={padL + iw} y2={g.yy} className="mchart-grid" />
          <text x={w - padR + 8} y={g.yy + 3.5} className="mchart-ylabel">{g.label}</text>
        </g>
      ))}

      {split > 0 && (
        <g className="mchart-seam">
          <line x1={seamX} x2={seamX} y1={padT} y2={padT + ih} />
          <text x={seamX + 5} y={padT + 9} className="mchart-seam-label">live orders</text>
        </g>
      )}

      {lines.map(({ o, pts }) => {
        const n = pts.length;
        const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i, n).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
        const lastX = x(n - 1, n), lastY = y(pts[n - 1].v);
        return (
          <g key={o.name}>
            <path d={d} fill="none" stroke={o.color} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
            {pts.map((p, i) => p.tick?.dollars != null && (
              <circle key={i} cx={x(i, n)} cy={y(p.v)} r={markerR(p.tick)}
                fill={p.tick.side === 'NO' ? 'var(--down)' : o.color}
                stroke="var(--bg)" strokeWidth={1.5} className="mchart-order">
                <title>{`${p.tick.kind === 'sell' ? 'Sold' : 'Bought'} ${p.tick.side ?? ''} $${p.tick.dollars} at ${p.v}%`}</title>
              </circle>
            ))}
            <circle cx={lastX} cy={lastY} r={3.2} fill={o.color} className="mchart-now" />
          </g>
        );
      })}

      {TIME_LABELS.map((t, i) => {
        // the seeded clock labels span the seed's width; "now" sits at the end
        const lx = padL + (i / (TIME_LABELS.length - 1)) * (split ? split * iw : iw);
        return (
          <text key={t} x={lx} y={h - 6} className="mchart-xlabel">{t}</text>
        );
      })}
      {split > 0 && <text x={padL + iw} y={h - 6} className="mchart-xlabel">now</text>}
    </svg>
  );
}
