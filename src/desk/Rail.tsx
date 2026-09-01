import { Link } from 'react-router-dom';
import BrandLockup from '../components/BrandLockup';
import PopNumber from '../components/PopNumber';
import AccountMenu from './AccountMenu';
import { useDesk, money } from './deskStore';

export type Destination = 'Markets' | 'Positions' | 'Personal' | 'Leaderboard';
export const DESTINATIONS: Destination[] = ['Markets', 'Positions', 'Personal', 'Leaderboard'];

export default function Rail({
  active, onChange, open, onToggle,
}: {
  active: Destination;
  onChange: (d: Destination) => void;
  open: boolean;
  onToggle: () => void;
}) {
  const { balance, pmBalance, positions } = useDesk();


  return (
    <nav id="desk-rail" className="rail" role="tablist" aria-label="Workspace" {...(open ? {} : { inert: true })}>
      <div className="rail-fluid about-fluid" aria-hidden="true">
        <span className="blob b1" /><span className="blob b2" /><span className="blob b3" />
      </div>
      <div className="rail-head">
        <Link to="/" className="brand rail-brand" aria-label="Back to E[X]"><BrandLockup /></Link>
        <button className="rail-collapse mono" onClick={onToggle}
          aria-label="Hide navigation" aria-expanded={open} aria-controls="desk-rail">‹</button>
      </div>

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
        {/* two wallets, deliberately labeled apart: the board plays in real
            platform credits, personal markets in their own sim money — the
            two never feed each other */}
        <div className="rail-wallets">
          <span className="rail-wallet">
            <em className="mono">PUB</em>
            <PopNumber text={money(balance)} className="rail-bal mono" />
          </span>
          <span className="rail-wallet">
            <em className="mono">PRI</em>
            <PopNumber text={money(pmBalance)} className="rail-bal rail-bal-pri mono" />
          </span>
        </div>
        <AccountMenu />
      </div>
    </nav>
  );
}
