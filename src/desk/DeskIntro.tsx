import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '../lib/useReducedMotion';

// First-sign-in-only intro. Plays /intro.mp4 fullscreen, then calls onDone.
// Falls back to a stylised placeholder when the video can't or shouldn't play.

const VIDEO_SRC = '/intro.mp4';
const FALLBACK_MS = 4200;

type Conn = { saveData?: boolean; effectiveType?: string };

// intro.mp4 is 5.5MB. On a metered or slow connection that is a bad trade for a
// decorative intro, so skip straight to the fallback and never start the
// download. navigator.connection is Chromium-only; absent elsewhere, we play.
function shouldSkipVideo(): boolean {
  const c = (navigator as Navigator & { connection?: Conn }).connection;
  if (!c) return false;
  if (c.saveData) return true;
  return ['slow-2g', '2g', '3g'].includes(c.effectiveType ?? '');
}

export default function DeskIntro({ onDone }: { onDone: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const reduced = useReducedMotion();
  const [failed, setFailed] = useState(shouldSkipVideo);
  const done = useRef(false);

  const finish = () => {
    if (done.current) return;
    done.current = true;
    onDone();
  };

  // Under reduced motion the intro is pure decoration with nothing to convey —
  // hand straight back rather than playing a shortened version of it.
  useEffect(() => {
    if (reduced) finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);

  // Try to play; if the file is missing, undecodable, or autoplay is refused,
  // fall back. Mobile browsers reject autoplay outright unless the element is
  // muted, which is why `muted` is set below rather than left off.
  useEffect(() => {
    if (failed || reduced) return;
    const v = videoRef.current;
    if (!v) return;
    const p = v.play?.();
    if (p && typeof p.catch === 'function') {
      p.catch((e: DOMException) => {
        // AbortError means the play was interrupted by a re-render or a pause —
        // StrictMode's double-invoked effect produces one every mount in dev.
        // It is not an autoplay refusal, and treating it as one sent every
        // visitor to the fallback while the video sat there working fine.
        if (e?.name !== 'AbortError') setFailed(true);
      });
    }
  }, [failed, reduced]);

  // Fallback auto-advance timer.
  useEffect(() => {
    if (!failed || reduced) return;
    const t = setTimeout(finish, FALLBACK_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [failed, reduced]);

  if (reduced) return null;

  return (
    <div className="desk-intro">
      {!failed && (
        <video
          ref={videoRef}
          className="desk-intro-video"
          src={VIDEO_SRC}
          autoPlay
          playsInline
          muted
          preload="auto"
          onEnded={finish}
          onError={() => setFailed(true)}
        />
      )}

      {failed && (
        <div className="desk-intro-fallback" role="img" aria-label="E[X] intro">
          <div className="desk-intro-rings" aria-hidden="true">
            <span /><span /><span />
          </div>
          <div className="desk-intro-lockup mono">
            E<span className="desk-brack">[</span>X<span className="desk-brack">]</span>
          </div>
          <div className="desk-intro-tag mono">NORTHEASTERN&nbsp;·&nbsp;PREDICTION&nbsp;MARKETS</div>
          <div className="desk-intro-load mono">
            booting terminal<span className="desk-dots"><i>.</i><i>.</i><i>.</i></span>
          </div>
        </div>
      )}

      <button className="desk-skip mono" type="button" onClick={finish}>
        SKIP&nbsp;INTRO&nbsp;&rarr;
      </button>
    </div>
  );
}
