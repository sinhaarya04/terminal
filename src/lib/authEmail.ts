// Client-side gate for member sign-ups. This is a UX courtesy only — the real
// enforcement is server-side in Supabase (see docs/supabase-auth.md), since
// anything in the browser can be bypassed.

export const ALLOWED_DOMAIN = 'northeastern.edu';

export function isAllowedEmail(email: string): boolean {
  const e = email.trim().toLowerCase();
  const at = e.lastIndexOf('@');
  if (at <= 0 || at === e.length - 1) return false;
  const domain = e.slice(at + 1);
  return domain === ALLOWED_DOMAIN || domain.endsWith(`.${ALLOWED_DOMAIN}`);
}
