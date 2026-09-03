import { useMemo, type MouseEvent } from 'react';

/** Lightweight 3D-tilt-on-hover for market cards — the pointer position rotates
 *  the tile in perspective, the way Aceternity's 3d-card reads, but with no
 *  dependencies (no Tailwind, no framer-motion). Uses e.currentTarget so it
 *  needs no ref and one handler object serves a whole grid; honours
 *  prefers-reduced-motion (no tilt). Spread the returned handlers onto a card
 *  that carries a `transform` transition + `will-change:transform`. */
export function useTilt(max = 7) {
  return useMemo(() => {
    const reduce = typeof matchMedia !== 'undefined'
      && matchMedia('(prefers-reduced-motion: reduce)').matches;
    return {
      onMouseMove: (e: MouseEvent<HTMLElement>) => {
        if (reduce) return;
        const el = e.currentTarget;
        const r = el.getBoundingClientRect();
        const rx = (0.5 - (e.clientY - r.top) / r.height) * max;
        const ry = ((e.clientX - r.left) / r.width - 0.5) * max;
        el.style.transform =
          `perspective(760px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`;
      },
      onMouseLeave: (e: MouseEvent<HTMLElement>) => {
        e.currentTarget.style.transform = '';
      },
    };
  }, [max]);
}
