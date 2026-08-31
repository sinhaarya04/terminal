import { useEffect, useState } from 'react';
import { useDesk, markIntroSeen, hydrateLive, exitLive } from '../desk/deskStore';
import { supabase } from '../lib/supabase';
import SignInSkeleton from '../desk/SignInSkeleton';
import DeskIntro from '../desk/DeskIntro';
import DeskTerminal from '../desk/DeskTerminal';
import { usePageTitle } from '../lib/usePageTitle';

// Immersive, self-contained terminal. Three states:
//   signed out            → sign-in card (magic-link or guest)
//   signed in, no intro   → intro video (once ever), then terminal
//   signed in, seen intro → straight to the terminal
// Live (real account) hydrates from Supabase; guest mode stays in localStorage.
export default function Desk() {
  usePageTitle('Terminal');
  const desk = useDesk();
  const [introDone, setIntroDone] = useState(false);
  const [checking, setChecking] = useState(!!supabase);

  // Watch the Supabase session and enter/leave live mode accordingly.
  useEffect(() => {
    if (!supabase) return;
    let done = false;
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session) await hydrateLive(data.session.user.id);
      if (!done) setChecking(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange(async (_e, session) => {
      if (session) await hydrateLive(session.user.id);
      else exitLive();
      setChecking(false);
    });
    return () => { done = true; sub.subscription.unsubscribe(); };
  }, []);

  // Avoid a signed-out flash while the first Supabase session check runs: the
  // skeleton holds the card's shape, then cross-fades to the real form.
  if (checking || !desk.user) {
    return <div className="desk-root"><SignInSkeleton ready={!checking} /></div>;
  }

  if (!desk.seenIntro && !introDone) {
    return (
      <div className="desk-root">
        <DeskIntro onDone={() => { void markIntroSeen(); setIntroDone(true); }} />
      </div>
    );
  }

  return <div className="desk-root"><DeskTerminal /></div>;
}
