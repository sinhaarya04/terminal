// The stroke-draw geometry (stroke-dasharray/offset = 30, measured for this
// exact path in a 0 0 48 48 viewBox) is owned by styles/motion/success.css.
// Do not re-declare it here — two sources for the dash length is how a check
// ends up pre-revealed or over-drawn.
export default function SuccessCheck({ label }: { label: string }) {
  return (
    <div className="t-success-check success-check" data-state="in" role="status" aria-label={label}>
      <svg viewBox="0 0 48 48" width="44" height="44" aria-hidden="true">
        <path d="M14 25 L21 32 L34 17" />
      </svg>
    </div>
  );
}
