import { useEffect, useRef, useState, type FormEvent } from 'react';
import ExMark from '../components/ExMark';
import BrandLockup from '../components/BrandLockup';
import { supabase } from '../lib/supabase';
import { isAllowedEmail, ALLOWED_DOMAIN } from '../lib/authEmail';

// Sign-in for the desk: Northeastern email + a 6-digit code (Supabase).
// There is no guest mode — every desk is a real account, so every market,
// bet and share code is the same one everyone else sees.
//
// A code, not a magic link: Northeastern is on Microsoft 365, and Defender
// Safe Links fetches every URL in an inbound mail to scan it. A Supabase
// confirmation URL is single-use, so the scanner burns it before the human
// clicks and the click lands on "Token has expired or is invalid". A 6-digit
// OTP is never a URL, so there is nothing for a scanner to consume. This is
// Supabase's own recommended workaround; it only works if the email templates
// carry {{ .Token }} and no {{ .ConfirmationURL }} — see docs/supabase-auth.md.
type Phase = 'idle' | 'sending' | 'sent' | 'verifying';

// Supabase rate-limits a fresh code to one per 60s; match it so the resend
// button can't fire a request that's guaranteed to bounce.
const RESEND_SECONDS = 60;

export default function DeskSignIn() {
  const [email, setEmail] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [code, setCode] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  // Focus the code field as soon as the second step paints, so the code can be
  // pasted straight from the mail app without a click.
  useEffect(() => { if (phase === 'sent') codeRef.current?.focus(); }, [phase]);

  const sendCode = async (resend = false) => {
    setError(''); setNote('');
    if (!isAllowedEmail(email)) { setError(`Use your @${ALLOWED_DOMAIN} email.`); return; }
    if (!resend) setPhase('sending');
    // No emailRedirectTo: nothing in the mail is clickable, so there is no
    // redirect to authorise.
    const { error: err } = await supabase!.auth.signInWithOtp({ email: email.trim() });
    if (err) { if (!resend) setPhase('idle'); setError(err.message); return; }
    setCooldown(RESEND_SECONDS);
    setPhase('sent');
    if (resend) setNote('New code sent.');
  };

  const verifyCode = async (e: FormEvent) => {
    e.preventDefault();
    setError(''); setNote('');
    const token = code.replace(/\D/g, '');
    if (token.length !== 6) { setError('Enter the 6-digit code from the email.'); return; }
    setPhase('verifying');
    // type 'email' covers both a first-time signup and a returning sign-in.
    const { error: err } = await supabase!.auth.verifyOtp({ email: email.trim(), token, type: 'email' });
    // On success the session lands and Desk.tsx's onAuthStateChange swaps this
    // card for the terminal, so there is nothing to do here.
    if (err) {
      setPhase('sent');
      setCode('');
      setError(/expired|invalid/i.test(err.message)
        ? 'That code is wrong or has expired. Request a new one.'
        : err.message);
      codeRef.current?.focus();
    }
  };

  const restart = () => {
    setPhase('idle'); setCode(''); setError(''); setNote(''); setCooldown(0);
  };

  return (
    <div className="desk-auth">
      <aside className="auth-side">
        <div className="about-fluid" aria-hidden="true">
          <span className="blob b1" /><span className="blob b2" /><span className="blob b3" />
        </div>
        <div className="auth-top brand"><BrandLockup /></div>
        <div className="auth-hero">
          <h2>The desk where Northeastern trades on what happens next.</h2>
          <p>Live markets on campus, sports, the economy and culture. Prices are the crowd's odds. Every account opens with $1,000 in play credits.</p>
        </div>
        <div className="auth-foot">
          <span>Northeastern University</span>
          <span>Student-run prediction markets</span>
          <span>Play money only</span>
        </div>
      </aside>

      <div className="auth-main">
      {/* the same red field as the brand panel, so the glass card has
          something to refract */}
      <div className="about-fluid auth-main-fluid" aria-hidden="true">
        <span className="blob b1" /><span className="blob b2" /><span className="blob b3" />
      </div>
      <div className="desk-card">
        <ExMark className="auth-mark" />

        {phase === 'sent' || phase === 'verifying' ? (
          <>
            <h1 className="desk-h1">Enter your code.</h1>
            <p className="desk-sub">We sent a 6-digit code to {email.trim()}. It's good for one sign-in and expires in an hour.</p>

            <form className="desk-field" onSubmit={verifyCode}>
              <span className="tk-label mono">Sign-in code</span>
              <input className="tk-input t-input desk-code" ref={codeRef} value={code}
                onChange={(e) => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(''); }}
                placeholder="000000" inputMode="numeric" autoComplete="one-time-code"
                aria-label="6-digit sign-in code" maxLength={6} />
              <button className="btn btn-red desk-go" type="submit" disabled={phase === 'verifying' || code.length !== 6}>
                {phase === 'verifying' ? 'Signing in…' : 'Sign in'}
              </button>
            </form>

            {error && <p className="desk-join-msg is-no mono" role="alert">{error}</p>}
            {note && !error && <p className="desk-join-msg is-yes mono" role="status">{note}</p>}

            <div className="desk-resend">
              <button type="button" className="desk-linkbtn" onClick={() => void sendCode(true)} disabled={cooldown > 0}>
                {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
              </button>
              <button type="button" className="desk-linkbtn" onClick={restart}>Use a different email</button>
            </div>
          </>
        ) : (
          <>
            <h1 className="desk-h1">Step onto the desk.</h1>
            <p className="desk-sub">Sign in with your Northeastern email. You start with $1,000 in play credits.</p>

            {supabase ? (
              <>
                <form className="desk-field" onSubmit={(e) => { e.preventDefault(); void sendCode(); }}>
                  <span className="tk-label mono">Northeastern email</span>
                  <input className="tk-input t-input" type="email" value={email}
                    onChange={(e) => { setEmail(e.target.value); setError(''); }}
                    placeholder={`you@${ALLOWED_DOMAIN}`} autoComplete="email" />
                  <button className="btn btn-red desk-go" type="submit" disabled={phase === 'sending'}>
                    {phase === 'sending' ? 'Sending…' : 'Email me a sign-in code'}
                  </button>
                </form>
                {error && <p className="desk-join-msg is-no mono" role="alert">{error}</p>}
              </>
            ) : (
              // No VITE_SUPABASE_* in this build — nothing to sign in to, and
              // with guest mode gone, nothing to fall back on either.
              <p className="desk-join-msg is-no mono" role="alert">
                The terminal is offline — sign-in isn't configured in this build.
              </p>
            )}
          </>
        )}

        <p className="desk-fine">A live demo. All markets settle in play money.</p>
      </div>
      </div>
    </div>
  );
}
