import { useEffect, useRef, useState } from 'react';

// First-sign-in-only intro. Plays /intro.mp4 fullscreen, then calls onDone.
// Until the real file is dropped into public/intro.mp4 it can't load, so we
// show a stylised animated placeholder that auto-advances — the flow works now
// and "just works" once the video exists.

const VIDEO_SRC = '/intro.mp4';
const FALLBACK_MS = 4200;

export default function DeskIntro({ onDone }: { onDone: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  const done = useRef(false);

  const finish = () => {
    if (done.current) return;
    done.current = true;
    onDone();
  };

  // Try to play; if the file is missing/undecodable, fall back.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const p = v.play?.();
    if (p && typeof p.catch === 'function') p.catch(() => setFailed(true));
  }, []);

  // Fallback auto-advance timer.
  useEffect(() => {
    if (!failed) return;
    const t = setTimeout(finish, FALLBACK_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [failed]);

  return (
    <div className="desk-intro">
      {!failed && (
        <video
          ref={videoRef}
          className="desk-intro-video"
          src={VIDEO_SRC}
          autoPlay
          playsInline
          muted={false}
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
        SKIP&nbsp;INTRO&nbsp;→
      </button>
    </div>
  );
}
