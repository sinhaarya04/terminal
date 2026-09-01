# The board on the hybrid engine — design

**Date:** 2026-09-01 (overnight, autonomous — decisions made without user gates
by instruction; review before merge)
**Branch:** `board-engine`. Nothing here touches main.

## Problem

The Personal tab runs the hybrid engine end to end. The public Markets board
half-does: since the engine landed, `placeBet` prices board bets through the
same LMSR meter (guest mode seeds from the displayed price; live mode calls the
same RPC) — but the board's *display* is static sample data. Trades move real
money and real meters while the cards, list rows, detail ladders and charts
keep showing `marketsData.ts` fictions. And in live mode,
`term_upsert_public_market` materialises board outcomes with **unseeded**
pricing quantities, so the first bet on an "82%" outcome fills at 50/50 odds.

## Decisions

| Question | Decision |
| --- | --- |
| Multi-outcome events | Stay independent binary markets per outcome (`EV:Outcome`), Polymarket-style. A shared N-outcome pot is the club notes' Phase-7 item, not this. |
| Source of truth for board prices | The store. Static `EVENTS` are seeds; anywhere an outcome has a live market in state, its price overlays the seed and the chart's last point follows it. |
| Live seeding | `term_upsert_public_market` seeds `pq_*`/`c0` from the card's price at materialisation, same as private creation. Signature unchanged; no existing rows affected (there are zero public rows in the DB today — verified). Applied to the shared project because the *deployed* client already calls this RPC and currently gets mispriced fills; everything else stays on the branch. |
| Wallet | Board bets stay PUB (already enforced server-side). |
| Board resolution | Out of scope. Board outcomes have no owner, so nothing can resolve them; selling is the exit. Officer/admin resolution is a group decision — flagged in the report. |
| "It works with load" | Demonstrated against the real RPCs: parallel bets on one market must serialise via the row lock and conserve exactly (the club notes' concurrency test), verified by SQL audit afterwards. |

## Changes

1. `useBoardEvents()` — overlays store market state onto `EVENTS` by outcome id.
2. `DeskTerminal` holds the selected **event id**, not an event snapshot, so the
   open market screen re-renders with live prices after every trade.
3. `MarketsGrid` takes events as a prop.
4. `TradeTicket` quotes from the **store's** copy of a market when one exists —
   a staged snapshot made every bettor look like 100% of the pot.
5. `MarketScreen` polls the staged outcome on the shared 30s tick, like the
   personal detail pane does.
6. DB: seeded upsert (above).

## Testing

- Existing 22 engine invariants stay green.
- Guest-mode browser E2E on the sample board: bet moves the card, the list row,
  the ladder and the chart; ticket quotes engine shares; sell exits.
- Live-mode load test: 20 parallel bets, then 10 parallel bets racing 10
  parallel sells, on a throwaway PRIVATE market (same RPC path, keeps junk off
  the public board), then a SQL audit: pool == Σcost, sq == Σshares, wallet
  delta == −Σcost, meter state consistent with a serial replay. Settle the
  market afterwards to return the play money.
