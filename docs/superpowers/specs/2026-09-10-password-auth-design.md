# Password sign-in — design

**Date:** 2026-09-10
**Scope:** the desk's sign-in card and the Supabase auth settings it depends on.
Desk hydration, the store, the domain trigger and the schema are not touched.

## Problem

Every sign-in today sends a 6-digit code by email. The mail is slow and
unreliable, the card carries a paragraph of caveats about junk folders and
40-second waits, and a member who just wants to check a price has to leave the
app and open Outlook every time.

The code exists for a reason: Northeastern mail runs on Microsoft 365, whose
Safe Links scanner fetches every URL in an inbound message and burns single-use
magic links. That constraint still holds, so nothing in this design puts a
clickable token in an email.

## Decisions

| Question | Decision |
| --- | --- |
| Primary sign-in | Email + password, `signInWithPassword` |
| Proof of address | One 6-digit code at account creation, never again |
| Password recovery | Code by email, then a new password, in one form |
| Existing code-only accounts | Get a password through the recovery path; no migration |
| Domain | `@northeastern.edu` only, client check plus the existing server trigger |
| Microsoft SSO, MFA | Out of scope |
| Showdown's OTP sign-in | Untouched; it shares the auth project |

## Supabase settings (dashboard, not code)

- **Confirm email** stays on. `signUp` creates the user unconfirmed and sends
  the "Confirm signup" template; the account cannot sign in until the code is
  verified.
- **Minimum password length** 8.
- **Reset password template** switches to the code-only template in
  `supabase/email-otp-code.html`, with no `ConfirmationURL` anywhere in it.
  Today it sends a link, which Safe Links would consume. The same file already
  serves Magic Link and Confirm signup and is app-neutral, so Showdown is
  unaffected.
- Postmark is already the custom SMTP provider. Nothing changes there.

## The card

One component, `src/desk/DeskSignIn.tsx`, with five modes. The glass panel,
brand side and layout stay as they are; only the form inside changes.

### `signin` (default)

Email and password, one "Sign in" button. Below it two link-buttons:
"Create account" and "Forgot or never set a password?".

- Domain check runs before the request, as today.
- `Invalid login credentials` shows "Wrong email or password. New here, or
  signed in by code before? Create an account or set a password below." —
  because a member who only ever used codes has no password yet, and Supabase
  does not distinguish the two cases.
- `Email not confirmed` re-sends the signup code and moves to `verify`.

### `signup`

Email and password, "Create account" button, and a "Back to sign in" link.
Calls `signUp({ email, password })` with no `emailRedirectTo`.

- Supabase returns an "obfuscated" user with an empty `identities` array when
  the address already has a confirmed account. That case shows "That email
  already has an account. Sign in instead." and does not move on.
- Otherwise the card moves to `verify`.

### `verify`

The existing code screen, reused: auto-focused numeric field, paste-friendly,
`verifyOtp({ email, token, type: 'email' })`, resend on a 60-second cooldown,
"Use a different email". Resend calls `auth.resend({ type: 'signup', email })`.
On success the session lands and Desk.tsx swaps the card for the terminal, as
today.

### `reset`

Email only, "Email me a code" button, "Back to sign in" link. Calls
`resetPasswordForEmail(email)` with no redirect, then moves to `reset-verify`.
The heading says "Set a password" rather than "Reset", since for existing
members this is the first one.

### `reset-verify`

One form: the 6-digit code and the new password, "Set password and sign in"
button, resend on cooldown, "Use a different email". On submit:

1. `verifyOtp({ email, token, type: 'recovery' })` — the session lands.
2. `updateUser({ password })`.

The two run back to back. Desk.tsx's auth watcher fires after step 1, so the
terminal may already be on screen when step 2 completes; with the client
enforcing the 8-character minimum before sending, step 2 failing is rare. If it
does fail, the card signs the session out so the member is not left inside
without a password, and the failure message is held in a module-level slot that
the freshly mounted card reads once and shows on the `reset` screen.

### Shared behaviour

- Passwords are plain `type="password"` fields with `autoComplete` set to
  `current-password` or `new-password` so browser managers offer to save.
- Client-side password check: at least 8 characters, otherwise "Use at least
  8 characters." before any request.
- Error text sits in the existing `desk-join-msg` slot; there is no fine print
  about delivery times on any screen. The "A live demo" footer stays.
- The email is kept across mode changes so nobody retypes it.

## What does not change

`Desk.tsx`, `deskStore.ts`, `terminalDb.ts`, `enforce_northeastern_email`,
`term_ensure_profile`, `authEmail.ts`. An existing member's account is the same
`auth.users` row, so balance and positions carry over.

## Docs

`docs/supabase-auth.md` is rewritten for the password flow: why the code
survives at signup and recovery, the three settings above, the client calls per
mode. The header comment in `supabase/email-otp-code.html` lists Reset password
as a third destination.

## Verification

No test runner, by standing decision. `npx tsc -b && npm run build` must exit
0, then drive the real app:

1. Create an account with a real Northeastern inbox, enter the code, land on
   the desk.
2. Sign out, sign back in with the password, no email involved.
3. On a code-only account, run the set-password path and confirm the balance is
   the same afterwards.
4. Wrong password, unregistered email, short password and mismatched domain
   each show their message without a request going out where the client can
   tell.
