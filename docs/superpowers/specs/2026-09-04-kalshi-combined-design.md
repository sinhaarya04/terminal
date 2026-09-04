# E[X] Terminal — Kalshi integration: final combined design (Sam + Aryan)

**Date:** 2026-09-04   **Status:** proposed — supersedes the two parallel builds
**Merges:** Sam's catalog+oracle model (`2026-09-02-kalshi-catalog-oracle-design.md`,
already on `main` + prod) with Aryan's auto-launch + daily-counter + research-logging work.

## Why a combined doc
Two Kalshi integrations were built in parallel. Rather than pick one wholesale, this doc
keeps the stronger half of each. Honest scorecard:

| Concern | Sam | Aryan | Winner | In the combined system |
|---|---|---|---|---|
| Data model (catalog vs board) | catalog table, board stays clean | dumped 2,942 rows into `term_markets` | **Sam** | keep `term_kalshi_catalog`; board = curated only |
| Settlement | `kalshi-resolve` oracle auto-settles | none | **Sam** | keep the oracle |
| Multi-outcome | server-side N-outcome LMSR | display grouping only | **Sam** | keep server-side multi |
| Infra | Deno edge fns + pg_cron | fly.io always-on machine | **Sam** | edge functions; drop fly.io |
| Security | write-lockdown, oracle client-revoked | — | **Sam** | keep |
| **Getting markets onto the board** | **manual admin pick only** | **auto, quota'd, daily** | **Aryan** | **add the auto-lister** |
| **Growth tracking** | **none** | **`term_ingest_log` daily count** | **Aryan** | **keep the counter** |
| **Research substrate** | consumes it | **added the `price_history` engine-state cols + consent** | **Aryan** | **keep research-logging** |

Net: **Sam's architecture is the foundation; Aryan's three pieces are the operational
layer on top.**

## The unified model
Kalshi is a **content catalog + settlement oracle**, never a live price mirror. Between
seed and settle, every market trades on our own LMSR engine (real price discovery).

Three phases, all hands-off:
1. **Discover (auto)** — `kalshi-sync` pulls the public Kalshi API on a schedule and
   upserts `term_kalshi_catalog` (new markets, refreshed odds, settlement status).
2. **List (auto, NEW)** — the **auto-lister** promotes a bounded, filtered set of catalog
   entries onto the board each run, via Sam's *seeded* create path. Manual admin pick
   stays as an override.
3. **Settle (auto)** — `kalshi-resolve` maps a finalized Kalshi result back to the linked
   board market and pays out (parimutuel, points conserved).

```
Kalshi public API
      │  (kalshi-sync, scheduled)
      ▼
term_kalshi_catalog  ──pick──►  term_admin_create_from_kalshi         (manual override)
   (thousands)       ──auto──►  term_autolist_from_kalshi / _multi    (NEW: quota'd)
                                        │  seeded KX- market, listed=true, linked
                                        ▼
                                  term_markets  ──trade──►  LMSR engine (members)
                                        ▲
                                        │  (kalshi-resolve, scheduled)
                                  Kalshi result → term_resolve_from_oracle
      │
      └──► term_ingest_log  (NEW: one row per run — new_markets, new_by_cat, total_after)
```

## Campus markets — unchanged, fully separate
Campus/private markets never touch Kalshi, the catalog, or the oracle:
- Created manually (`term_create_market` → `EX-`; admin `term_admin_create_board_market` → `BX-`).
- Settled manually by owner/admin (no external feed to auto-resolve).
Kalshi only feeds the real-world categories (Sports / Crypto / Econ / Stocks / Tech /
Weather / Culture).

## Component 1 — Catalog + sync (Sam's, + counter)
`term_kalshi_catalog` and `kalshi-sync` as built. **Addition:** after the upsert loop,
`kalshi-sync` counts markets first seen today (`first_seen_at`) and current catalog size,
and — combined with the auto-lister's output — is the source of the daily `term_ingest_log`
row (see Component 3).

## Component 2 — Auto-lister (NEW, the synthesis)
A scheduled promoter that turns catalog entries into seeded board markets automatically,
so no human has to pick.

**Selection, per run, per category:**
- candidates: `status='active'`, `added_market_code is null`, `close_time > now()`;
- **category allowlist** Sports / Crypto / Econ / Stocks / Tech / Weather / Culture —
  **politics excluded** (E[X] policy; Kalshi is mostly politics, so this filter is load-bearing);
- rank by Kalshi `volume` desc (list what people care about);
- take up to **QUOTA_NEW events per category per run** (default 8) — the flood-guard;
- `event_mutually_exclusive` → one **multi** market (`term_autolist_multi_from_kalshi`);
  otherwise **binary** (`term_autolist_from_kalshi`).

**New DB functions** — twins of Sam's admin create fns, but **service-role only** (no
`is_admin` gate, `revoke ... from anon, authenticated`), mirroring how his
`term_resolve_from_oracle` sidesteps auth for the oracle. They reuse the exact seeding math
(pq from catalog odds, b=100, c0), set `listed=true`, stamp `event_ticker`/ticker, and set
`added_market_code` so the oracle can find them.

**Where it runs:** inside `kalshi-sync` (right after the catalog upsert, same schedule) or a
sibling `kalshi-autolist` edge function on its own cron. One function = simplest.

**Guardrails / tradeoff:** full auto-listing means no human eyeballs per market, so a
low-quality Kalshi market can occasionally surface. Volume filter + category allowlist keep
that rare; admins can unlist (`listed=false`) any dud. Optional stricter mode: auto-list into
a `pending` state that an admin one-click approves — semi-manual, not default.

## Component 3 — Daily counter (Aryan's, reframed)
`term_ingest_log` (already in prod) gets **one row per scheduled run**:
- `new_markets` — count actually **listed to the board** this run (auto-lister output),
- `new_by_cat` — `{"Sports":8,"Crypto":5,...}`,
- `total_after` — total listed `KX-` board markets after the run.
This is the "store of how many new markets we add every day" — now meaning *launched*, not
just imported. Doubles as ops + research telemetry (board-growth curve over time).

## Component 4 — Research-logging (Aryan's, keep)
`term_price_history` carries engine state (`pq_yes/pq_no/b/outcome_idx/kind`) on every price
move; `term_profiles.research_consent` gates IRB use. Already applied to prod and **already
consumed** by Sam's `term_log_tick_multi` — do not drop. Commit the artifact for reproducibility.

## Cadence
- `kalshi-sync` + auto-lister: **daily at 11:50 ET** (Aryan's original launch ritual) OR
  **hourly** for a fresher board. Recommend **daily launch of new markets** + a lighter
  **hourly odds/settlement refresh** (sync-only, no new listings) so the board grows once a
  day but settles promptly. TZ-aware so 11:50 stays 11:50 across DST.
- `kalshi-resolve`: hourly (offset), so finalized markets pay out within the hour.

## Reconciliation / migration
1. Git: reset local to `origin/main` (drop Aryan's board-dump + fly commits). Add ONE new
   commit: auto-lister fns + `kalshi-sync` counter + `research-logging.sql` + this doc.
2. Prod: delete the 2,942 dormant `listed=false` rows (re-derivable via sync). Deploy edge
   functions, run once to populate catalog + auto-list a first wave, schedule crons.
3. Verify: board fills automatically with seeded `KX-` markets (priced at odds, not 50/50);
   bet/sell/resolve conserve points; a settled catalog row auto-resolves its market;
   `term_ingest_log` gains a daily row.

## Open decisions
- Cadence: daily-launch + hourly-refresh (rec) vs everything hourly.
- QUOTA_NEW per category per run (default 8) and whether to also cap total board size.
- Full-auto (rec) vs auto-list-then-admin-approve.
