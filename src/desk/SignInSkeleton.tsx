import DeskSignIn from './DeskSignIn';

// Cross-fade for the one genuine loading state the desk has: the first Supabase
// session check in Desk.tsx. Both layers live in the same `.t-skel` wrapper and
// the swap is driven by `is-revealed`, per styles/motion/skeleton.css — a
// skeleton that just unmounts would be theatre, not a reveal.
export default function SignInSkeleton({ ready }: { ready: boolean }) {
  return (
    <div className={`desk-auth skel-auth t-skel ${ready ? 'is-revealed' : ''}`}>
      <div className="t-skel-skeleton" aria-hidden="true">
        <div className="skel-card">
          <div className="skel-bar skel-lockup" />
          <div className="skel-bar skel-kicker" />
          <div className="skel-bar skel-h1" />
          <div className="skel-bar skel-sub" />
          <div className="skel-bar skel-sub short" />
          <div className="skel-bar skel-field" />
          <div className="skel-bar skel-btn" />
        </div>
      </div>
      <div className="t-skel-content">
        <DeskSignIn />
      </div>
    </div>
  );
}
