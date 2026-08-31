# Market close dates — design

**Date:** 2026-08-31
**Scope:** the Personal tab's private markets. The public Markets board is not touched.

## Problem

`DeskMarket.closes` is a free-text string. The create form accepts anything —
"Fri", "Sun", "whenever" — and nothing reads it back. A private market therefore
has no end: it takes bets forever, and the only way it ever finishes is the
owner settling it by hand, which they can do at any moment with or without a
date having passed.

Settlement landed in `a836aa2`. This adds the other half: a close that actually
arrives.

The field is also shared with the public board, which fills it with
`ev.updated` ("21m ago") in `outcomeToMarket`. That was never a close date, so
the board is deliberately left alone.

## Decisions

| Question | Decision |
| --- | --- |
| What happens at the close | Betting locks; the market waits for the owner to settle |
| Precision | Date **and** time |
| Which markets | Private markets only; public board unchanged |
| Picker | Custom: preset chips + month grid + time row |
| Where "closed" is decided | Derived on read, plus a server guard |

### Why derived rather than timers

"Is this market closed?" is computed as `now >= closesAt` wherever it is needed,
rather than stored as a flag flipped by a `setTimeout`. Timers do not survive a
reload, drift when the machine sleeps, leak on unmount, and disagree between
tabs. A comparison against the clock is correct in all of those cases and needs
no cleanup.

The cost is that nothing re-renders at the exact instant a market closes. A
single shared 30-second ticker drives the relative labels ("in 3h"), which is
also what flips the UI into its closed state within half a minute of the moment.
One interval for the whole app, not one per market.

The client check is a courtesy; `term_place_bet` is the gate. That is the split
already used for settlement in `term_resolve_market`, and it means a live-mode
user cannot buy into a closed market by moving their system clock.

## Data model

Add to `DeskMarket`:

```ts
closesAt?: number;   // epoch ms. Authoritative for private markets.
```

`closes: string` stays exactly as it is — the public board still uses it, and
old private markets fall back to it for display.

Schema:

```sql
alter table public.term_markets add column if not exists closes_at timestamptz;
```

`term_create_market` gains `p_closes_at timestamptz`. `rowToMarket` maps the
column to `closesAt` (ms) and leaves `closes` alone.

## Lifecycle

Three states, all derived. One exported function is the single source of truth:

```ts
export type MarketPhase = 'open' | 'closed' | 'settled';

export function marketPhase(m: DeskMarket, now = Date.now()): MarketPhase {
  if (m.resolved) return 'settled';
  if (m.closesAt != null && now >= m.closesAt) return 'closed';
  return 'open';
}
```

| Phase | Betting | Settling |
| --- | --- | --- |
| `open` | allowed | allowed |
| `closed` | rejected | allowed |
| `settled` | rejected | rejected (already settled) |

Settling is deliberately allowed while still `open`. If the outcome is known on
Thursday, the owner should not have to wait for Friday's close to pay people.

A market with no `closesAt` is `open` forever — the current behaviour, preserved
for markets created before this change.

## The picker

New component, `src/components/DateTimeField.tsx`. Presentational and
controlled: it takes `value: number | null` and `onChange(ms)`, and owns no
market knowledge.

**Trigger** — a button showing the formatted value ("Fri, Sep 4 · 11:59pm"),
with `aria-haspopup="dialog"` and `aria-expanded`.

**Popover** — three stacked regions:

1. **Presets**, all at 11:59pm local: Tonight (today), Tomorrow, Weekend, Next
   week (+7 days). One click for the common cases. Weekend means the coming
   Sunday, and the Sunday a week out when today is already Sunday — a preset
   never resolves to a time that has passed. Tonight is disabled once 11:59pm
   is behind us, which in practice means during the final minute of the day.
2. **Month grid** — weekday header, six-row grid, prev/next month. Days before
   today are disabled and not focusable.
3. **Time row** — hour, minute, and an AM/PM toggle.

**Keyboard** — arrows move by a day (up/down by a week), Enter selects, Escape
closes and returns focus to the trigger, Tab is trapped inside while open.
Click-outside closes.

**Styling** — built in-house rather than `<input type="date">`, for the reason
the odds slider stopped being a native range: the OS picker paints its own light
chrome and ignores the theme.

## Validation

A close is now **required**, defaulting to Tomorrow 11:59pm. Optional free text
is what produced markets that never end.

The picker cannot select a past day. Belt and braces, `createMarket` rejects a
`closesAt` at or before now, so a stale popover left open across midnight cannot
create an already-dead market.

## Existing data

- **Old private markets** have no `closesAt`. They read as `open` and display
  their old `closes` string. No dates are invented for them.
- **`SEED_CUSTOM` (EX-DEMO)** currently says `closes: 'Fri'`. It gets a real
  `closesAt` a few days out, computed at seed time like `seedActivity` already
  does, so a fresh desk demonstrates the feature.
- **Public board** unchanged.

## UI surfaces

| Surface | Change |
| --- | --- |
| Create form | Text input replaced by `DateTimeField` |
| Detail kicker | "closes Fri, Sep 4 · 11:59pm · in 3h", falling back to the old string when `closesAt` is absent |
| Detail | A `closed` banner when the phase is `closed`, telling the owner it is waiting on them |
| Settle box | Unchanged — still owner-only, still available in `open` and `closed` |
| List row | A `CLOSED` chip alongside the existing `SETTLED YES` chip |
| Action pane | On `closed`, the same treatment `settled` already gets: no ticket, an explanation |
| `TradeTicket` | Refuses to build an order when the phase is not `open` |
| `placeBet` | Rejects when the phase is not `open`, next to the existing `resolved` guard |

## Testing

Verified in the browser against the dev server, as with settlement:

1. Create with each preset; confirm the stored timestamp matches the label.
2. Create one closing about a minute out; confirm the row, detail and ticket all
   flip to closed within the ticker interval, without a reload.
3. Confirm a closed market refuses a bet but still settles, and pays correctly.
4. Confirm an old market with only free-text `closes` still renders and still
   takes bets.
5. Keyboard-only pass through the picker: open, move, select, escape.

## Out of scope

- Expiry on the public Markets board.
- Time zones beyond the browser's local zone.
- Reminders or notifications as a close approaches.
- Auto-settlement. The owner names the outcome; the app never guesses it from
  the price.
