import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { signIn } from './deskStore';
import { supabase } from '../lib/supabase';
import { isAllowedEmail, ALLOWED_DOMAIN } from '../lib/authEmail';

// Sign-in for the desk. Real path = Northeastern magic-link (Supabase). Guest
// path = pick a handle and explore the demo locally (no account, no email).
// When Supabase isn't configured, only the guest path shows.
type Phase = 'idle' | 'sending' | 'sent';

export default function DeskSignIn() {
  const [email, setEmail] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState('');
  const [handle, setHandle] = useState('');

  const sendLink = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!isAllowedEmail(email)) { setError(`Use your @${ALLOWED_DOMAIN} email.`); return; }
    setPhase('sending');
    const { error: err } = await supabase!.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/terminal` },
    });
    if (err) { setPhase('idle'); setError(err.message); } else setPhase('sent');
  };

  return (
    <div className="desk-auth">
      <div className="about-fluid" aria-hidden="true">
        <span className="blob b1" /><span className="blob b2" /><span className="blob b3" />
      </div>

      <Link to="/" className="desk-auth-back" aria-label="Back to E[X]">← E[X]</Link>

      <div className="desk-card">
        <div className="desk-lockup">E<span className="desk-brack">[</span>X<span className="desk-brack">]</span></div>
        <div className="desk-kicker">The Terminal</div>

        {phase === 'sent' ? (
          <>
            <h1 className="desk-h1">Check your inbox.</h1>
            <p className="desk-sub">We sent a sign-in link to {email.trim()}. Open it on this device and you'll land back here, signed in.</p>
            <button className="desk-btn desk-btn-outline" type="button" onClick={() => setPhase('idle')}>Use a different email</button>
          </>
        ) : (
          <>
            <h1 className="desk-h1">Step onto the desk.</h1>
            <p className="desk-sub">Sign in with your Northeastern email for a real account, or explore as a guest with $1,000 in play credits.</p>

            {supabase && (
              <>
                <form className="desk-field" onSubmit={sendLink}>
                  <span className="desk-label">Northeastern email</span>
                  <input className="desk-input" type="email" value={email}
                    onChange={(e) => { setEmail(e.target.value); setError(''); }}
                    placeholder={`you@${ALLOWED_DOMAIN}`} autoComplete="email" />
                  <button className="desk-btn desk-btn-red" type="submit" disabled={phase === 'sending'}>
                    {phase === 'sending' ? 'Sending…' : 'Email me a sign-in link'}
                  </button>
                </form>
                {error && <p className="desk-join-msg is-no">{error}</p>}
                <div className="desk-or"><span>or</span></div>
              </>
            )}

            <form className="desk-field" onSubmit={(e) => { e.preventDefault(); signIn(handle); }}>
              <span className="desk-label">Guest handle</span>
              <input className="desk-input" value={handle} onChange={(e) => setHandle(e.target.value)}
                placeholder="oracle_23" maxLength={20} />
              <button className="desk-btn desk-btn-outline" type="submit">Explore as guest</button>
            </form>
          </>
        )}

        <p className="desk-fine">A live demo. All markets settle in play money.</p>
      </div>
    </div>
  );
}
