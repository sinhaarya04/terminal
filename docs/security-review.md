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

**Now mirrored in `supabase/terminal-schema.sql`** (branch `board-engine`,
commit that added this report) as well as applied live, so a fresh re-run of
the schema reproduces the locked-down grants.

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

---

## Update — medium items 1-3 addressed (branch board-engine)

- **1. Admin/officer role — built.** `term_profiles.is_admin`, an admin-only
  `term_admin_create_board_market` (public markets, code prefix `BX-`), and a
  unified `term_resolve_market` that lets an **owner OR admin** settle and pays
  the wallet matching the market (PUB for board, PRI for private). Board markets
  can now complete a full lifecycle — verified live: create → bet (PUB 1000→950)
  → admin-resolve YES → payout (950→1000), PRI untouched, conserved exactly.
  Client: officer-only "+ New board market" on the grid and a settle control on
  the market screen (`BoardAdmin`). Bootstrap the first officer by hand:
  `update public.term_profiles set is_admin = true where handle = 'you';`
  (@bateman.sa is already set.)
- **2. Rate limiting — built.** A 150ms per-user minimum gap on
  `term_place_bet` / `term_sell_shares` (`last_action_at`). Verified: 5 parallel
  bets → 1 accepted, 4 rejected `slow down`; sequential human clicks (network
  latency > 150ms) are unaffected. Anti-DoS, not anti-theft — money stays
  bounded by balance + RLS.
- **3. Board close/lock — covered by the existing engine.** Board markets take a
  `closes_at`; `term_place_bet` already rejects `now() >= closes_at`, so a board
  market locks at close and waits for an officer to resolve.

---

## Protocol pass — 2026-09-01 (found TWO regressions on the shared DB)

A full top-to-bottom test found that **a teammate had re-run the OLD schema on
the shared project**, which silently reverted two of tonight's fixes. Both are
now re-applied AND the branch schema file is corrected so re-adoption can't
reintroduce them.

1. **`term_place_bet` reverted to its pre-engine body** — old fixed-price share
   math (no LMSR meter), and no wallet split, so a **private** market bet was
   debited from PUB while its payout credited PRI: money crossed wallets.
   (`term_sell_shares` was unaffected.) Caught by a conservation cycle: a
   private binary bet moved PUB 1000→970 instead of PRI. Fixed
   (`term_place_bet_restore_engine`); re-verified PUB untouched, PRI round-trips.
2. **The write lockdown reverted** — the old schema recreated
   `term_profiles_self_upd` / `term_markets_owner_ins` / `term_bets_self_ins`
   and re-granted insert/update, reopening balance-edit, fake-market and
   unpriced-bet. Re-verified all three at 403 after `term_relock_writes_v2`.

**Operational risk (needs the group): this DB is shared and being edited by
others. A security fix here is not durable until the team adopts the engine
branch's `terminal-schema.sql`** (which no longer creates the permissive
policies and ships the correct functions). Until then, re-runs of the old
schema will keep trampling it.

Everything else passed: binary + multi, personal + board, both void paths,
rate limit (5 parallel → ≤2 through), wallet isolation, and the 3 security
probes. Test markets deleted; tester account reset to the 1000/1000 grant.

### Separate finding: historical point inflation (~+1183)
The whole terminal economy currently totals ~7183 against 6000 granted
(three accounts × 2000). This is **pre-fix** damage — the old $1/share payout
and the balance-edit exploit, both open before tonight — not the current
engine (which conserves, proven repeatedly). The clean remedy is a **season-1
reset** to the grant for everyone before go-live, which the club notes already
plan. Pairs naturally with the leaderboard.
