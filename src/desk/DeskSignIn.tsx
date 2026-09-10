import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import LiquidGlass from 'liquid-glass-react';
import ExMark from '../components/ExMark';
import BrandLockup from '../components/BrandLockup';
import { supabase } from '../lib/supabase';
import { isAllowedEmail, ALLOWED_DOMAIN } from '../lib/authEmail';

// Sign-in for the desk: Northeastern email + password (Supabase). There is no
// guest mode — every desk is a real account, so every market, bet and share
// code is the same one everyone else sees.
//
// Email is touched exactly twice in an account's life: a 6-digit code proves
// the address when the account is created, and a code unlocks setting a new
// password. Everything else is a password check with no mail involved.
//
// A code, never a link: Northeastern is on Microsoft 365, and Defender Safe
// Links fetches every URL in an inbound mail to scan it. A Supabase
// confirmation URL is single-use, so the scanner burns it before the human
// clicks. A 6-digit OTP is never a URL, so there is nothing for a scanner to
// consume. This only works if the email templates carry {{ .Token }} and no
// {{ .ConfirmationURL }} — see docs/supabase-auth.md.
//
// Members from before passwords existed have none; "Forgot or never set a
// password?" runs the same code-then-password path and is how they get one.
type Mode = 'signin' | 'signup' | 'verify' | 'reset' | 'reset-verify';

// Supabase rate-limits a fresh code to one per 60s; match it so the resend
// button can't fire a request that's guaranteed to bounce.
const RESEND_SECONDS = 60;
const MIN_PASSWORD = 8;

// Setting a password after a recovery code runs as two calls. The session
// lands on the first, and Desk.tsx swaps this card for the terminal before the
// second finishes. If that second call fails we sign out again, which remounts
// a fresh card — so the message has to survive the remount somewhere outside
// React state. Read once, then cleared.
let pendingError = '';

export default function DeskSignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<Mode>(() => (pendingError ? 'reset' : 'signin'));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(() => { const e = pendingError; pendingError = ''; return e; });
  const [note, setNote] = useState('');
  const [code, setCode] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);
  // the glass tracks the pointer across the whole form panel, not just the card
  const panelRef = useRef<HTMLDivElement>(null);
  // liquid-glass-react centres its pane with translate(-50%, -50%), which
  // lands on a fraction of a pixel whenever the card's height does. A
  // composited layer on a fractional offset resamples its text and edges, so
  // the whole card read soft. The pane is therefore held still (CSS strips
  // its transform) inside a slot that this effect places on whole pixels.
  const slotRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const panel = panelRef.current, slot = slotRef.current;
    if (!panel || !slot) return;
    const place = () => {
      const P = panel.getBoundingClientRect();
      const S = slot.getBoundingClientRect();
      const px = P.left + window.scrollX, py = P.top + window.scrollY;
      slot.style.left = `${Math.round(px + (P.width - S.width) / 2) - px}px`;
      slot.style.top = `${Math.round(py + (P.height - S.height) / 2) - py}px`;
      slot.style.visibility = 'visible';
      // the library sizes its rim, shade and refraction map from a measurement
      // it takes once on mount and again only on window resize. The card grows
      // between the email and code steps, so the pane must re-measure then too.
      window.dispatchEvent(new Event('resize'));
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(panel);
    ro.observe(slot);
    return () => ro.disconnect();
  }, [mode]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  // Focus the code field as soon as a code step paints, so the code can be
  // pasted straight from the mail app without a click.
  const codeStep = mode === 'verify' || mode === 'reset-verify';
  useEffect(() => { if (codeStep) codeRef.current?.focus(); }, [codeStep]);

  const clean = () => email.trim();
  const clearMsgs = () => { setError(''); setNote(''); };
  const go = (m: Mode) => { setMode(m); setCode(''); setPassword(''); clearMsgs(); };

  // The two client-side checks. They save a round trip; the server enforces
  // both for real (the domain trigger and the auth password policy).
  const checkEmail = () => {
    if (isAllowedEmail(email)) return true;
    setError(`Use your @${ALLOWED_DOMAIN} email.`); return false;
  };
  const checkPassword = () => {
    if (password.length >= MIN_PASSWORD) return true;
    setError(`Use at least ${MIN_PASSWORD} characters.`); return false;
  };

  const signIn = async (e: FormEvent) => {
    e.preventDefault(); clearMsgs();
    if (!checkEmail()) return;
    setBusy(true);
    const { error: err } = await supabase!.auth.signInWithPassword({ email: clean(), password });
    setBusy(false);
    if (!err) return; // the session landed; Desk.tsx takes it from here
    if (/not confirmed/i.test(err.message)) {
      // Signed up but never entered the code. Send a fresh one and finish that.
      const { error: rs } = await supabase!.auth.resend({ type: 'signup', email: clean() });
      if (rs) { setError(rs.message); return; }
      setCooldown(RESEND_SECONDS);
      go('verify');
      return;
    }
    setError(/invalid login/i.test(err.message)
      ? 'Wrong email or password. New here, or signed in by code before? Create an account or set a password below.'
      : err.message);
  };

  const signUp = async (e: FormEvent) => {
    e.preventDefault(); clearMsgs();
    if (!checkEmail() || !checkPassword()) return;
    setBusy(true);
    // No emailRedirectTo: nothing in the mail is clickable, so there is no
    // redirect to authorise.
    const { data, error: err } = await supabase!.auth.signUp({ email: clean(), password });
    setBusy(false);
    if (err) { setError(err.message); return; }
    // With Confirm email on, an address that already has an account comes back
    // as an obfuscated user with no identities rather than an error.
    if (data.user && data.user.identities?.length === 0) {
      setError('That email already has an account. Sign in instead.');
      return;
    }
    setCooldown(RESEND_SECONDS);
    go('verify');
  };

  const resendSignup = async () => {
    clearMsgs();
    const { error: err } = await supabase!.auth.resend({ type: 'signup', email: clean() });
    if (err) { setError(err.message); return; }
    setCooldown(RESEND_SECONDS);
    setNote('New code sent.');
  };

  const verifySignup = async (e: FormEvent) => {
    e.preventDefault(); clearMsgs();
    const token = code.replace(/\D/g, '');
    if (token.length !== 6) { setError('Enter the 6-digit code from the email.'); return; }
    setBusy(true);
    // type 'email' covers a signup confirmation.
    const { error: err } = await supabase!.auth.verifyOtp({ email: clean(), token, type: 'email' });
    setBusy(false);
    // On success the session lands and Desk.tsx's onAuthStateChange swaps this
    // card for the terminal, so there is nothing to do here.
    if (err) {
      setCode('');
      setError(/expired|invalid/i.test(err.message)
        ? 'That code is wrong or has expired. Request a new one.'
        : err.message);
      codeRef.current?.focus();
    }
  };

  // The recovery mail. Also the "set a password" path for members from the
  // code-only days, which is why the copy never says "reset".
  const sendRecovery = async (e?: FormEvent) => {
    e?.preventDefault(); clearMsgs();
    if (!checkEmail()) return;
    setBusy(true);
    const { error: err } = await supabase!.auth.resetPasswordForEmail(clean());
    setBusy(false);
    if (err) { setError(err.message); return; }
    setCooldown(RESEND_SECONDS);
    if (mode === 'reset-verify') setNote('New code sent.');
    else go('reset-verify');
  };

  const setNewPassword = async (e: FormEvent) => {
    e.preventDefault(); clearMsgs();
    const token = code.replace(/\D/g, '');
    if (token.length !== 6) { setError('Enter the 6-digit code from the email.'); return; }
    if (!checkPassword()) return;
    setBusy(true);
    const { error: err } = await supabase!.auth.verifyOtp({ email: clean(), token, type: 'recovery' });
    if (err) {
      setBusy(false);
      setCode('');
      setError(/expired|invalid/i.test(err.message)
        ? 'That code is wrong or has expired. Request a new one.'
        : err.message);
      codeRef.current?.focus();
      return;
    }
    // The session is live from here and the terminal may already be up. Set
    // the password now; if that fails, drop the session rather than leave a
    // member inside with no way back in.
    const { error: up } = await supabase!.auth.updateUser({ password });
    if (up) {
      pendingError = `Couldn't set that password: ${up.message} Request a new code and try again.`;
      await supabase!.auth.signOut();
    }
  };

  return (
    <div className="desk-auth">
      <aside className="auth-side">
        <div className="about-fluid" aria-hidden="true">
          <span className="blob b1" /><span className="blob b2" /><span className="blob b3" />
        </div>
        <a href="https://www.e-x.club/" className="auth-top brand" aria-label="Back to e-x.club"><BrandLockup /></a>
        <div className="auth-hero">
          <h2>The desk where Northeastern trades on what happens next.</h2>
          <p>Live markets on campus, sports, the economy and culture. Prices are the crowd's odds.</p>
        </div>
      </aside>

      <div className="auth-main" ref={panelRef}>
      {/* the same red field as the brand panel, so the glass card has
          something to refract */}
      <div className="about-fluid auth-main-fluid" aria-hidden="true">
        <span className="blob b1" /><span className="blob b2" /><span className="blob b3" />
      </div>
      {/* Apple-style liquid glass (rdev/liquid-glass-react): the red field
          bends and blurs behind the card, and the pane leans toward the
          pointer. Safari and Firefox get the blur without the refraction. */}
      <div className="auth-glass-slot" ref={slotRef}>
      <LiquidGlass
        className="auth-glass"
        mouseContainer={panelRef}
        displacementScale={30}
        blurAmount={0.2}
        saturation={135}
        aberrationIntensity={0}
        elasticity={0}
        cornerRadius={18}
        padding="0"
        style={{ position: 'absolute' }}
      >
      <div className="desk-card">
        <ExMark className="auth-mark" />

        {!supabase ? (
          // No VITE_SUPABASE_* in this build — nothing to sign in to, and
          // with guest mode gone, nothing to fall back on either.
          <>
            <h1 className="desk-h1">Step onto the desk.</h1>
            <p className="desk-join-msg is-no mono" role="alert">
              The terminal is offline — sign-in isn't configured in this build.
            </p>
          </>
        ) : mode === 'signin' ? (
          <>
            <h1 className="desk-h1">Step onto the desk.</h1>
            <p className="desk-sub">Sign in with your Northeastern email. You start with $1,000 in play credits.</p>

            <form className="desk-field" onSubmit={signIn}>
              <span className="tk-label mono">Northeastern email</span>
              <input className="tk-input t-input" type="email" value={email}
                onChange={(e) => { setEmail(e.target.value); setError(''); }}
                placeholder={`you@${ALLOWED_DOMAIN}`} autoComplete="email" />
              <span className="tk-label mono desk-label-2">Password</span>
              <input className="tk-input t-input" type="password" value={password}
                onChange={(e) => { setPassword(e.target.value); setError(''); }}
                autoComplete="current-password" aria-label="Password" />
              <button className="btn btn-red desk-go" type="submit" disabled={busy}>
                {busy ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
            {error && <p className="desk-join-msg is-no mono" role="alert">{error}</p>}

            <div className="desk-resend">
              <button type="button" className="desk-linkbtn" onClick={() => go('signup')}>Create account</button>
              <button type="button" className="desk-linkbtn" onClick={() => go('reset')}>Forgot or never set a password?</button>
            </div>
          </>
        ) : mode === 'signup' ? (
          <>
            <h1 className="desk-h1">Create your desk.</h1>
            <p className="desk-sub">Pick a password. We'll email one code to confirm the address, then you're in.</p>

            <form className="desk-field" onSubmit={signUp}>
              <span className="tk-label mono">Northeastern email</span>
              <input className="tk-input t-input" type="email" value={email}
                onChange={(e) => { setEmail(e.target.value); setError(''); }}
                placeholder={`you@${ALLOWED_DOMAIN}`} autoComplete="email" />
              <span className="tk-label mono desk-label-2">Password<span className="desk-label-note">{MIN_PASSWORD}+ characters</span></span>
              <input className="tk-input t-input" type="password" value={password}
                onChange={(e) => { setPassword(e.target.value); setError(''); }}
                autoComplete="new-password" aria-label="Password" />
              <button className="btn btn-red desk-go" type="submit" disabled={busy}>
                {busy ? 'Creating…' : 'Create account'}
              </button>
            </form>
            {error && <p className="desk-join-msg is-no mono" role="alert">{error}</p>}

            <div className="desk-resend">
              <button type="button" className="desk-linkbtn" onClick={() => go('signin')}>Back to sign in</button>
            </div>
          </>
        ) : mode === 'verify' ? (
          <>
            <h1 className="desk-h1">Enter your code.</h1>
            <p className="desk-sub">We sent a 6-digit code to {clean()}. This is the only time you'll need one.</p>

            <form className="desk-field" onSubmit={verifySignup}>
              <span className="tk-label mono">Confirmation code</span>
              <input className="tk-input t-input desk-code" ref={codeRef} value={code}
                onChange={(e) => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(''); }}
                placeholder="000000" inputMode="numeric" autoComplete="one-time-code"
                aria-label="6-digit confirmation code" maxLength={6} />
              <button className="btn btn-red desk-go" type="submit" disabled={busy || code.length !== 6}>
                {busy ? 'Signing in…' : 'Confirm and sign in'}
              </button>
            </form>

            {error && <p className="desk-join-msg is-no mono" role="alert">{error}</p>}
            {note && !error && <p className="desk-join-msg is-yes mono" role="status">{note}</p>}

            <div className="desk-resend">
              <button type="button" className="desk-linkbtn" onClick={() => void resendSignup()} disabled={cooldown > 0}>
                {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
              </button>
              <button type="button" className="desk-linkbtn" onClick={() => go('signup')}>Use a different email</button>
            </div>
            <p className="desk-fine desk-hint">Give it up to 40 seconds to arrive, and check your spam folder if it doesn't show up.</p>
          </>
        ) : mode === 'reset' ? (
          <>
            <h1 className="desk-h1">Set a password.</h1>
            <p className="desk-sub">We'll email a 6-digit code. Enter it with your new password and you're back on the desk.</p>

            <form className="desk-field" onSubmit={sendRecovery}>
              <span className="tk-label mono">Northeastern email</span>
              <input className="tk-input t-input" type="email" value={email}
                onChange={(e) => { setEmail(e.target.value); setError(''); }}
                placeholder={`you@${ALLOWED_DOMAIN}`} autoComplete="email" />
              <button className="btn btn-red desk-go" type="submit" disabled={busy}>
                {busy ? 'Sending…' : 'Email me a code'}
              </button>
            </form>
            {error && <p className="desk-join-msg is-no mono" role="alert">{error}</p>}

            <div className="desk-resend">
              <button type="button" className="desk-linkbtn" onClick={() => go('signin')}>Back to sign in</button>
            </div>
          </>
        ) : (
          <>
            <h1 className="desk-h1">Choose a password.</h1>
            <p className="desk-sub">Enter the code we sent to {clean()} and the password you want from now on.</p>

            <form className="desk-field" onSubmit={setNewPassword}>
              <span className="tk-label mono">Code</span>
              <input className="tk-input t-input desk-code" ref={codeRef} value={code}
                onChange={(e) => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(''); }}
                placeholder="000000" inputMode="numeric" autoComplete="one-time-code"
                aria-label="6-digit code" maxLength={6} />
              <span className="tk-label mono desk-label-2">New password<span className="desk-label-note">{MIN_PASSWORD}+ characters</span></span>
              <input className="tk-input t-input" type="password" value={password}
                onChange={(e) => { setPassword(e.target.value); setError(''); }}
                autoComplete="new-password" aria-label="New password" />
              <button className="btn btn-red desk-go" type="submit" disabled={busy || code.length !== 6}>
                {busy ? 'Signing in…' : 'Set password and sign in'}
              </button>
            </form>

            {error && <p className="desk-join-msg is-no mono" role="alert">{error}</p>}
            {note && !error && <p className="desk-join-msg is-yes mono" role="status">{note}</p>}

            <div className="desk-resend">
              <button type="button" className="desk-linkbtn" onClick={() => void sendRecovery()} disabled={cooldown > 0}>
                {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
              </button>
              <button type="button" className="desk-linkbtn" onClick={() => go('reset')}>Use a different email</button>
            </div>
            <p className="desk-fine desk-hint">Give it up to 40 seconds to arrive, and check your spam folder if it doesn't show up.</p>
          </>
        )}

        <p className="desk-fine">A live demo. All markets settle in play money.</p>
      </div>
      </LiquidGlass>
      </div>
      </div>
    </div>
  );
}
