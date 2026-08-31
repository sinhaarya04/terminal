import { useId } from 'react';
import { Liquid } from 'liquid-gooey';

// A range input whose fill and thumb are one liquid body: the thumb trails the
// filled track as gooey rubber, so dragging the odds reads as pouring rather
// than stepping. liquid-gooey ships no slider component — `effect="move"` is
// the primitive its README points at for exactly this ("Sliders, tab
// indicators, dragged things"), so the visual is assembled here.
//
// Accessibility: the real <input type="range"> is still the control. It sits on
// top at zero opacity and owns focus, keyboard, and screen-reader semantics;
// everything liquid below it is decoration and marked aria-hidden. Nothing here
// changes the value — the input does, and React repaints the visuals from it.
export default function LiquidRange({
  value, min = 0, max = 100, onChange, label, className = '',
}: {
  value: number;
  min?: number;
  max?: number;
  onChange: (n: number) => void;
  label: string;
  className?: string;
}) {
  const id = useId();
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;

  return (
    <div className={`lq-range ${className}`}>
      {/* unfilled groove — outside the liquid so it keeps its own flat colour */}
      <span className="lq-groove" aria-hidden="true" />

      <Liquid
        className="lq-liquid"
        blur={7}
        contrast={22}
        fill="var(--red-bright)"
        filterPadding={28}
        aria-hidden="true"
      >
        {/* the filled portion: plain merge, it only changes width */}
        <Liquid.Item observe>
          <span className="lq-fill" style={{ width: `calc(${pct}% - 5px)` }} />
        </Liquid.Item>

        {/* the thumb: liquid-rubber chase with a droplet tail. Positioned with
            `left` rather than a transform so the effect's own transform is the
            only one on the element. */}
        <Liquid.Item
          effect="move"
          move={{ springiness: 0.62, wobble: 0.45, stretch: 0.4, trail: 0.55 }}
        >
          <span className="lq-thumb" style={{ left: `calc(${pct}% - 8px)` }} />
        </Liquid.Item>
      </Liquid>

      <input
        id={id}
        className="lq-input"
        type="range"
        min={min}
        max={max}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}
