import type { ReactElement, SVGProps } from 'react';

// The desk's icon set: 16px, 1.6 stroke, round joins — one weight everywhere,
// so a nav glyph and a table control read as the same family. Inline SVG so
// they take currentColor and need no font or icon package.
export type IconName =
  | 'markets' | 'positions' | 'personal' | 'leaderboard'
  | 'chevron-left' | 'chevron-right' | 'chevron-up' | 'chevron-down'
  | 'arrow-left' | 'plus' | 'grid' | 'list' | 'search' | 'wallet'
  | 'check' | 'close' | 'copy' | 'signal' | 'user' | 'clock' | 'flag';

const PATHS: Record<IconName, ReactElement> = {
  markets: <><path d="M2.5 12.5 6 8l3 2.5L13.5 4" /><path d="M10 4h3.5v3.5" /></>,
  positions: <><rect x="2" y="4.5" width="12" height="9" rx="1.5" /><path d="M5.5 4.5V3.5A1.5 1.5 0 0 1 7 2h2a1.5 1.5 0 0 1 1.5 1.5v1" /><path d="M2 8.5h12" /></>,
  personal: <><circle cx="8" cy="5.5" r="2.75" /><path d="M2.75 13.75c.6-2.6 2.6-4 5.25-4s4.65 1.4 5.25 4" /></>,
  leaderboard: <><rect x="6" y="2.5" width="4" height="11" rx=".8" /><rect x="1.5" y="7" width="4" height="6.5" rx=".8" /><rect x="10.5" y="5" width="4" height="8.5" rx=".8" /></>,
  'chevron-left': <path d="m9.5 3.5-4 4.5 4 4.5" />,
  'chevron-right': <path d="m6.5 3.5 4 4.5-4 4.5" />,
  'chevron-up': <path d="m3.5 10 4.5-4 4.5 4" />,
  'chevron-down': <path d="m3.5 6 4.5 4 4.5-4" />,
  'arrow-left': <><path d="M13 8H3" /><path d="m7 3.5-4.5 4.5L7 12.5" /></>,
  plus: <><path d="M8 3v10" /><path d="M3 8h10" /></>,
  grid: <><rect x="2" y="2" width="5" height="5" rx="1" /><rect x="9" y="2" width="5" height="5" rx="1" /><rect x="2" y="9" width="5" height="5" rx="1" /><rect x="9" y="9" width="5" height="5" rx="1" /></>,
  list: <><path d="M2.5 4h11" /><path d="M2.5 8h11" /><path d="M2.5 12h11" /></>,
  search: <><circle cx="7" cy="7" r="4.25" /><path d="m10.5 10.5 3 3" /></>,
  wallet: <><rect x="2" y="4" width="12" height="9" rx="1.5" /><path d="M2 6.5h12" /><path d="M10.5 10h1.5" /></>,
  check: <path d="m3 8.5 3.2 3L13 5" />,
  close: <><path d="m4 4 8 8" /><path d="m12 4-8 8" /></>,
  copy: <><rect x="5.5" y="5.5" width="8" height="8" rx="1.2" /><path d="M10.5 5.5V4a1.5 1.5 0 0 0-1.5-1.5H4A1.5 1.5 0 0 0 2.5 4v5A1.5 1.5 0 0 0 4 10.5h1.5" /></>,
  signal: <><path d="M2.5 13.5v-4" /><path d="M6.2 13.5V7" /><path d="M9.8 13.5V4.5" /><path d="M13.5 13.5V2.5" /></>,
  user: <><circle cx="8" cy="5.5" r="2.75" /><path d="M2.75 13.75c.6-2.6 2.6-4 5.25-4s4.65 1.4 5.25 4" /></>,
  clock: <><circle cx="8" cy="8" r="5.5" /><path d="M8 5v3.2l2 1.3" /></>,
  flag: <><path d="M3.5 14V2.5" /><path d="M3.5 3h8l-2 2.75 2 2.75h-8" /></>,
};

export default function Icon({ name, size = 16, ...rest }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}
