// Close-time arithmetic and formatting, shared by the store (which seeds and
// validates timestamps) and the picker (which offers and displays them).
// Neither owns it: putting it in the store would drag date formatting into
// state management, and putting it in the component would make the store
// import from the UI.

/** 11:59pm local, `offset` days from `from`. Every close preset lands on
 *  end-of-day, which is what "closes Friday" means to everyone but a clock. */
export function endOfDay(offset = 0, from: Date = new Date()): number {
  const d = new Date(from);
  d.setDate(d.getDate() + offset);
  d.setHours(23, 59, 0, 0);
  return d.getTime();
}

/** Midnight local — for comparing days without the time getting involved. */
export const startOfDay = (d: Date): number =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** Days until the coming Sunday. Today being Sunday gives the Sunday a week
 *  out: "this weekend" should never resolve to a time that has already gone. */
export function daysToSunday(from: Date = new Date()): number {
  const dow = from.getDay();          // 0 = Sunday
  return dow === 0 ? 7 : 7 - dow;
}

/** "Fri, Sep 4 · 11:59pm" */
export function formatClose(ms: number): string {
  const d = new Date(ms);
  const day = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    .replace(' ', '')
    .toLowerCase();
  return `${day} · ${time}`;
}

/** "in 3h" / "in 2d" / "closed 5m ago" — the live half of the close label. */
export function relativeClose(ms: number, now: number = Date.now()): string {
  const diff = ms - now;
  const past = diff < 0;
  const mins = Math.round(Math.abs(diff) / 60_000);
  let body: string;
  if (mins < 1) body = 'less than a minute';
  else if (mins < 60) body = `${mins}m`;
  else if (mins < 1440) body = `${Math.round(mins / 60)}h`;
  else body = `${Math.round(mins / 1440)}d`;
  return past ? `closed ${body} ago` : `in ${body}`;
}
