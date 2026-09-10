# Supabase auth for the desk

The terminal signs members in with **email + password**. Email is touched
exactly twice in an account's life: a 6-digit code proves the address when the
account is created, and a code unlocks setting a new password. Every other
sign-in is a password check with no mail involved. There is no guest mode.

Project ref: `dtgciwhecaqwnddzepiz`. The auth project is shared with Showdown,
which still signs in with a per-visit code through `signInWithOtp`; nothing
here changes that.

## Why every email carries a code and never a link

Northeastern mail runs on Microsoft 365, and Defender for Office 365 **Safe
Links** fetches every URL in an inbound message to scan it for phishing. A
Supabase `{{ .ConfirmationURL }}` is single-use: the scanner's fetch verifies
the token, and by the time a person clicks, the link is spent. That is why
magic links failed for everyone on Outlook while working on Gmail.

A one-time code is never a URL, so there is nothing for a scanner to consume.
Whether a mail contains a link or a code is decided **entirely by the email
template** — `{{ .Token }}` sends a code, `{{ .ConfirmationURL }}` sends a
link. They are the same secret, so if a template still has the URL anywhere,
Safe Links burns the code too. The URL must be gone, not just accompanied by a
code.

## Required dashboard config

All under https://supabase.com/dashboard/project/dtgciwhecaqwnddzepiz/auth.

**Emails → Templates.** Paste `supabase/email-otp-code.html` into all three,
with the subject `{{ .Token }} is your one-time code · E[X]`:

| Template | Who sends it | Client call |
| --- | --- | --- |
| Confirm signup | Terminal, at account creation | `signUp` |
| Reset password | Terminal, set-a-password path | `resetPasswordForEmail` |
| Magic Link | Showdown, every sign-in | `signInWithOtp` |

Reset password is the one most likely to still carry a link, since the terminal
did not use it before passwords.

**Sign In / Providers → Email.**

- *Confirm email* **on**. `signUp` then returns a user with no session, and the
  account cannot sign in until the code is verified. Turning this off would let
  anyone claim any Northeastern address.
- *Minimum password length* **8**. The client checks this before sending, but
  the server is the enforcement.
- *Email OTP expiration* 3600s (the default) is fine.

**SMTP.** Postmark is the custom provider. Keep its click and open tracking
off: tracking rewrites URLs in outgoing mail, and while a code-only template
has none today, it would break any link added later.

## Rate limits

A fresh code can be requested once every 60 seconds per address.
`DeskSignIn` disables its resend button for that long so it can't fire a
request that is guaranteed to bounce.

## Client flow

`src/desk/DeskSignIn.tsx` is one card with five modes, all on the same page —
no redirect, so no redirect-URL allowlist entry is needed and no call passes
`emailRedirectTo`.

| Mode | Calls | Then |
| --- | --- | --- |
| `signin` | `signInWithPassword({ email, password })` | session lands |
| `signup` | `signUp({ email, password })` | `verify` |
| `verify` | `verifyOtp({ email, token, type: 'email' })`; resend via `resend({ type: 'signup', email })` | session lands |
| `reset` | `resetPasswordForEmail(email)` | `reset-verify` |
| `reset-verify` | `verifyOtp({ email, token, type: 'recovery' })`, then `updateUser({ password })` | session lands |

Two Supabase behaviours the card leans on:

- With *Confirm email* on, `signUp` for an address that already has an account
  returns an obfuscated user whose `identities` array is empty, not an error.
  The card reads that as "sign in instead".
- `signInWithPassword` answers `Email not confirmed` for an account that signed
  up but never entered its code. The card re-sends the code and jumps to
  `verify`.

In `reset-verify` the session lands after the first call, and `Desk.tsx`'s
`onAuthStateChange` may already have swapped the card for the terminal when
the second finishes. If `updateUser` fails, the card signs out again and keeps
the message in a module-level slot that the freshly mounted card shows once.

On any successful sign-in, `Desk.tsx` calls `hydrateLive`, and the card is
replaced by the terminal.

## Members from before passwords

Accounts created under the old code-only flow have no password. "Forgot or
never set a password?" runs the `reset` path, which is the same thing as
setting a first one. The account is the same `auth.users` row, so balance and
positions carry over. No migration.

## Domain gate

`src/lib/authEmail.ts` blocks anything that isn't `northeastern.edu` (or a
subdomain) before the request goes out. That is a UX courtesy only — the real
gate is the `enforce_northeastern_email` trigger in Supabase.
