import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Client is null until VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are set
// (locally in .env.local, in production via Vercel env vars — see
// docs/supabase-auth.md). Pages must handle the unconfigured case gracefully.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase: SupabaseClient | null =
  url && key ? createClient(url, key) : null;

// Name of the current monthly season, e.g. "July 2026".
export function currentSeasonName(d: Date = new Date()): string {
  return d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
}
