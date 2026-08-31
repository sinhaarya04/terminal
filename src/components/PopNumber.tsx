import { useEffect, useRef } from 'react';

// Per-character spans make screen readers announce "dollar, nine, seven, five",
// so the digits are hidden from assistive tech and the container carries the
// real value as a label. The pop fires once on a settled value — never per
// frame — via a ref-tracked previous value, so no extra render is spent
// detecting the change.
export default function PopNumber({ text, className = '' }: { text: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(text);

  useEffect(() => {
    if (prev.current === text) return;   // first mount and no-op updates never animate
    prev.current = text;
    const el = ref.current;
    if (!el) return;
    el.classList.remove('is-animating');
    void el.offsetWidth;                 // forces layout so the animation replays
    el.classList.add('is-animating');
  }, [text]);

  return (
    <span className={className} role="img" aria-label={text}>
      <span ref={ref} className="t-digit-group" aria-hidden="true">
        {text.split('').map((ch, i) => (
          <span key={i} className="t-digit" data-stagger={i < 3 ? String(i) : undefined}>{ch}</span>
        ))}
      </span>
    </span>
  );
}
