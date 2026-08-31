import type { ReactNode } from 'react';
import { useInView } from '../lib/useInView';
import { useReducedMotion } from '../lib/useReducedMotion';

export default function Reveal({
  children, className = '', id,
}: { children: ReactNode; className?: string; id?: string }) {
  const reduced = useReducedMotion();
  const { ref, inView } = useInView<HTMLDivElement>(0.12);
  const on = reduced || inView;   // reduced motion ⇒ render revealed immediately
  return (
    <div ref={ref} id={id} className={`reveal ${on ? 'in' : ''} ${className}`}>
      {children}
    </div>
  );
}
