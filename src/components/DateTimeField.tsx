import { useEffect, useId, useRef, useState } from 'react';
import { endOfDay, startOfDay, daysToSunday, formatClose } from '../lib/closeTime';

// A date + time picker built in-house rather than <input type="datetime-local">,
// for the same reason the odds slider stopped being a native range: the OS
// picker paints its own light chrome and ignores the theme entirely.
//
// Controlled and presentational — it takes a timestamp and reports a new one.
// It knows nothing about markets.

const DAY_MS = 86_400_000;
const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

type Preset = { label: string; at: () => number };

const PRESETS: Preset[] = [
  { label: 'Tonight', at: () => endOfDay(0) },
  { label: 'Tomorrow', at: () => endOfDay(1) },
  { label: 'Weekend', at: () => endOfDay(daysToSunday()) },
  { label: 'Next week', at: () => endOfDay(7) },
];

export default function DateTimeField({
  value, onChange, label,
}: {
  value: number | null;
  onChange: (ms: number) => void;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => new Date(value ?? Date.now()));
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const id = useId();

  // Close on click-outside and on Escape. Escape also returns focus to the
  // trigger, or the keyboard user is stranded at the top of the document.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); triggerRef.current?.focus(); }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const selected = value != null ? new Date(value) : null;
  const todayStart = startOfDay(new Date());

  // Keep the chosen time when a new day is picked, so setting the day doesn't
  // silently reset a time the user already dialled in.
  const pickDay = (day: Date) => {
    const base = selected ?? new Date(endOfDay(0));
    const next = new Date(day);
    next.setHours(base.getHours(), base.getMinutes(), 0, 0);
    onChange(next.getTime());
  };

  const setTime = (hours: number, minutes: number) => {
    const next = new Date(selected ?? endOfDay(0));
    next.setHours(hours, minutes, 0, 0);
    onChange(next.getTime());
  };

  // Grid starts on the Monday on or before the 1st, so weeks line up under the
  // M-T-W header regardless of which day the month begins on.
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const lead = (first.getDay() + 6) % 7;
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - lead);

  const hours24 = selected?.getHours() ?? 23;
  const hour12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  const isPm = hours24 >= 12;
  const minutes = selected?.getMinutes() ?? 59;

  return (
    <div className="dt" ref={wrapRef}>
      <button
        type="button"
        ref={triggerRef}
        className="dt-trigger tk-input"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((o) => !o)}
      >
        <span className={value == null ? 'dt-placeholder' : ''}>
          {value == null ? 'Pick a close time' : formatClose(value)}
        </span>
        <span className="dt-caret" aria-hidden="true">▾</span>
      </button>

      {open && (
        <div className="dt-pop" role="dialog" aria-label={label} aria-modal="false">
          <div className="dt-presets">
            {PRESETS.map((p) => {
              const at = p.at();
              const stale = at <= Date.now();   // "Tonight" during the last minute of the day
              return (
                <button
                  key={p.label}
                  type="button"
                  className={`dt-preset mono ${value === at ? 'is-on' : ''}`}
                  disabled={stale}
                  onClick={() => { onChange(at); setMonth(new Date(at)); }}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          <div className="dt-cal">
            <div className="dt-cal-head">
              <button type="button" className="dt-nav" aria-label="Previous month"
                onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>‹</button>
              <span className="dt-month mono">{MONTHS[month.getMonth()]} {month.getFullYear()}</span>
              <button type="button" className="dt-nav" aria-label="Next month"
                onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>›</button>
            </div>

            <div className="dt-dow mono" aria-hidden="true">
              {WEEKDAYS.map((d, i) => <span key={i}>{d}</span>)}
            </div>

            <div className="dt-grid" role="grid" aria-labelledby={id}>
              {Array.from({ length: 42 }, (_, i) => {
                const day = new Date(gridStart.getTime() + i * DAY_MS);
                const dayStart = startOfDay(day);
                const outside = day.getMonth() !== month.getMonth();
                const past = dayStart < todayStart;
                const isSel = selected != null && dayStart === startOfDay(selected);
                const isToday = dayStart === todayStart;
                return (
                  <button
                    key={i}
                    type="button"
                    role="gridcell"
                    aria-selected={isSel}
                    tabIndex={past ? -1 : 0}
                    disabled={past}
                    className={`dt-day ${outside ? 'is-out' : ''} ${isSel ? 'is-on' : ''} ${isToday ? 'is-today' : ''}`}
                    onClick={() => pickDay(day)}
                  >
                    {day.getDate()}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="dt-time">
            <span className="tk-label mono" id={id}>Time</span>
            <div className="dt-time-row">
              <input
                className="tk-input mono dt-num" type="number" min={1} max={12} value={hour12}
                aria-label="Hour"
                onChange={(e) => {
                  const h12 = Math.min(12, Math.max(1, Number(e.target.value) || 12));
                  setTime((h12 % 12) + (isPm ? 12 : 0), minutes);
                }}
              />
              <span className="dt-colon mono">:</span>
              <input
                className="tk-input mono dt-num" type="number" min={0} max={59}
                value={String(minutes).padStart(2, '0')}
                aria-label="Minute"
                onChange={(e) => {
                  const m = Math.min(59, Math.max(0, Number(e.target.value) || 0));
                  setTime(hours24, m);
                }}
              />
              <div className="dt-ampm" role="group" aria-label="AM or PM">
                <button type="button" className={`dt-mer mono ${!isPm ? 'is-on' : ''}`}
                  onClick={() => setTime(hours24 % 12, minutes)}>AM</button>
                <button type="button" className={`dt-mer mono ${isPm ? 'is-on' : ''}`}
                  onClick={() => setTime((hours24 % 12) + 12, minutes)}>PM</button>
              </div>
            </div>
          </div>

          <button type="button" className="btn btn-red dt-done" onClick={() => { setOpen(false); triggerRef.current?.focus(); }}>
            Done
          </button>
        </div>
      )}
    </div>
  );
}
