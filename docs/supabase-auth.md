# Supabase auth for the desk

The terminal signs members in with a **6-digit email code**, not a magic link.
Guest mode never touches Supabase.

Project ref: `dtgciwhecaqwnddzepiz`.

## Why a code and not a link

Northeastern mail runs on Microsoft 365, and Defender for Office 365 **Safe
Links** fetches every URL in an inbound message to scan it for phishing. A
Supabase `{{ .ConfirmationURL }}` is single-use: the scanner's fetch verifies
the token, and by the time a person clicks, the link is spent. The result is a
sign-in that fails for everyone on Outlook with "Token has expired or is
invalid" — while working fine on Gmail, which is why it looks intermittent.

A one-time code is never a URL, so there is nothing for a scanner to consume.
This is Supabase's own recommended workaround for prefetching mail providers.

## Required dashboard config

The client sends `signInWithOtp({ email })`. Whether the mail contains a link
or a code is decided **entirely by the email template** — `{{ .Token }}` sends
a code, `{{ .ConfirmationURL }}` sends a link. If a template still has a
confirmation URL, that link goes out and Safe Links burns the token, taking the
code down with it (they are the same token). So the URL must be gone, not just
accompanied by a code.

Edit both templates under **Authentication → Emails → Templates**
(https://supabase.com/dashboard/project/dtgciwhecaqwnddzepiz/auth/templates):

- **Magic Link** — used when the address already has an account.
- **Confirm signup** — used the first time an address signs in, because the
  client leaves `shouldCreateUser` at its default of `true`.

Both should carry the code and no anchor tag:

```html
<h2>Your E[X] Terminal sign-in code</h2>
<p>Enter this code on the sign-in screen:</p>
<p style="font-size:28px;letter-spacing:8px;font-family:monospace"><strong>{{ .Token }}</strong></p>
<p>It expires in an hour and can only be used once. If you didn't ask for it, ignore this email.</p>
```

Put the code in the subject too, so it's readable from the notification:
`{{ .Token }} is your E[X] Terminal code`.

Same change via the Management API, if you'd rather not click through:

```bash
export SUPABASE_ACCESS_TOKEN="..."   # https://supabase.com/dashboard/account/tokens
curl -X PATCH "https://api.supabase.com/v1/projects/dtgciwhecaqwnddzepiz/config/auth" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "mailer_subjects_magic_link": "{{ .Token }} is your E[X] Terminal code",
    "mailer_templates_magic_link_content": "<h2>Your E[X] Terminal sign-in code</h2><p>Enter this code on the sign-in screen:</p><p style=\"font-size:28px;letter-spacing:8px;font-family:monospace\"><strong>{{ .Token }}</strong></p><p>It expires in an hour and can only be used once.</p>",
    "mailer_subjects_confirmation": "{{ .Token }} is your E[X] Terminal code",
    "mailer_templates_confirmation_content": "<h2>Your E[X] Terminal sign-in code</h2><p>Enter this code on the sign-in screen:</p><p style=\"font-size:28px;letter-spacing:8px;font-family:monospace\"><strong>{{ .Token }}</strong></p><p>It expires in an hour and can only be used once.</p>"
  }'
```

Two other settings worth checking while you're in there:

- **Authentication → Sign In / Providers → Email → Email OTP Expiration** —
  3600s (one hour) is the default and is fine. Supabase caps it at 86400s to
  limit brute-force exposure.
- If a custom SMTP provider is ever added, **turn its click/open tracking off**.
  Tracking rewrites URLs in outgoing mail; with a code-only template there are
  no URLs to rewrite today, but it would break any link added later.

## Rate limits

A fresh code can be requested once every 60 seconds per address. `DeskSignIn`
disables its resend button for that long so the button can't fire a request
that is guaranteed to bounce.

## Client flow

`src/desk/DeskSignIn.tsx` runs two steps against the same page — no redirect, so
no redirect-URL allowlist entry is needed:

1. `supabase.auth.signInWithOtp({ email })` — sends the code. No
   `emailRedirectTo`, since nothing in the mail is clickable.
2. `supabase.auth.verifyOtp({ email, token, type: 'email' })` — `'email'` is
   correct for both a first-time signup and a returning sign-in.

On success the session lands, `Desk.tsx`'s `onAuthStateChange` calls
`hydrateLive`, and the card is replaced by the terminal.

## Domain gate

`src/lib/authEmail.ts` blocks anything that isn't `northeastern.edu` (or a
subdomain) before the request goes out. That is a UX courtesy only — anything in
the browser can be bypassed, so the real gate has to be server-side in Supabase.
