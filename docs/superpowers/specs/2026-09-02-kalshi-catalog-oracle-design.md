# Kalshi as catalog + settlement oracle (not a live mirror)

**Date:** 2026-09-02   **Branch:** `engine`   **Status:** approved, building

## Problem
The overnight Kalshi work put 2,271 markets straight into `term_markets`
(`owner is null`, `source='kalshi'`, 420 events) and mirrored their odds every
minute. Three problems: the rows are unseeded so our LMSR meter prices them
50/50 on the first trade; 2,271 untradeable rows clutter the live board; and
pegging our price to Kalshi denies our members any real price discovery.

## New model
Kalshi is used for exactly two things:
1. **Content** — pull each market's title, options and *starting* odds once, to
   seed one of our markets.
2. **Settlement oracle** — when the underlying Kalshi market resolves, mirror
   that result to auto-settle ours.
Between those, the market trades entirely on our own LMSR engine. No live peg.

## Key finding: no API key needed
Kalshi's market-data API is public. `GET https://api.elections.kalshi.com/
trade-api/v2/markets` and `/events` return 200 unauthenticated. A key is only
required to place orders (we never do). So both the catalog pull and the
auto-resolve poller run on public endpoints — nothing is stubbed.

Fields used: `ticker`, `event_ticker`, `title`, `yes_sub_title`, `category`
(from the event), `yes_bid_dollars`/`yes_ask_dollars`/`last_price_dollars`
(odds), `status` (`active`→`finalized`/`settled`), `result` (`yes`/`no`),
`close_time`.

## Architecture
1. **`term_kalshi_catalog`** — one row per Kalshi market (ticker PK,
   event_ticker, title, sub_title, category, yes_odds cents, status, result,
   close_time, added_market_code, last_synced_at). Refreshed by the pull; never
   tradeable itself.
2. **Pull edge function + cron (hourly)** — fetch the public Kalshi API, upsert
   the catalog: add new markets, refresh odds on open ones, flip settled ones
   with their result. Idempotent.
3. **Admin dropdown** — searchable list from the catalog (title + odds +
   category). Pick one -> `term_admin_create_from_kalshi(ticker)` creates a
   board market in `term_markets`, **seeded once** from the catalog odds
   (existing seeding path), stamped with `event_ticker`/ticker and recorded in
   `catalog.added_market_code`.
4. **Monitor + auto-resolve** — after each pull, for every open board market
   linked to a catalog ticker now `settled`, call `term_resolve_market` with the
   mapped outcome (`result` yes/no). Runs server-side.
5. **Manual admin resolve** — the existing admin/owner resolve stays as the
   override/fallback.

## Data migration
Back up, then seed the catalog from the existing 2,271 board rows (they already
carry ticker/title/odds/event_ticker), and clear those rows from `term_markets`
so the **board starts empty** and fills only with admin-picked markets. The
catalog is then kept current by the pull.

## Outcome shape
Kalshi stores each threshold as its own yes/no market (e.g. Mbappe 30+/35+/40+).
Launch maps one Kalshi market -> one binary E[X] market; the admin picks
individual markets. N-outcome grouping of an event is a later enhancement.

## Testing
Pull populates catalog idempotently; admin-create prices at the catalog odds
(not 50/50); a catalog row flipped to settled auto-resolves its linked market to
the right side; manual resolve still works; whole-account conservation holds.
