import { useEffect, useRef, useState } from 'react';
import { useDesk, signOut, resetDesk } from './deskStore';
import { supabase } from '../lib/supabase';

// `{open && <Menu/>}` would unmount the node instantly, leaving nothing to
// transition out. Four phases keep it mounted through the close, and the
// 'closing' cleanup matters: without it the next open starts from the
// closing scale.
type Phase = 'closed' | 'pre' | 'open' | 'closing';

const CLOSE_MS = 150;   // --duration-quick; open is 250ms — close is always snappier

export default function AccountMenu() {
  const { user, live } = useDesk();
  const [phase, setPhase] = useState<Phase>('closed');
  const wrapRef = useRef<HTMLDivElement>(null);

  const open = () => {
    setPhase('pre');
    // mount at rest, let it paint ONE frame, then open. A single rAF is not
    // enough — the style change would coalesce with the mount.
    requestAnimationFrame(() => requestAnimationFrame(() => setPhase('open')));
  };
  const close = () => {
    setPhase('closing');
    setTimeout(() => setPhase('closed'), CLOSE_MS);
  };
  const toggle = () => (phase === 'open' || phase === 'pre' ? close() : open());

  // dismiss on outside click and on Escape
  useEffect(() => {
    if (phase !== 'open') return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [phase]);

  const doSignOut = () => {
    close();
    if (live && supabase) supabase.auth.signOut();  // listener calls exitLive()
    else signOut();
  };

  const doReset = () => {
    close();
    if (confirm('Reset the demo? Clears balance, positions and replays the intro.')) resetDesk();
  };

  const mounted = phase !== 'closed';

  return (
    <div className="acct" ref={wrapRef}>
      <button
        className="acct-trigger mono"
        onClick={toggle}
        aria-expanded={phase === 'open'}
        aria-haspopup="menu"
      >
        @{user?.handle}
      </button>

      {mounted && (
        <div
          className={`acct-menu t-dropdown ${phase === 'open' ? 'is-open' : ''} ${phase === 'closing' ? 'is-closing' : ''}`}
          data-origin="bottom-left"
          role="menu"
        >
          {!live && (
            <button className="acct-item" role="menuitem" onClick={doReset}>Reset demo</button>
          )}
          <button className="acct-item is-danger" role="menuitem" onClick={doSignOut}>Sign out</button>
        </div>
      )}
    </div>
  );
}
