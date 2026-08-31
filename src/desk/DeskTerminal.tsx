import { useState } from 'react';
import { Link } from 'react-router-dom';
import BrandLockup from '../components/BrandLockup';
import { useDesk, signOut, resetDesk, money } from './deskStore';
import { supabase } from '../lib/supabase';
import DeskMarkets from './DeskMarkets';
import DeskPositions from './DeskPositions';
import DeskPersonal from './DeskPersonal';

type Tab = 'Markets' | 'Positions' | 'Personal';
const TABS: Tab[] = ['Markets', 'Positions', 'Personal'];

export default function DeskTerminal() {
  const { user, balance, positions, live } = useDesk();
  const [tab, setTab] = useState<Tab>('Markets');

  const doSignOut = () => {
    if (live && supabase) supabase.auth.signOut(); // listener calls exitLive()
    else signOut();
  };

  return (
    <div className="desk-term">
      <div className="about-fluid" aria-hidden="true">
        <span className="blob b1" /><span className="blob b2" /><span className="blob b3" />
      </div>

      <header className="desk-top">
        <Link to="/" className="brand desk-brand" aria-label="Back to E[X]">
          <BrandLockup />
          <span className="desk-brand-tag">Terminal</span>
        </Link>
        <div className="desk-top-right">
          <span className="desk-bal mono">{money(balance)}</span>
          <span className="desk-user">@{user?.handle}</span>
          <button className="desk-signout" onClick={doSignOut}>Sign out</button>
        </div>
      </header>

      <p className="desk-greet">
        Welcome back, <b>{user?.handle}</b>. You have {positions.length} open position{positions.length === 1 ? '' : 's'}.
      </p>

      <nav className="desk-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            className={`desk-tabbtn ${tab === t ? 'active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t}
            {t === 'Positions' && positions.length > 0 && <em className="desk-badge">{positions.length}</em>}
          </button>
        ))}
        {!live && (
          <button className="desk-reset" onClick={() => { if (confirm('Reset the demo? Clears balance, positions and replays the intro.')) resetDesk(); }}>
            reset demo
          </button>
        )}
      </nav>

      <main className="desk-content">
        {tab === 'Markets' && <DeskMarkets />}
        {tab === 'Positions' && <DeskPositions />}
        {tab === 'Personal' && <DeskPersonal />}
      </main>
    </div>
  );
}
