import { Link } from 'react-router-dom';
import BrandLockup from '../components/BrandLockup';
import { useDesk, signOut, money } from './deskStore';
import { supabase } from '../lib/supabase';

export type Destination = 'Markets' | 'Positions' | 'Personal';
export const DESTINATIONS: Destination[] = ['Markets', 'Positions', 'Personal'];

export default function Rail({
  active, onChange,
}: { active: Destination; onChange: (d: Destination) => void }) {
  const { user, balance, positions, live } = useDesk();

  const doSignOut = () => {
    if (live && supabase) supabase.auth.signOut(); // listener calls exitLive()
    else signOut();
  };

  return (
    <nav className="rail" role="tablist" aria-label="Workspace">
      <Link to="/" className="brand rail-brand" aria-label="Back to E[X]"><BrandLockup /></Link>

      <div className="rail-dests">
        {DESTINATIONS.map((d) => (
          <button
            key={d}
            role="tab"
            aria-selected={active === d}
            className={`rail-dest ${active === d ? 'is-on' : ''}`}
            onClick={() => onChange(d)}
          >
            {d}
            {d === 'Positions' && positions.length > 0 && (
              <em className="rail-badge mono">{positions.length}</em>
            )}
          </button>
        ))}
      </div>

      <div className="rail-foot">
        <span className="rail-bal mono">{money(balance)}</span>
        <span className="rail-user mono">@{user?.handle}</span>
        <button className="rail-signout" onClick={doSignOut}>Sign out</button>
      </div>
    </nav>
  );
}
