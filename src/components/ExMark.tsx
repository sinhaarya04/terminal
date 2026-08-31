// The real E[X] wordmark, inlined from the brand kit's SVG
// ("E[X] Black Transparent Logo SVG.svg") so CSS can recolour it: the letters
// take `currentColor` for the dark ground, the brackets keep the brand red.
// viewBox is tightened from the source's 8192-square — the artwork only
// occupies the middle band vertically, and the original leaves the mark tiny
// inside its box.
export default function ExMark({ className = '' }: { className?: string }) {
  return (
    <svg
      className={`ex-mark ${className}`}
      viewBox="60 1950 7780 4300"
      role="img"
      aria-label="E[X]"
      xmlns="http://www.w3.org/2000/svg"
      style={{ shapeRendering: 'geometricPrecision', fillRule: 'nonzero' }}
    >
      <g className="ex-mark-letters" fill="currentColor">
        <path transform="translate(116.358,5584.768) scale(4.511418,-4.511418)" d="M65.00 0.00V11.00L144.00 50.00V610.00L65.00 649.00V660.00H537.00V492.00H520.00L466.00 613.00H222.00V353.43H397.00L437.00 399.07H454.00V283.02H437.00L397.00 327.57H222.00V47.00H494.00L548.00 178.00H565.00V0.00Z" />
        <path transform="translate(4472.799,5144.428) scale(3.177055,-3.177055)" d="M33.00 0.00V16.00L107.00 54.00L319.00 325.00L111.00 609.00L47.00 644.00V660.00H316.00V644.00L236.00 606.00V601.00L391.00 396.00L553.00 602.00V606.00L476.00 644.00V660.00H692.00V644.00L628.00 608.00L425.00 350.00L646.00 55.00L717.00 16.00V0.00H443.00V16.00L516.00 52.00V56.00L352.00 279.00L181.00 57.00V53.00L261.00 16.00V0.00Z" />
      </g>
      <g className="ex-mark-brackets" fill="var(--red)">
        <path transform="translate(3545.988,1999.144) scale(1.347594)" d="M 0.00,148.13 L 148.13,0.00 L 684.64,0.00 L 510.37,174.27 L 174.27,174.27 L 174.27,2937.73 L 510.37,2937.73 L 684.64,3112.00 L 148.13,3112.00 L 0.00,2963.87 Z" />
        <path transform="translate(6859.783,1999.144) scale(1.347594)" d="M 684.64,148.13 L 536.51,0.00 L 0.00,0.00 L 174.27,174.27 L 510.37,174.27 L 510.37,2937.73 L 174.27,2937.73 L 0.00,3112.00 L 536.51,3112.00 L 684.64,2963.87 Z" />
      </g>
    </svg>
  );
}
