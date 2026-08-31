import type { Outcome } from './marketsData';

// Multi-line probability chart for the featured market. One coloured line per
// outcome, auto-scaled, with a soft grid, endpoint dots, %-axis and time axis.
const TIME_LABELS = ['12:00', '15:00', '18:00', '21:00', '00:00', '03:00', '06:00', '09:00'];

export default function MultiLineChart({ outcomes }: { outcomes: Outcome[] }) {
  const w = 560, h = 300, padL = 8, padR = 46, padT = 14, padB = 26;
  const iw = w - padL - padR, ih = h - padT - padB;

  const all = outcomes.flatMap((o) => o.path);
  const min = Math.max(0, Math.min(...all) - 6);
  const max = Math.min(100, Math.max(...all) + 6);
  const span = max - min || 1;

  const x = (i: number, n: number) => padL + (i / (n - 1)) * iw;
  const y = (v: number) => padT + (1 - (v - min) / span) * ih;

  // 4 horizontal gridlines + right-side probability labels (as 0.xx like the ref)
  const grid = [0, 0.25, 0.5, 0.75, 1].map((t) => {
    const val = max - t * span;
    return { yy: padT + t * ih, label: (val / 100).toFixed(2) };
  });

  return (
    <svg className="mchart" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Outcome probability over time">
      {grid.map((g, i) => (
        <g key={i}>
          <line x1={padL} y1={g.yy} x2={padL + iw} y2={g.yy} className="mchart-grid" />
          <text x={w - padR + 8} y={g.yy + 3.5} className="mchart-ylabel">{g.label}</text>
        </g>
      ))}

      {outcomes.map((o) => {
        const n = o.path.length;
        const d = o.path.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i, n).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
        const lastX = x(n - 1, n), lastY = y(o.path[n - 1]);
        return (
          <g key={o.name}>
            <path d={d} fill="none" stroke={o.color} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
            <circle cx={lastX} cy={lastY} r={3.2} fill={o.color} />
          </g>
        );
      })}

      {TIME_LABELS.map((t, i) => (
        <text key={t} x={padL + (i / (TIME_LABELS.length - 1)) * iw} y={h - 6} className="mchart-xlabel">{t}</text>
      ))}
    </svg>
  );
}
