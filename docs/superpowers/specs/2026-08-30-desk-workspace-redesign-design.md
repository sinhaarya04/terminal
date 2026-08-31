# E[X] Terminal — Split-Pane Workspace Redesign

**Date:** 2026-08-30
**Status:** Approved, ready for planning
**Brief:** `ex-ui-system` handoff kit (`UI-GUIDE.md`, `README.md`) — the E[X] design system extracted from the marketing site

---

## 1 · Problem

The terminal at `/terminal` already carries the E[X] design tokens — `src/styles/global.css`
opens with the kit's exact `:root` block, and `index.html` already loads IBM Plex Sans, IBM
Plex Mono and Newsreader. The palette is correct. What is wrong is everything downstream of it:

**The desk does not follow the system's own rules.**

| Rule in the brief | What the desk does |
|---|---|
| 3px corners; only dots and avatars round | 16px and 18px on cards, 14px on boards, 9–11px on pills, 22px on chips |
| Borders over fills; depth from border weight | `linear-gradient` fills on every card plus `0 30px 80px -30px` drop shadows |
| Red is a scalpel, never decorative | `.cat-tab.active` is a red fill; the primary button is solid red with white text |
| Monospace carries labels, numbers, metadata | Labels, categories and metadata are sans |
| `.btn-red` wipe is the signature interaction | Absent — buttons are flat fills with a `filter:brightness` hover |
| Enumerate transition properties | ~20 instances of bare `transition:.18s`, which is `transition:all` |

**The desk has no motion layer at all.** None of the kit's six transitions, no `Reveal`, no
`useInView`, no `useReducedMotion`, no motion tokens. `src/main.tsx` is 12 lines.

**`global.css` is 1404 lines, most of it dead.** It carries the entire marketing site —
carousel, poker portal, calendar, research, team headshots, ticker, FAQ, style lab, hero,
marketing nav and footer — while `src/App.tsx` routes only `/terminal`.

**The layout is a scrolling card grid, not a desk.** Tabs stack a category filter row, one
featured market, and a grid of rounded cards. It reads as a marketing page about markets
rather than an instrument for trading them.

## 2 · Decision

Rebuild the terminal as a **split-pane workspace**, applied **uniformly across all three
destinations**, styled in full compliance with the E[X] system, with the motion layer wired to
states that already exist.

Two alternatives were considered and rejected:

- **The Board** — a dense monospace exchange table with a detail rail. Highest information
  density and the most literal reading of "trading terminal", but rejected in favour of the
  split-pane's always-visible ticket.
- **Editorial terminal** — the current scroll with hero treatment and rules-separated lists.
  Prettiest single screenshot, smallest port, but least dense and it fights the brief's own
  "trading terminal" framing.

Within split-pane, a "workspace for Markets, full width for Positions and Personal" variant was
considered and rejected in favour of the uniform skeleton, for consistency.

## 3 · Architecture

### 3.1 The shell

A single component owns the geometry. All three destinations pour into it:

```tsx
<Workspace list={…} detail={…} action={…} />
```

`Workspace` implements the column grid *and* the responsive collapse exactly once, so the three
destinations cannot drift apart. Destinations supply panes and never learn which mode is active.

| Viewport | Layout |
|---|---|
| ≥1200px | rail · list · detail · action |
| 900–1199px | rail · list · detail; action slides over from the right |
| <900px | drill-down, one pane at a time; rail becomes a bottom tab bar |

Drill-down navigation on narrow screens: the list is the root screen, selecting a row pushes the
detail, acting pushes the action pane. Each pushed screen carries a back control. Selection state
is shared with the wide layout, so resizing across a breakpoint preserves what is selected.

### 3.2 Pane contents

| Destination | List | Detail | Action |
|---|---|---|---|
| **Markets** | Categories as collapsible groups; events within | Multi-line chart, outcome rows, news blurb | Trade ticket |
| **Positions** | Open positions, P&L per row | Position chart, entry vs. mark, cost vs. value | Close-out ticket |
| **Personal** | `＋ New market` row, your markets, join-by-code pinned at the bottom | Selected market — or the create form when `＋ New` is selected | Share code with copy — or a bet ticket |

The Personal mapping is what makes a uniform skeleton honest rather than contrived: **`＋ New
market` is a list row like any other.** Selecting it swaps the detail pane to the create form;
submitting fills the action pane with the generated share code. This is a genuine
list → detail → act loop.

### 3.3 File layout

New and moved:

```
src/desk/
  DeskTerminal.tsx              owns which destination is active; renders Rail + Workspace
  Workspace.tsx                 3-pane skeleton, breakpoint mode and drill-down state
  Rail.tsx                      destinations, balance, account menu

  markets/MarketsList.tsx       collapsible category groups
  markets/MarketDetail.tsx      chart, outcomes, news
  markets/TradeTicket.tsx       docked ticket — replaces the BetTicket modal

  positions/PositionsList.tsx
  positions/PositionDetail.tsx
  positions/CloseTicket.tsx

  personal/PersonalList.tsx     your markets, ＋ New, join-by-code
  personal/PersonalDetail.tsx   market detail or create form
  personal/PersonalAction.tsx   share code or bet ticket

src/lib/useInView.ts            verbatim from the kit
src/lib/useReducedMotion.ts     verbatim from the kit
src/components/Reveal.tsx       verbatim from the kit
```

Unchanged and reused: `MultiLineChart.tsx`, `DeskSpark.tsx`, `marketsData.ts`, `deskStore.ts`,
`terminalDb.ts`, `BrandLockup.tsx`.

Restyled in place: `DeskSignIn.tsx`, `DeskIntro.tsx`, `Desk.tsx`.

Deleted once superseded: `DeskMarkets.tsx`, `DeskPositions.tsx`, `DeskPersonal.tsx` and
`BetTicket.tsx`. Their markup is redistributed into the pane components above; `BetTicket`'s
sizing and payout logic moves into `markets/TradeTicket.tsx` rather than being rewritten.

### 3.4 The modal is removed

`BetTicket` stops being a modal and becomes `TradeTicket` in the action pane. It keeps its
existing math unchanged: price from side, shares from amount ÷ price, max payout, balance-after,
and the `tooMuch` guard against balance. On viewports below 900px it reappears as a bottom sheet.

## 4 · Styling

### 4.1 Compliance rules applied throughout

- Radius `3px` everywhere; `50%` only on outcome dots and status dots.
- Surfaces transparent with `1px solid var(--border)`. No gradient fills, no drop shadows.
  Depth comes from border weight and `--bg2` shifts.
- `--red` for borders and fills only; `--red-bright` for text and eyebrows only.
- Red restricted to: the live marker, the active-destination rule, the primary button, and the
  `.kicker` rule. Nothing decorative is red.
- Mono (`--mono`) on every label, number, code, category and timestamp. Sans on prose only.
- `.kicker` (mono caps preceded by a 24px red rule) as the pane header treatment.
- `.btn-red` and its left-origin wipe restored on every primary action.
- Every bare `transition:<duration>` replaced with enumerated properties.

### 4.2 Stylesheets

`src/styles/global.css` is reduced from 1404 lines to approximately 150: the `:root` token
block, reset, base body and background, `.wrap`/`.wrap-wide`, `.kicker`, `.h-sec`, `.lead`,
`.mono`, `.btn`/`.btn-red`, focus-visible. Everything belonging to the marketing site is deleted.

```
src/styles/
  global.css                 foundation only
  desk/workspace.css         shell, rail, panes, responsive modes
  desk/panes.css             list rows, detail surfaces, ticket
  motion/_root.css           duration and easing tokens — imported first
  motion/accordion.css
  motion/skeleton.css
  motion/nav-menu.css
  motion/number.css
  motion/error-shake.css
  motion/success.css
```

Import order in `src/main.tsx`: `global.css`, then `motion/_root.css`, then the six motion
sheets, then the desk sheets. Motion sheets load after `global.css` so their scoped rules win at
equal specificity.

## 5 · Motion

Each transition attaches to a state that already exists in the codebase. No transition is added
without a real trigger.

| Transition | Trigger |
|---|---|
| Skeleton | `Desk.tsx:41` — the `checking` blank div during the Supabase session check; also `hydrateLive`'s three parallel fetches |
| Error shake | `TradeTicket` "Not enough credits"; failed `joinByCode`; magic-link failure in `DeskSignIn` |
| Success check | `placeBet` resolving true; `createMarket` revealing the share code |
| Number pop-in | Rail balance after a bet settles — fired once on the final value, never per frame |
| Dropdown | The account menu; the action pane's slide-over at 900–1199px |
| Accordion | Category groups in `MarketsList` |

### 5.1 Deliberate omissions

**Lenis is not ported.** A fixed workspace does not scroll as a page, so inertial scroll has
nothing to act on, and the brief documents that it silently disables `window.scrollTo()` and
`element.scrollIntoView()` app-wide. The kit lists it as optional and last.

**`Reveal` is scoped, not universal.** It wraps the sign-in page and the mobile drill-down
screens, where there is genuine scroll. Inside the wide workspace every pane is already in view
on mount, so panes use a short staggered mount animation instead of an IntersectionObserver.
Applying scroll-triggered reveal to always-visible panes risks the documented failure mode where
`.reveal` without `.in` leaves content invisible but present.

### 5.2 Known traps to respect

Taken from the brief's paid-for-lessons section; each must hold in the implementation:

- Accordion height animates `grid-template-rows: 0fr → 1fr` with padding on the **inner**
  element, never on the track.
- Replayable animations force reflow with `void el.offsetWidth` between class removal and
  re-add.
- The error shake uses a monotonic nonce so an identical repeated error still fires;
  `.is-error` and `.is-shaking` stay orthogonal.
- The action pane's slide-over uses a four-phase state machine (`closed`/`pre`/`open`/`closing`)
  with a double `requestAnimationFrame` on open, so it animates out before unmounting.
- Number pop-in fires once on the final settle, not per frame or per digit.
- Any `stroke-dasharray` on the success check is measured via `Math.ceil(path.getTotalLength()) + 1`,
  never a copied placeholder.
- Digits split into spans carry `role="img"` and `aria-label` on the container.

## 6 · Scope boundary

**No business logic changes.** `deskStore.ts`, `terminalDb.ts`, `marketsData.ts` and the Supabase
schema in `supabase/terminal-schema.sql` are untouched. Bet math, balance handling, position
valuation, persistence, share codes, and guest-vs-live mode behave exactly as they do today.
This work is presentation and component structure only.

Explicitly out of scope: adding a test runner, changing the data model, altering authentication,
touching `.env` handling, and resolving the four `npm audit` advisories.

## 7 · Verification

The repository has no test runner and none is added as part of a UI change. Verification is:

1. `npx tsc -b` and `npm run build` both clean.
2. The app driven in a real, foreground Chrome at three widths — ≥1200px, ~1000px, and ~390px —
   exercising: select a market, place a bet, view the position, close it, create a market, copy
   the share code, join by code, fail a join, and overspend the balance to trigger the shake.
3. OS reduced motion enabled, app reloaded: everything legible and usable, all shakes and slides
   resolving to a motionless end state.
4. The brief's pre-ship checklist walked in full — collapsed panels carry `inert`, disclosure
   toggles are real buttons with `aria-expanded` and `aria-controls`, errors keep `role="alert"`,
   success keeps `role="status"`, decorative SVG is `aria-hidden`, focus is visible on near-black,
   and no `transition: all` survives.

A green build proves nothing about whether the motion looks right; step 2 is the real gate. Note
that a backgrounded tab freezes CSS transitions at their start value, so any "stuck at zero"
reading must be confirmed by setting `transition:none` and re-reading the computed value before
being treated as a bug.
