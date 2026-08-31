import { Link } from 'react-router-dom';
import BrandLockup from '../components/BrandLockup';
import PopNumber from '../components/PopNumber';
import AccountMenu from './AccountMenu';
import { useDesk, money } from './deskStore';

export type Destination = 'Markets' | 'Positions' | 'Personal';
export const DESTINATIONS: Destination[] = ['Markets', 'Positions', 'Personal'];

export default function Rail({
  active, onChange,
}: { active: Destination; onChange: (d: Destination) => void }) {
  const { balance, positions } = useDesk();


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
        <PopNumber text={money(balance)} className="rail-bal mono" />
        <AccountMenu />
      </div>
    </nav>
  );
}
