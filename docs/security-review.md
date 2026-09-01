# Security & bug deep dive — 2026-09-01 (overnight, autonomous)

Scope: the E[X] Terminal (`ex-terminal.vercel.app`) and its slice of the shared
Supabase project `dtgciwhecaqwnddzepiz`. Poker-portal and landing-site tables
were reviewed only where they share the auth surface.

**Test artifacts and the balance corruption from probing were cleaned up.**
Balances audited clean afterwards (pub 1000.00, pri 1013.12).

---

## CRITICAL — found live, fixed immediately

These were exploitable on production by any signed-in Northeastern user with
devtools. Fixed on the DB (migration `term_lock_down_direct_writes`); re-tested,
all now return 403 while the RPCs keep working. **Fixed on the shared DB rather
than left for the branch, because leaving live money-minting open overnight was
not acceptable; the fix touches only `term_*` tables and cannot affect poker.**

| # | Exploit | Was | Now |
|---|---|---|---|
| 1 | `PATCH term_profiles` — set your own `pm_balance`/`balance` to any value | **200, balance became 999999** | 403 |
| 2 | `POST term_bets` — insert a bet directly, 1,000,000 shares for $0, skipping the priced RPC | **201** | 403 |
| 3 | `POST term_markets` — fabricate a market you "own" | **201** | 403 |

Root cause: `authenticated` held direct `INSERT`/`UPDATE` on the `term_*`
tables, and the RLS policies (`term_profiles_self_upd`, `term_bets_self_ins`,
`term_markets_owner_ins`) permitted self-scoped writes — so the priced,
balance-checked RPCs were optional. The client only ever *reads* directly;
every write is a SECURITY DEFINER RPC. Fix: revoke `INSERT/UPDATE/DELETE` from
`authenticated` on all three tables, keep `SELECT`, drop the write policies.
SECURITY DEFINER functions run as the table owner, so they are unaffected —
verified: `term_create_market`, `term_place_bet`, `term_resolve_market` still
succeed post-lockdown.

Correctly-blocked-before checks that still pass: inserting a bet as another
`user_id` (403 via `with check auth.uid() = user_id`), reading another user's
profile (RLS returns `[]`).

**This fix is not yet in `supabase/terminal-schema.sql`** on any branch — it
was applied directly to close the live hole. Fold it into the schema file
before the next full re-run. (Left uncommitted intentionally so the group sees
it as a deliberate decision, not a silent diff.)

---

## HIGH — found by the load test, fixed

**Sell/resolve mismatch minted fractions of a cent.** Sells move the LMSR meter
by exact share amounts but credit proceeds rounded to the cent; resolution paid
the pot computed *from the meter*, so after N sells the meter claimed ~0.5¢·N
that nobody paid in. On a conserved leaderboard this is a (slow) leak. Fix
(`term_resolve_pays_from_cash`, and client mirror): the pot is `pool`
(`Σbuys − Σsells`, exact by construction); the meter prices, the pool pays.
Post-fix whole-account audit conserved exactly.

Concurrency itself is sound: 40 parallel operations (20 bets, then 10 bets
racing 10 sells on one market) all serialised through `SELECT … FOR UPDATE`,
with `pool == Σcost` and `sq == Σshares` to zero drift.

---

## MEDIUM — recommend, not yet done (group call)

1. **No admin/officer resolution for the public board.** Board outcomes have
   `owner = null`, so `term_resolve_market`'s owner check means *nobody* can
   resolve them — board bets can be entered and sold but never settled. Needs
   an officer role + an admin-scoped resolve RPC. This is the Phase-4 "admin
   screens" item; flagged so it isn't forgotten when the board goes live.
2. **`applicants` has RLS on with no policy** (advisor INFO). Deny-all to the
   anon/authenticated API — fine *if* it's only read by the service-role edge
   function (`join-discord`), a footgun if anything client-side expects to read
   it. Landing-site owner should confirm. Not a terminal table.
3. **No rate limiting on the trade RPCs.** A user can spam `term_place_bet`;
   bounded by their own balance and RLS so it mints nothing, but it's a cheap
   way to hammer the DB. Supabase per-user rate limits or a simple
   last-trade-at throttle would cover it before a wide launch.

---

## LOW / reviewed-clean

- **`term_lmsr_*` helpers had a mutable `search_path`** (advisor 0011). Pinned
  to `public` (`term_lmsr_helpers_pin_search_path`). Bodies unchanged.
- **`npm audit`: 2 high, both `react-router` RSC-mode CSRF.** Not applicable —
  this is a Vite SPA with no React Server Components or server actions, so the
  RSC action path doesn't exist. Left un-bumped to avoid a major upgrade;
  revisit if the app ever adopts RSC.
- **Secrets:** only the publishable anon key ships in the bundle (by design;
  RLS is the real gate). No service-role key, no `.env` tracked, `.env.example`
  is empty. No hardcoded credentials in tracked source.
- **Injection:** no `dangerouslySetInnerHTML`, `eval`, or `innerHTML=` in
  `src/`. Market questions/handles are parameterized into SQL and React-escaped
  on render — no SQL or XSS surface via user text.
- **Input validation in RPCs:** negative/zero amounts rejected, side whitelisted
  to YES/NO, selling more than held rejected, double-settle rejected,
  non-owner settle rejected, closed/settled markets reject bets. All verified.
- **Auth domain gate** is enforced server-side (`enforce_northeastern_email`
  trigger on `auth.users`), not just client-side.

---

## What I changed on the DB tonight (so nothing is a surprise)

Applied directly to `dtgciwhecaqwnddzepiz` (all `term_*` or additive, none
touching poker/landing data):
- `term_upsert_seeds_engine` — board upsert seeds LMSR state (board-engine work)
- `term_resolve_pays_from_cash` — pot pays from pool, not meter
- `term_lock_down_direct_writes` — **the critical fix**; also restored my
  test-corrupted balance
- `term_lmsr_helpers_pin_search_path` — advisor hardening
- `cleanup_overnight_test_markets` — deleted EX-CXZQ / EX-HACK / EX-Q9RY

Code changes are all on branch `board-engine`, unmerged. Nothing pushed to main.
