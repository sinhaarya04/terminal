// Small inline sparkline shared by the desk market rows. Same visual language
// as the marketing MarketBoard (green up / red down, soft area fill).
export default function DeskSpark({ pts, up, id }: { pts: number[]; up: boolean; id: string }) {
  const w = 84, h = 26;
  const min = Math.min(...pts), max = Math.max(...pts);
  const span = max - min || 1;
  const xy = (p: number, i: number) =>
    `${((i / (pts.length - 1)) * w).toFixed(1)},${(h - 3 - ((p - min) / span) * (h - 7)).toFixed(1)}`;
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${xy(p, i)}`).join(' ');
  const area = `${line} L${w},${h} L0,${h} Z`;
  const color = up ? '#34d399' : '#f87171';
  const gid = `dsg-${id}`;
  return (
    <svg className={`desk-spark${up ? ' up' : ' down'}`} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path className="desk-area" d={area} fill={`url(#${gid})`} />
      <path className="desk-line" d={line} style={{ stroke: color }} />
    </svg>
  );
}
