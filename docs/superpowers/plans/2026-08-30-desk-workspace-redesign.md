# E[X] Terminal Split-Pane Workspace — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/terminal` as a split-pane workspace — rail, list, detail, action — in full compliance with the E[X] design system, with the kit's six motion transitions wired to states that already exist.

**Architecture:** One `Workspace` component owns the column grid, breakpoints and drill-down state; three destinations (Markets, Positions, Personal) each supply `list`/`detail`/`action` panes into it. `global.css` is purged from 1404 lines to a ~150-line foundation; desk styling moves to `styles/desk/*.css` and motion to one stylesheet per transition. No business logic changes.

**Tech Stack:** React 19 · Vite 8 · TypeScript 6 · plain CSS (no Tailwind, no CSS-in-JS) · react-router-dom 7

**Spec:** `docs/superpowers/specs/2026-08-30-desk-workspace-redesign-design.md`

**Branch:** `desk-workspace-redesign` (already checked out; `main` is clean at `29035a2`)

---

## Verification model — read this before Task 1

This repository has **no test runner**, and the approved spec explicitly scopes out adding one:
a UI redesign is not the place to introduce a test framework. `package.json` has exactly three
scripts — `dev`, `build`, `preview`. Do not invent a test suite, and do not write assertions
against a framework that is not installed.

Every task below therefore verifies through three real gates:

| Gate | Command | Passing means |
|---|---|---|
| **Types** | `npx tsc -b` | Exit 0, no output |
| **Build** | `npm run build` | Exit 0, `dist/` written |
| **Browser** | `npm run dev`, then drive `http://localhost:5173/terminal` | The named interaction works and looks right |

The browser gate is the real one. A green build proves nothing about whether a transition looks
correct. Where a task says "drive it", actually click through the named flow in a **foreground**
browser window.

**Trap:** a backgrounded tab reports `visibilityState === 'hidden'`, stops running
`requestAnimationFrame`, and freezes CSS transitions at their *start* value. Correct code will
read as "stuck at zero". Before reporting any animation bug, set `transition:none` on the element
and re-read the computed value — if it snaps to the correct end state, the CSS is fine and the
tab was backgrounded.

**Guest mode is the test account.** The app runs fully without Supabase env vars
(`src/lib/supabase.ts` leaves the client `null`). Sign in via the guest handle field on
`/terminal`; every flow below works in guest mode against `localStorage`.

---

## Motion stylesheet API — authoritative, harvested after Task 1

The kit's transition sheets use a `t-` prefix throughout. **An earlier draft of this plan guessed
selector names like `.panel`, `.is-pop`, `.success-tick` and `.is-shaking`; those were wrong.**
These are the real names, read from the files after they were copied in Task 1. A wrong selector
produces an animation that silently never fires, so use only what is listed here.

| Sheet | Selectors | Keyframes |
|---|---|---|
| `accordion.css` | `.t-acc` with `data-open="true"`, `.t-acc-panel`, `.t-acc-panel-inner`, `.t-acc-chevron` | — |
| `error-shake.css` | `.t-input`, `.t-input.is-error`, `.t-input.is-shaking`, `.t-input-wrap.is-error`, `.t-error-msg` | `t-input-shake` |
| `nav-menu.css` | `.t-dropdown`, `.t-dropdown.is-open`, `.t-dropdown.is-closing`, `data-origin="top-right\|top-center\|bottom-left\|bottom-center\|bottom-right"` | — |
| `number.css` | `.t-digit-group`, `.t-digit`, `.t-digit-group.is-animating`, `data-stagger="1\|2"` | `t-digit-pop-in` |
| `skeleton.css` | `.t-skel`, `.t-skel-skeleton`, `.t-skel-content`, `.t-skel.is-revealed`, `.t-skel.is-resetting`, `.t-skel-skeleton.is-pulsing` | `t-skel-pulse` |
| `success.css` | `.t-success-check`, `.t-success-check[data-state="in"]` | `t-check-draw`, `t-check-fade`, `t-check-rotate`, `t-check-blur`, `t-check-bob` |
| `_root.css` | `:root` custom properties only — durations, easings, and per-component tunables (`--acc-*`, `--digit-*`, `--check-*`) | — |

**Two things to know about these files:**

- Each sheet also carries a *bridge layer* targeting the original marketing site — `.cal-skel`
  in `skeleton.css`, `.wl-check`/`.wl-done` in `success.css`, `.faq-item`/`.faq-summary` in
  `accordion.css`, `.auth-input` in `error-shake.css`, `.stat` in `number.css`. Those hooks do
  not exist in this app's markup and the rules are inert. Leave them alone; do not wire the
  desk to them.
- Three sheets (`accordion.css`, `number.css`, `skeleton.css`) have their
  `prefers-reduced-motion` block **mid-file**, not at the end, because a project bridge layer
  follows it. That is fine — the block exists and applies. Task 15 checks that each sheet
  *contains* one, not that it ends with one.

## File Structure

**Created:**

| Path | Responsibility |
|---|---|
| `src/lib/useInView.ts` | IntersectionObserver hook; fires once then unobserves |
| `src/lib/useReducedMotion.ts` | Tracks `prefers-reduced-motion`, lazy-initialised |
| `src/components/Reveal.tsx` | Scroll-reveal wrapper; used on sign-in and mobile only |
| `src/desk/Workspace.tsx` | 3-pane grid, breakpoint mode, drill-down state |
| `src/desk/Rail.tsx` | Destination switcher, balance, account menu |
| `src/desk/markets/MarketsList.tsx` | Category groups (collapsible), event rows |
| `src/desk/markets/MarketDetail.tsx` | Multi-line chart, outcome rows, news blurb |
| `src/desk/markets/TradeTicket.tsx` | Docked ticket; inherits `BetTicket`'s math verbatim |
| `src/desk/positions/PositionsList.tsx` | Open positions with per-row P&L |
| `src/desk/positions/PositionDetail.tsx` | Position chart, entry vs. mark |
| `src/desk/positions/CloseTicket.tsx` | Close-out sizing and confirm |
| `src/desk/personal/PersonalList.tsx` | `＋ New market` row, your markets, join-by-code |
| `src/desk/personal/PersonalDetail.tsx` | Selected market, or the create form |
| `src/desk/personal/PersonalAction.tsx` | Share code + copy, or a bet ticket |
| `src/styles/desk/workspace.css` | Shell, rail, pane chrome, responsive modes |
| `src/styles/desk/panes.css` | List rows, detail surfaces, ticket |
| `src/styles/motion/_root.css` | Duration + easing tokens (from kit) |
| `src/styles/motion/{accordion,skeleton,nav-menu,number,error-shake,success}.css` | One per transition (from kit) |

**Modified:** `src/main.tsx` (imports), `src/desk/DeskTerminal.tsx` (rewritten as shell), `src/styles/global.css` (purged), `src/desk/DeskSignIn.tsx`, `src/desk/DeskIntro.tsx`, `src/pages/Desk.tsx`.

**Deleted (Task 7, once superseded):** `src/desk/DeskMarkets.tsx`, `src/desk/DeskPositions.tsx`, `src/desk/DeskPersonal.tsx`, `src/desk/BetTicket.tsx`.

**Untouched:** `deskStore.ts`, `terminalDb.ts`, `marketsData.ts`, `MultiLineChart.tsx`, `DeskSpark.tsx`, `BrandLockup.tsx`, `supabase/terminal-schema.sql`.

---

## Task 1: Motion foundation — hooks, Reveal, motion tokens

Purely additive. Nothing renders differently at the end of this task; it installs the pieces
every later task depends on.

**Files:**
- Create: `src/lib/useInView.ts`, `src/lib/useReducedMotion.ts`, `src/components/Reveal.tsx`
- Create: `src/styles/motion/_root.css` and six transition sheets (copied from the kit)
- Modify: `src/main.tsx`

- [ ] **Step 1: Extract the kit to a stable temp location**

```bash
rm -rf /tmp/ex-ui-system && unzip -q ~/Desktop/ex-ui-system.zip -d /tmp && ls /tmp/ex-ui-system/styles/motion/
```

Expected: `_root.css  accordion.css  error-shake.css  nav-menu.css  number.css  skeleton.css  success.css`

- [ ] **Step 2: Copy the motion stylesheets verbatim**

These are production CSS from the kit. Copy them; do not retype them.

```bash
mkdir -p src/styles/motion
cp /tmp/ex-ui-system/styles/motion/*.css src/styles/motion/
ls src/styles/motion/
```

- [ ] **Step 3: Create `src/lib/useInView.ts`**

```ts
import { useEffect, useRef, useState } from 'react';

export function useInView<T extends HTMLElement>(threshold = 0.15) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setInView(true); io.unobserve(e.target); } },
      { threshold }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return { ref, inView };
}
```

- [ ] **Step 4: Create `src/lib/useReducedMotion.ts`**

The lazy initialiser matters: seeding `useState(false)` would flash one animated frame before
the effect corrects it.

```ts
import { useEffect, useState } from 'react';

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}
```

- [ ] **Step 5: Create `src/components/Reveal.tsx`**

```tsx
import type { ReactNode } from 'react';
import { useInView } from '../lib/useInView';
import { useReducedMotion } from '../lib/useReducedMotion';

export default function Reveal({
  children, className = '', id,
}: { children: ReactNode; className?: string; id?: string }) {
  const reduced = useReducedMotion();
  const { ref, inView } = useInView<HTMLDivElement>(0.12);
  const on = reduced || inView;   // reduced motion ⇒ render revealed immediately
  return (
    <div ref={ref} id={id} className={`reveal ${on ? 'in' : ''} ${className}`}>
      {children}
    </div>
  );
}
```

- [ ] **Step 6: Wire the motion sheets into `src/main.tsx`**

Motion sheets must load **after** `global.css` so their scoped rules win at equal specificity,
and `_root.css` must come before the sheets that reference its tokens.

Replace the import block at the top of `src/main.tsx`:

```ts
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/global.css';
import './styles/motion/_root.css';
import './styles/motion/accordion.css';
import './styles/motion/skeleton.css';
import './styles/motion/nav-menu.css';
import './styles/motion/number.css';
import './styles/motion/error-shake.css';
import './styles/motion/success.css';
```

Leave the rest of the file (the `scrollRestoration` line and the `createRoot` call) unchanged.

- [ ] **Step 7: Add the `.reveal` rules to `src/styles/global.css`**

Append to the end of the file for now; Task 2 relocates it into the foundation block.

```css
.reveal{opacity:0;transform:translateY(22px);
  transition:opacity .7s ease,transform .7s ease}
.reveal.in{opacity:1;transform:none}
```

- [ ] **Step 8: Verify types and build**

```bash
npx tsc -b && npm run build
```

Expected: both exit 0. `Reveal` is unused so far — that is fine, it is a component export, not an
unused local.

- [ ] **Step 9: Verify no visual change**

Run `npm run dev`, open `http://localhost:5173/terminal`, sign in as a guest. The desk must look
**exactly** as it did before this task. If anything shifted, a motion sheet is leaking global
rules — check which one by commenting imports out one at a time.

- [ ] **Step 10: Commit**

```bash
git add src/lib/useInView.ts src/lib/useReducedMotion.ts src/components/Reveal.tsx src/styles/motion src/main.tsx src/styles/global.css
git commit -m "feat: add motion foundation — hooks, Reveal, motion tokens and transition sheets"
```

---

## Task 2: Purge `global.css` to a foundation sheet

`global.css` is 1404 lines carrying the entire marketing site, but `src/App.tsx` routes only
`/terminal`. This task deletes the dead weight **with no visual change** to the desk.

**Files:**
- Modify: `src/styles/global.css` (1404 lines → ~150)

- [ ] **Step 1: Record what the desk actually uses**

Before deleting anything, capture the class list the desk renders, so the purge is evidence-based
rather than guesswork:

```bash
grep -rhoE 'className=\{?["`][^"`]+["`]' src/desk src/pages src/components \
  | grep -oE '[a-z][a-z0-9-]+' | sort -u > /tmp/used-classes.txt
wc -l /tmp/used-classes.txt && cat /tmp/used-classes.txt
```

Note the template-literal class names (`desk-tabbtn ${...}`) — the grep catches the static parts.
Also check dynamic ones by hand: `is-yes`, `is-no`, `active`, `live`, `big`, `sm`.

- [ ] **Step 2: Keep these sections, delete everything else**

Keep, in this order: the `:root` token block (lines 1–17), the reset, `body` + `body::before`,
`::selection`, `a`, `:focus-visible`, `svg`, `.mono`, `.wrap`, `.wrap-wide`, `.glass`, `.glow`,
`.brand` and its children, the `.about-fluid`/`.blob` fluid background block, `.is-yes`/`.is-no`,
and the `.reveal` rules added in Task 1.

Delete every section between the `/* ---------- nav ---------- */` marker and the
`/* ---- sign-in ---- */` marker **except** the `.about-fluid` fluid-background block and
`.brand` rules, plus all of: hero, feature tiles, stats, cycling source panel, split, footer,
sign-up glow button, who-we-are, recruiting, leadership grids, mock terminal window, market
board, poker, style lab, Research, Calendar, curved-arc carousel, ticker divider, how-a-market-
works, FAQ, magic-link login form.

The desk blocks from `/* ---- sign-in ---- */` (line 1147) to end-of-file stay for now; Tasks 4–7
replace them.

- [ ] **Step 3: PRESERVE the kit primitives that already exist**

⚠️ **Correction to an earlier draft of this plan.** `.kicker`, `.kicker::before`, `.h-sec` and
`.lead` are **already defined** in `global.css` at lines 78–83, and `.wrap`/`.wrap-wide` at
lines 31–32. They sit inside the marketing `/* ---------- sections ---------- */` block that
this task otherwise deletes, and nothing in the app currently renders them — which is exactly
why they look like dead code and are easy to delete by accident.

**Do not re-add them, and do not delete them.** Move these six rules up into the foundation
block, immediately after `.wrap-wide`, then delete the rest of the section around them:

```bash
sed -n '31,32p;78,79p;82,83p' src/styles/global.css
```

Confirm that prints `.wrap`, `.wrap-wide`, `.kicker`, `.kicker::before`, `.h-sec` and `.lead`
before you cut anything. Re-adding them from the kit instead would leave two competing
definitions in the same sheet.

- [ ] **Step 4: Verify the line count dropped and the build is clean**

```bash
wc -l src/styles/global.css && npx tsc -b && npm run build
```

Expected: roughly 400–450 lines (foundation ~150 plus the desk block still awaiting Tasks 4–7),
both commands exit 0.

- [ ] **Step 5: Verify no visual change**

Run the dev server and compare `/terminal` against a screenshot taken before this task. Sign-in
card, intro, board, positions and personal tabs must all be pixel-identical. **If something lost
its styling, you deleted a rule the desk uses** — find it in `/tmp/used-classes.txt` and restore
that block.

- [ ] **Step 6: Commit**

```bash
git add src/styles/global.css
git commit -m "refactor: purge marketing CSS from global.css, add missing kit primitives"
```

---

## Task 3: Foundation compliance — buttons, radius, transitions

Bring the surviving foundation into line with the system's rules before building anything new on
top of it.

**Files:**
- Modify: `src/styles/global.css`

- [ ] **Step 1: REPAIR the existing `.btn` and `.btn-red` — do not re-add them**

⚠️ **Correction to an earlier draft of this plan.** `.btn`, `.btn-red` and the wipe pseudo
**already exist** in `global.css` at lines 89–94, and the wipe is correct. What was actually
missing is that *the desk never uses them* — `DeskSignIn`, `BetTicket` and `DeskPersonal` all
use `.desk-btn`, a solid red fill with white text. So this step repairs three real defects in
the existing rules rather than writing new ones:

1. `.btn` carries `transition:all .16s` — the single `transition:all` in the codebase, and a
   pre-ship checklist violation.
2. `.btn` has no `cursor`, `font-family` or `background`, so it inherits UA button chrome when
   used on a real `<button>` (it was only ever used on `<Link>` elements in the marketing site).
3. There is no disabled state, and every ticket button in this redesign has one.

Replace lines 89–94 with:

```css
.btn{display:inline-flex;align-items:center;justify-content:center;
  border-radius:3px;padding:13px 28px;font-size:15px;font-weight:500;
  border:1px solid transparent;letter-spacing:.01em;cursor:pointer;
  font-family:var(--font);background:transparent;
  transition:color .16s ease,border-color .16s ease}

.btn-red{position:relative;overflow:hidden;z-index:0;background:transparent;
  border-color:var(--red);color:var(--red-bright)}
.btn-red::before{content:"";position:absolute;inset:0;z-index:-1;
  background:var(--red);transform:scaleX(0);transform-origin:left;
  transition:transform .3s cubic-bezier(.4,.7,.3,1)}
.btn-red:hover::before{transform:scaleX(1)}
.btn-red:hover{color:#08090d}
.btn:disabled{opacity:.4;cursor:not-allowed}
.btn:disabled::before{transform:scaleX(0)}

@media(prefers-reduced-motion:reduce){
  .btn-red::before{transition:none}
}
```

Leave `.btn-ghost`/`.btn-min` (lines 96–101) deleted by Task 2 — nothing renders them.

Do **not** wrap `.btn-red` in any container that resets `overflow`, `border` or stacking context —
the wipe depends on `overflow:hidden` plus the negative-z pseudo, and a normalising wrapper kills
the animation silently while the button keeps working.

- [ ] **Step 2: Normalise radius in the foundation**

In the blocks you kept, change `.glass{border-radius:6px}` to `border-radius:3px`. Leave
`border-radius:50%` wherever it applies to a dot or an avatar. No other radius value may survive
in the foundation block.

```bash
grep -n "border-radius" src/styles/global.css | grep -v "50%" | grep -v "3px"
```

Expected after the edit: only matches inside the desk block below line ~400, which Tasks 4–7
replace.

- [ ] **Step 3: Enumerate transition properties in the foundation**

A `transition` with only a duration means `transition: all`, which the pre-ship checklist forbids.
In the kept blocks, replace every bare form. For example `.glow`'s transition is already
enumerated and stays as-is; check for others:

```bash
grep -nE "transition:\s*(all|[.0-9]+s)" src/styles/global.css
```

Rewrite each hit to name its properties, e.g. `transition:color .15s ease` rather than
`transition:.15s`.

- [ ] **Step 4: Verify the wipe animates**

Build and drive it:

```bash
npx tsc -b && npm run build && npm run dev
```

In the browser, temporarily add `className="btn btn-red"` to the guest sign-in button in
`src/desk/DeskSignIn.tsx`, hover it, and confirm a red panel wipes in from the **left** and the
label flips to near-black. Revert that temporary change before committing — Task 14 restyles
sign-in properly.

- [ ] **Step 5: Commit**

```bash
git add src/styles/global.css
git commit -m "feat: restore .btn-red wipe, normalise radius and enumerate transitions"
```

---

## Task 4: The workspace shell + Markets panes

The largest task. It delivers `Workspace`, `Rail`, and the three Markets panes — Markets is the
proof the skeleton works. Positions and Personal keep rendering their existing components in the
detail slot until Tasks 5 and 6 replace them.

**Files:**
- Create: `src/desk/Workspace.tsx`, `src/desk/Rail.tsx`
- Create: `src/desk/markets/MarketsList.tsx`, `MarketDetail.tsx`, `TradeTicket.tsx`
- Create: `src/styles/desk/workspace.css`
- Modify: `src/desk/DeskTerminal.tsx`, `src/main.tsx`

- [ ] **Step 1: Create `src/desk/Workspace.tsx`**

`Workspace` owns geometry and nothing else. Destinations supply panes and never learn which mode
is active. The `mode` value drives both the CSS grid and the drill-down.

```tsx
import { useEffect, useState, type ReactNode } from 'react';

export type PaneKey = 'list' | 'detail' | 'action';
type Mode = 'wide' | 'mid' | 'narrow';

function readMode(): Mode {
  const w = window.innerWidth;
  if (w >= 1200) return 'wide';
  if (w >= 900) return 'mid';
  return 'narrow';
}

export function useWorkspaceMode(): Mode {
  const [mode, setMode] = useState<Mode>(readMode);
  useEffect(() => {
    const on = () => setMode(readMode());
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return mode;
}

export default function Workspace({
  list, detail, action, focus, onFocus,
}: {
  list: ReactNode;
  detail: ReactNode;
  action: ReactNode;
  focus: PaneKey;                    // which pane the user is on in narrow mode
  onFocus: (p: PaneKey) => void;
}) {
  const mode = useWorkspaceMode();

  if (mode === 'narrow') {
    const back: Record<PaneKey, PaneKey | null> = { list: null, detail: 'list', action: 'detail' };
    const prev = back[focus];
    return (
      <div className="ws ws-narrow">
        {prev && (
          <button className="ws-back" onClick={() => onFocus(prev)}>
            ← {prev === 'list' ? 'Markets' : 'Detail'}
          </button>
        )}
        <div className="ws-pane ws-pane-solo">
          {focus === 'list' ? list : focus === 'detail' ? detail : action}
        </div>
      </div>
    );
  }

  return (
    <div className={`ws ws-${mode}`}>
      <div className="ws-pane ws-list">{list}</div>
      <div className="ws-pane ws-detail">{detail}</div>
      <div className="ws-pane ws-action">{action}</div>
    </div>
  );
}
```

In `mid` mode the action pane is positioned as a slide-over by CSS (Step 4). Task 13 adds its
four-phase open/close state machine; for now it is simply present.

- [ ] **Step 2: Create `src/desk/Rail.tsx`**

```tsx
import { Link } from 'react-router-dom';
import BrandLockup from '../components/BrandLockup';
import { useDesk, signOut, money } from './deskStore';
import { supabase } from '../lib/supabase';

export type Destination = 'Markets' | 'Positions' | 'Personal';
export const DESTINATIONS: Destination[] = ['Markets', 'Positions', 'Personal'];

export default function Rail({
  active, onChange,
}: { active: Destination; onChange: (d: Destination) => void }) {
  const { user, balance, positions, live } = useDesk();

  const doSignOut = () => {
    if (live && supabase) supabase.auth.signOut(); // listener calls exitLive()
    else signOut();
  };

  return (
    <nav className="rail" role="tablist" aria-label="Workspace">
      <Link to="/" className="rail-brand" aria-label="Back to E[X]"><BrandLockup /></Link>

      <div className="rail-dests">
        {DESTINATIONS.map((d) => (
          <button
            key={d}
            role="tab"
            aria-selected={active === d}
            className={`rail-dest ${active === d ? 'is-on' : ''}`}
            onClick={() => onChange(d)}
          >
            {d}
            {d === 'Positions' && positions.length > 0 && (
              <em className="rail-badge mono">{positions.length}</em>
            )}
          </button>
        ))}
      </div>

      <div className="rail-foot">
        <span className="rail-bal mono">{money(balance)}</span>
        <span className="rail-user mono">@{user?.handle}</span>
        <button className="rail-signout" onClick={doSignOut}>Sign out</button>
      </div>
    </nav>
  );
}
```

- [ ] **Step 3: Create `src/desk/markets/MarketsList.tsx`**

Categories become groups. This task renders them always-open; Task 12 makes them collapse.

```tsx
import { CATEGORIES, EVENTS, type Category, type MarketEvent } from '../marketsData';

export default function MarketsList({
  selectedId, onSelect,
}: { selectedId: string | null; onSelect: (ev: MarketEvent) => void }) {
  const groups: { cat: Category; items: MarketEvent[] }[] = CATEGORIES
    .map((cat) => ({ cat, items: EVENTS.filter((e) => e.cat === cat) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="pane-body">
      <div className="kicker">Markets</div>
      {groups.map(({ cat, items }) => (
        <section className="grp" key={cat} data-open="true">
          <h3 className="grp-h mono">{cat}<span className="grp-n">{items.length}</span></h3>
          <div className="grp-items">
            {items.map((ev) => (
              <button
                key={ev.id}
                className={`li ${selectedId === ev.id ? 'is-on' : ''}`}
                onClick={() => onSelect(ev)}
              >
                <em className="li-code mono">{ev.id}{ev.live && <i className="li-live" />}</em>
                <span className="li-q">{ev.title}</span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Create `src/desk/markets/MarketDetail.tsx`**

```tsx
import MultiLineChart from '../MultiLineChart';
import type { MarketEvent, Outcome } from '../marketsData';
import type { Side } from '../deskStore';

const vol = (n: number) =>
  (n >= 1000 ? (n / 1000).toFixed(1) + 'K' : String(n));

export default function MarketDetail({
  ev, onPick,
}: { ev: MarketEvent | null; onPick: (o: Outcome, side: Side) => void }) {
  if (!ev) {
    return (
      <div className="pane-body pane-empty">
        <p className="mono">No market selected</p>
        <p className="pane-empty-sub">Pick one from the list to see its chart and trade it.</p>
      </div>
    );
  }

  const top = [...ev.outcomes].sort((a, b) => b.yes - a.yes).slice(0, 5);

  return (
    <div className="pane-body">
      <div className="kicker">{ev.cat}{ev.live ? ' · Live' : ''} · {ev.updated}</div>
      <h2 className="detail-h">{ev.title}</h2>

      <div className="detail-legend mono">
        {top.slice(0, 3).map((o) => (
          <span className="leg" key={o.name}>
            <span className="dot" style={{ background: o.color }} />{o.name} <b>{o.yes}%</b>
          </span>
        ))}
      </div>

      <MultiLineChart outcomes={top} />

      <div className="detail-outcomes">
        {ev.outcomes.map((o) => (
          <div className="oc" key={o.name}>
            <span className="oc-name">
              <span className="dot" style={{ background: o.color }} />
              {o.meta && <span className="oc-meta mono">{o.meta}</span>}
              {o.name}
            </span>
            <button className="oc-p is-yes mono" onClick={() => onPick(o, 'YES')}>Y {o.yes}</button>
            <button className="oc-p is-no mono" onClick={() => onPick(o, 'NO')}>N {100 - o.yes}</button>
          </div>
        ))}
      </div>

      {ev.news && (
        <div className="detail-news">
          <span className="detail-news-mark" aria-hidden="true">◉</span>
          <p>{ev.news}</p>
        </div>
      )}
      <div className="detail-vol mono">VOL {vol(ev.vol)}</div>
    </div>
  );
}
```

- [ ] **Step 5: Create `src/desk/markets/TradeTicket.tsx`**

The math is lifted from `BetTicket.tsx` unchanged — price from side, shares from amount ÷ price,
max payout, balance-after, and the `tooMuch` guard. Only the chrome changes: docked pane instead
of modal, no backdrop, no close button.

```tsx
import { useState } from 'react';
import { placeBet, money, useDesk, type DeskMarket, type Side } from '../deskStore';

export default function TradeTicket({
  market, side, onSide, onDone,
}: {
  market: DeskMarket | null;
  side: Side;
  onSide: (s: Side) => void;
  onDone: () => void;
}) {
  const { balance } = useDesk();
  const [amount, setAmount] = useState(25);
  const [busy, setBusy] = useState(false);

  if (!market) {
    return (
      <div className="pane-body pane-empty">
        <div className="kicker">Ticket</div>
        <p className="pane-empty-sub">Choose an outcome to build an order.</p>
      </div>
    );
  }

  const price = side === 'YES' ? market.yes : 100 - market.yes; // cents
  const shares = price > 0 ? amount / (price / 100) : 0;
  const maxPayout = shares * 1;                                  // each share pays $1 if it wins
  const tooMuch = amount > balance;
  const invalid = amount <= 0 || tooMuch;

  const confirm = async () => {
    if (invalid || busy) return;
    setBusy(true);
    const ok = await placeBet(market, side, amount);
    setBusy(false);
    if (ok) onDone();
  };

  const chip = (v: number) => (
    <button type="button" className="tk-chip mono" onClick={() => setAmount(v)} disabled={v > balance}>
      {money(v)}
    </button>
  );

  return (
    <div className="pane-body">
      <div className="kicker">Ticket</div>
      <p className="tk-q">{market.q}</p>
      <div className="tk-code mono">{market.id}{market.cat ? ` · ${market.cat}` : ''}</div>

      <div className="tk-sides">
        <button className={`tk-side is-yes ${side === 'YES' ? 'is-on' : ''}`} onClick={() => onSide('YES')}>YES</button>
        <button className={`tk-side is-no ${side === 'NO' ? 'is-on' : ''}`} onClick={() => onSide('NO')}>NO</button>
      </div>

      <label className="tk-field">
        <span className="tk-label mono">Amount ($)</span>
        <input className="tk-input mono" type="number" min={1} value={amount}
          onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))} />
      </label>
      <div className="tk-chips">{chip(10)}{chip(25)}{chip(50)}{chip(100)}</div>

      <div className="tk-calc mono">
        <div><span>PRICE</span><b>{price}¢</b></div>
        <div><span>SHARES</span><b>{shares.toFixed(1)}</b></div>
        <div><span>COST</span><b>{money(amount)}</b></div>
        <div><span>MAX PAYOUT</span><b className="is-yes">{money(maxPayout)}</b></div>
        <div><span>BALANCE AFTER</span><b className={tooMuch ? 'is-no' : ''}>{money(Math.max(0, balance - amount))}</b></div>
      </div>

      {tooMuch && <p className="tk-err mono" role="alert">Not enough credits.</p>}

      <button className="btn btn-red tk-go" disabled={invalid || busy} onClick={confirm}>
        {busy ? 'Placing…' : `Buy ${side} · ${money(amount)}`}
      </button>
    </div>
  );
}
```

- [ ] **Step 6: Rewrite `src/desk/DeskTerminal.tsx` as the shell**

```tsx
import { useState } from 'react';
import Rail, { type Destination } from './Rail';
import Workspace, { type PaneKey } from './Workspace';
import MarketsList from './markets/MarketsList';
import MarketDetail from './markets/MarketDetail';
import TradeTicket from './markets/TradeTicket';
import { ensureMarket, type DeskMarket, type Side } from './deskStore';
import { outcomeToMarket, type MarketEvent, type Outcome } from './marketsData';
import DeskPositions from './DeskPositions';
import DeskPersonal from './DeskPersonal';

export default function DeskTerminal() {
  const [dest, setDest] = useState<Destination>('Markets');
  const [focus, setFocus] = useState<PaneKey>('list');
  const [ev, setEv] = useState<MarketEvent | null>(null);
  const [order, setOrder] = useState<{ m: DeskMarket; side: Side } | null>(null);

  const pickOutcome = (o: Outcome, side: Side) => {
    if (!ev) return;
    const m = outcomeToMarket(ev, o);
    ensureMarket(m);
    setOrder({ m, side });
    setFocus('action');
  };

  const selectEvent = (next: MarketEvent) => {
    setEv(next);
    setOrder(null);
    setFocus('detail');
  };

  return (
    <div className="desk-term">
      <Rail active={dest} onChange={(d) => { setDest(d); setFocus('list'); }} />

      <main className="desk-main">
        {dest === 'Markets' && (
          <Workspace
            focus={focus}
            onFocus={setFocus}
            list={<MarketsList selectedId={ev?.id ?? null} onSelect={selectEvent} />}
            detail={<MarketDetail ev={ev} onPick={pickOutcome} />}
            action={
              <TradeTicket
                market={order?.m ?? null}
                side={order?.side ?? 'YES'}
                onSide={(s) => setOrder((o) => (o ? { ...o, side: s } : o))}
                onDone={() => { setOrder(null); setFocus('detail'); }}
              />
            }
          />
        )}
        {dest === 'Positions' && <DeskPositions />}
        {dest === 'Personal' && <DeskPersonal />}
      </main>
    </div>
  );
}
```

- [ ] **Step 7: Create `src/styles/desk/workspace.css`**

```css
/* shell: rail + workspace */
.desk-term{display:grid;grid-template-columns:auto 1fr;min-height:100vh}
.desk-main{min-width:0;overflow:hidden}

/* ---------- rail ---------- */
.rail{display:flex;flex-direction:column;gap:26px;width:172px;padding:22px 18px;
  border-right:1px solid var(--border)}
.rail-brand{display:block}
.rail-dests{display:flex;flex-direction:column;gap:2px}
.rail-dest{position:relative;text-align:left;background:none;border:none;cursor:pointer;
  font-family:var(--mono);font-size:11px;letter-spacing:.13em;text-transform:uppercase;
  color:var(--faint);padding:9px 0 9px 13px;
  transition:color .15s ease}
.rail-dest:hover{color:var(--text)}
.rail-dest.is-on{color:var(--text)}
.rail-dest.is-on::before{content:"";position:absolute;left:0;top:8px;bottom:8px;
  width:1px;background:var(--red-bright)}
.rail-badge{font-style:normal;margin-left:8px;font-size:10px;color:var(--red-bright)}
.rail-foot{margin-top:auto;display:flex;flex-direction:column;gap:7px;
  padding-top:18px;border-top:1px solid var(--border)}
.rail-bal{font-size:15px;font-weight:600;color:var(--green);letter-spacing:.01em}
.rail-user{font-size:11px;color:var(--faint);letter-spacing:.06em}
.rail-signout{background:none;border:none;padding:0;text-align:left;cursor:pointer;
  font-size:12px;color:var(--faint);transition:color .15s ease}
.rail-signout:hover{color:var(--red-bright)}

/* ---------- panes ---------- */
.ws{display:grid;height:100vh;min-width:0}
.ws-wide{grid-template-columns:300px minmax(0,1fr) 320px}
.ws-mid{grid-template-columns:280px minmax(0,1fr);position:relative}
.ws-pane{min-width:0;overflow-y:auto;border-right:1px solid var(--border)}
.ws-pane:last-child{border-right:none}
.pane-body{padding:22px 20px}
.pane-empty{display:flex;flex-direction:column;justify-content:center;height:60%;
  text-align:center;color:var(--muted)}
.pane-empty-sub{margin-top:6px;font-size:13px;color:var(--faint)}

/* mid: the action pane becomes a slide-over pinned to the right edge */
.ws-mid .ws-action{position:absolute;top:0;right:0;bottom:0;width:320px;z-index:20;
  background:var(--bg2);border-left:1px solid var(--border-2)}

/* narrow: one pane at a time */
.ws-narrow{display:block;height:auto}
.ws-narrow .ws-pane-solo{border-right:none}
.ws-back{display:block;width:100%;text-align:left;background:none;border:none;
  border-bottom:1px solid var(--border);cursor:pointer;padding:13px 20px;
  font-family:var(--mono);font-size:11px;letter-spacing:.12em;text-transform:uppercase;
  color:var(--faint);transition:color .15s ease}
.ws-back:hover{color:var(--text)}

@media(max-width:899px){
  .desk-term{grid-template-columns:1fr;padding-bottom:56px}
  .rail{flex-direction:row;align-items:center;gap:16px;width:auto;
    position:fixed;bottom:0;left:0;right:0;z-index:40;
    padding:0 16px;height:56px;border-right:none;border-top:1px solid var(--border);
    background:var(--bg2)}
  .rail-brand,.rail-user,.rail-signout{display:none}
  .rail-dests{flex-direction:row;gap:18px}
  .rail-dest{padding:9px 0}
  .rail-dest.is-on::before{left:0;right:0;top:auto;bottom:0;width:auto;height:1px}
  .rail-foot{margin-top:0;margin-left:auto;padding-top:0;border-top:none}
}
```

- [ ] **Step 8: Import the desk sheet in `src/main.tsx`**

Add after the motion imports, so desk rules win over the foundation at equal specificity:

```ts
import './styles/desk/workspace.css';
```

- [ ] **Step 9: Verify types and build**

```bash
npx tsc -b && npm run build
```

Expected: exit 0. If `outcomeToMarket` or `Outcome` import errors appear, check they are exported
from `src/desk/marketsData.ts` — they are, at the existing export sites.

- [ ] **Step 10: Drive all three widths**

Run `npm run dev`, sign in as guest, and confirm each:

1. **≥1200px** — rail on the left, three columns. Click a market in the list: the detail pane
   loads its chart. Click `Y 41`: the ticket pane fills. Set the amount to 50, press Buy YES.
   Balance in the rail drops by 50.
2. **~1000px** — two columns; the ticket appears pinned over the right edge when an outcome is
   picked.
3. **~390px** — one pane at a time. List → tap a market → detail with a back control → tap an
   outcome → ticket with a back control. Rail is a bottom bar.

- [ ] **Step 11: Commit**

```bash
git add src/desk/Workspace.tsx src/desk/Rail.tsx src/desk/markets src/desk/DeskTerminal.tsx src/styles/desk/workspace.css src/main.tsx
git commit -m "feat: split-pane workspace shell with Markets list, detail and docked ticket"
```

---

## Task 5: Positions panes

**Files:**
- Create: `src/desk/positions/PositionsList.tsx`, `PositionDetail.tsx`, `CloseTicket.tsx`
- Modify: `src/desk/DeskTerminal.tsx`

- [ ] **Step 1: Create `src/desk/positions/PositionsList.tsx`**

```tsx
import { useDesk, getMarket, positionValue, money, round2, type Position } from '../deskStore';

export type PositionRow = { key: string; p: Position; value: number; pnl: number };

export function buildRows(positions: Position[]): PositionRow[] {
  return positions.map((p, i) => {
    const m = getMarket(p.marketId);
    const value = positionValue(p, m);
    return { key: `${p.marketId}-${p.side}-${i}`, p, value, pnl: round2(value - p.cost) };
  });
}

export default function PositionsList({
  selectedKey, onSelect,
}: { selectedKey: string | null; onSelect: (r: PositionRow) => void }) {
  const { positions } = useDesk();
  const rows = buildRows(positions);

  if (rows.length === 0) {
    return (
      <div className="pane-body pane-empty">
        <div className="kicker">Portfolio</div>
        <p className="mono">No positions yet</p>
        <p className="pane-empty-sub">Place a bet from Markets or Personal and it shows up here.</p>
      </div>
    );
  }

  return (
    <div className="pane-body">
      <div className="kicker">Portfolio · {rows.length} open</div>
      {rows.map((r) => {
        const m = getMarket(r.p.marketId);
        return (
          <button key={r.key} className={`li ${selectedKey === r.key ? 'is-on' : ''}`}
            onClick={() => onSelect(r)}>
            <em className="li-code mono">
              {r.p.marketId} · <span className={r.p.side === 'YES' ? 'is-yes' : 'is-no'}>{r.p.side}</span>
            </em>
            <span className="li-q">{m?.q || r.p.marketId}</span>
            <span className={`li-pnl mono ${r.pnl >= 0 ? 'is-yes' : 'is-no'}`}>
              {r.pnl >= 0 ? '+' : ''}{money(r.pnl)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Create `src/desk/positions/PositionDetail.tsx`**

```tsx
import DeskSpark from '../DeskSpark';
import { getMarket, money } from '../deskStore';
import type { PositionRow } from './PositionsList';

export default function PositionDetail({ row }: { row: PositionRow | null }) {
  if (!row) {
    return (
      <div className="pane-body pane-empty">
        <p className="mono">No position selected</p>
        <p className="pane-empty-sub">Pick one from the list to see how it is marking.</p>
      </div>
    );
  }

  const m = getMarket(row.p.marketId);
  const entry = row.p.shares > 0 ? (row.p.cost / row.p.shares) * 100 : 0;
  const mark = m ? (row.p.side === 'YES' ? m.yes : 100 - m.yes) : 0;

  return (
    <div className="pane-body">
      <div className="kicker">Position · {row.p.marketId}</div>
      <h2 className="detail-h">{m?.q || row.p.marketId}</h2>

      {m?.spark && (
        <DeskSpark pts={m.spark} up={m.spark[m.spark.length - 1] >= m.spark[0]} id={`pos-${row.key}`} />
      )}

      <div className="tk-calc mono">
        <div><span>SIDE</span><b className={row.p.side === 'YES' ? 'is-yes' : 'is-no'}>{row.p.side}</b></div>
        <div><span>SHARES</span><b>{row.p.shares.toFixed(1)}</b></div>
        <div><span>ENTRY</span><b>{entry.toFixed(0)}¢</b></div>
        <div><span>MARK</span><b>{mark}¢</b></div>
        <div><span>COST</span><b>{money(row.p.cost)}</b></div>
        <div><span>VALUE</span><b>{money(row.value)}</b></div>
        <div><span>P&amp;L</span><b className={row.pnl >= 0 ? 'is-yes' : 'is-no'}>
          {row.pnl >= 0 ? '+' : ''}{money(row.pnl)}</b></div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create `src/desk/positions/CloseTicket.tsx`**

`deskStore` has no close-out function and the spec forbids adding business logic, so closing is
expressed as the opposite-side bet the store already supports.

```tsx
import { useState } from 'react';
import { placeBet, getMarket, money } from '../deskStore';
import type { PositionRow } from './PositionsList';

export default function CloseTicket({
  row, onDone,
}: { row: PositionRow | null; onDone: () => void }) {
  const [busy, setBusy] = useState(false);

  if (!row) {
    return (
      <div className="pane-body pane-empty">
        <div className="kicker">Close out</div>
        <p className="pane-empty-sub">Select a position to close it.</p>
      </div>
    );
  }

  const m = getMarket(row.p.marketId);
  const opposite = row.p.side === 'YES' ? 'NO' : 'YES';

  const close = async () => {
    if (!m || busy) return;
    setBusy(true);
    const ok = await placeBet(m, opposite, row.value);
    setBusy(false);
    if (ok) onDone();
  };

  return (
    <div className="pane-body">
      <div className="kicker">Close out</div>
      <p className="tk-q">{m?.q || row.p.marketId}</p>
      <div className="tk-calc mono">
        <div><span>HOLDING</span><b>{row.p.shares.toFixed(1)} {row.p.side}</b></div>
        <div><span>VALUE</span><b>{money(row.value)}</b></div>
        <div><span>OFFSET WITH</span><b className={opposite === 'YES' ? 'is-yes' : 'is-no'}>{opposite}</b></div>
      </div>
      <button className="btn btn-red tk-go" disabled={!m || busy} onClick={close}>
        {busy ? 'Closing…' : `Offset · ${money(row.value)}`}
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Wire Positions into `DeskTerminal`**

Add the import and state, and replace the `{dest === 'Positions' && <DeskPositions />}` line:

```tsx
import PositionsList, { type PositionRow } from './positions/PositionsList';
import PositionDetail from './positions/PositionDetail';
import CloseTicket from './positions/CloseTicket';
```

```tsx
const [posRow, setPosRow] = useState<PositionRow | null>(null);
```

```tsx
{dest === 'Positions' && (
  <Workspace
    focus={focus}
    onFocus={setFocus}
    list={<PositionsList selectedKey={posRow?.key ?? null}
      onSelect={(r) => { setPosRow(r); setFocus('detail'); }} />}
    detail={<PositionDetail row={posRow} />}
    action={<CloseTicket row={posRow} onDone={() => { setPosRow(null); setFocus('list'); }} />}
  />
)}
```

Remove the now-unused `import DeskPositions from './DeskPositions';`.

- [ ] **Step 5: Verify**

```bash
npx tsc -b && npm run build && npm run dev
```

In the browser: place a bet from Markets, switch to Positions, select the row, confirm entry vs.
mark and P&L read correctly, then Offset. The position's value returns to the balance.

- [ ] **Step 6: Commit**

```bash
git add src/desk/positions src/desk/DeskTerminal.tsx
git commit -m "feat: Positions workspace panes with mark-to-market detail and offset ticket"
```

---

## Task 6: Personal panes

The `＋ New market` row is what makes the uniform skeleton honest: it is a list row like any
other, and selecting it swaps the detail pane to the create form.

**Files:**
- Create: `src/desk/personal/PersonalList.tsx`, `PersonalDetail.tsx`, `PersonalAction.tsx`
- Modify: `src/desk/DeskTerminal.tsx`

- [ ] **Step 1: Create `src/desk/personal/PersonalList.tsx`**

```tsx
import { useState, type FormEvent } from 'react';
import { useDesk, joinByCode, money, type DeskMarket } from '../deskStore';

export type PersonalSel = { kind: 'new' } | { kind: 'market'; m: DeskMarket };

export default function PersonalList({
  sel, onSelect,
}: { sel: PersonalSel | null; onSelect: (s: PersonalSel) => void }) {
  const { custom } = useDesk();
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const join = async (e: FormEvent) => {
    e.preventDefault();
    const m = await joinByCode(code);
    if (m) { setMsg({ ok: true, text: `Joined “${m.q}”.` }); onSelect({ kind: 'market', m }); setCode(''); }
    else setMsg({ ok: false, text: 'No market for that code. Try EX-DEMO.' });
  };

  return (
    <div className="pane-body">
      <div className="kicker">Private markets</div>

      <button className={`li li-new ${sel?.kind === 'new' ? 'is-on' : ''}`}
        onClick={() => onSelect({ kind: 'new' })}>
        <span className="li-q">＋ New market</span>
      </button>

      {custom.map((m) => (
        <button key={m.id}
          className={`li ${sel?.kind === 'market' && sel.m.id === m.id ? 'is-on' : ''}`}
          onClick={() => onSelect({ kind: 'market', m })}>
          <em className="li-code mono">{m.id}</em>
          <span className="li-q">{m.q}</span>
          <span className="li-pnl mono is-yes">{money(m.pool || 0)}</span>
        </button>
      ))}

      <form className="join" onSubmit={join}>
        <label className="tk-label mono" htmlFor="join-code">Join with a code</label>
        <input id="join-code" className="tk-input mono" value={code} maxLength={8}
          placeholder="EX-XXXX"
          onChange={(e) => { setCode(e.target.value.toUpperCase()); setMsg(null); }} />
        <button className="btn btn-red join-go" type="submit" disabled={!code.trim()}>Join</button>
        {msg && <p className={`join-msg mono ${msg.ok ? 'is-yes' : 'is-no'}`}
          role={msg.ok ? 'status' : 'alert'}>{msg.text}</p>}
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Create `src/desk/personal/PersonalDetail.tsx`**

```tsx
import { useState, type FormEvent } from 'react';
import DeskSpark from '../DeskSpark';
import { createMarket, money, type DeskMarket } from '../deskStore';
import type { PersonalSel } from './PersonalList';

export default function PersonalDetail({
  sel, onCreated,
}: { sel: PersonalSel | null; onCreated: (m: DeskMarket) => void }) {
  if (!sel) {
    return (
      <div className="pane-body pane-empty">
        <p className="mono">Nothing selected</p>
        <p className="pane-empty-sub">Create a market, or pick one you already have.</p>
      </div>
    );
  }
  if (sel.kind === 'new') return <CreateForm onCreated={onCreated} />;

  const m = sel.m;
  return (
    <div className="pane-body">
      <div className="kicker">{m.cat} · closes {m.closes} · by {m.owner}</div>
      <h2 className="detail-h">{m.q}</h2>
      {m.spark && <DeskSpark pts={m.spark} up={m.spark[m.spark.length - 1] >= m.spark[0]} id={`pv-${m.id}`} />}
      <div className="tk-calc mono">
        <div><span>POOL</span><b className="is-yes">{money(m.pool || 0)}</b></div>
        <div><span>YES</span><b>{m.yes}¢</b></div>
        <div><span>NO</span><b>{100 - m.yes}¢</b></div>
      </div>
    </div>
  );
}

function CreateForm({ onCreated }: { onCreated: (m: DeskMarket) => void }) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('Private');
  const [closes, setCloses] = useState('');
  const [yes, setYes] = useState(50);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!q.trim()) return;
    const m = await createMarket({ q, cat, closes, yes });
    setQ(''); setCloses(''); setYes(50);
    onCreated(m);
  };

  return (
    <form className="pane-body" onSubmit={submit}>
      <div className="kicker">Create a market</div>
      <label className="tk-field">
        <span className="tk-label mono">Question</span>
        <input className="tk-input" value={q} maxLength={120}
          placeholder="Will we hit the gym 4x this week?"
          onChange={(e) => setQ(e.target.value)} />
      </label>
      <label className="tk-field">
        <span className="tk-label mono">Category</span>
        <input className="tk-input" value={cat} maxLength={16} onChange={(e) => setCat(e.target.value)} />
      </label>
      <label className="tk-field">
        <span className="tk-label mono">Closes</span>
        <input className="tk-input" value={closes} maxLength={12} placeholder="Sun"
          onChange={(e) => setCloses(e.target.value)} />
      </label>
      <label className="tk-field">
        <span className="tk-label mono">Opening Yes odds · {yes}¢</span>
        <input className="tk-range" type="range" min={5} max={95} value={yes}
          onChange={(e) => setYes(Number(e.target.value))} />
      </label>
      <button className="btn btn-red tk-go" type="submit" disabled={!q.trim()}>Generate share code</button>
    </form>
  );
}
```

- [ ] **Step 3: Create `src/desk/personal/PersonalAction.tsx`**

```tsx
import { useState } from 'react';
import TradeTicket from '../markets/TradeTicket';
import type { DeskMarket, Side } from '../deskStore';

export default function PersonalAction({
  created, market, onDone,
}: { created: DeskMarket | null; market: DeskMarket | null; onDone: () => void }) {
  const [side, setSide] = useState<Side>('YES');
  const [copied, setCopied] = useState(false);

  if (created) {
    const copy = () => {
      navigator.clipboard?.writeText(created.id).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1400);
      }).catch(() => {});
    };
    return (
      <div className="pane-body">
        <div className="kicker">Share this code</div>
        <button type="button" className="code-pill mono" onClick={copy} title="Copy code">
          {created.id}<span className="code-pill-hint mono">{copied ? 'copied' : 'copy'}</span>
        </button>
        <p className="pane-empty-sub">Anyone with this code can join and bet.</p>
      </div>
    );
  }

  return <TradeTicket market={market} side={side} onSide={setSide} onDone={onDone} />;
}
```

- [ ] **Step 4: Wire Personal into `DeskTerminal`**

```tsx
import PersonalList, { type PersonalSel } from './personal/PersonalList';
import PersonalDetail from './personal/PersonalDetail';
import PersonalAction from './personal/PersonalAction';
```

```tsx
const [pSel, setPSel] = useState<PersonalSel | null>(null);
const [created, setCreated] = useState<DeskMarket | null>(null);
```

```tsx
{dest === 'Personal' && (
  <Workspace
    focus={focus}
    onFocus={setFocus}
    list={<PersonalList sel={pSel}
      onSelect={(s) => { setPSel(s); setCreated(null); setFocus('detail'); }} />}
    detail={<PersonalDetail sel={pSel}
      onCreated={(m) => { setCreated(m); setPSel({ kind: 'market', m }); setFocus('action'); }} />}
    action={<PersonalAction created={created}
      market={pSel?.kind === 'market' ? pSel.m : null}
      onDone={() => { setCreated(null); setFocus('detail'); }} />}
  />
)}
```

Remove the now-unused `import DeskPersonal from './DeskPersonal';`.

- [ ] **Step 5: Verify**

```bash
npx tsc -b && npm run build && npm run dev
```

Drive: Personal → `＋ New market` → fill the question → Generate share code → the action pane
shows the code, and clicking it copies. Then join with `EX-DEMO` and confirm the joined market
appears and can be bet on.

- [ ] **Step 6: Commit**

```bash
git add src/desk/personal src/desk/DeskTerminal.tsx
git commit -m "feat: Personal workspace panes with create-as-list-row and share code action"
```

---

## Task 7: Delete superseded components and sweep the desk CSS

**Files:**
- Delete: `src/desk/DeskMarkets.tsx`, `DeskPositions.tsx`, `DeskPersonal.tsx`, `BetTicket.tsx`
- Create: `src/styles/desk/panes.css`
- Modify: `src/styles/global.css`, `src/main.tsx`

- [ ] **Step 1: Confirm nothing imports them**

```bash
grep -rn "DeskMarkets\|DeskPositions\|DeskPersonal\|BetTicket" src/
```

Expected: no matches. If any appear, fix the importer before deleting.

- [ ] **Step 2: Delete the files**

```bash
git rm src/desk/DeskMarkets.tsx src/desk/DeskPositions.tsx src/desk/DeskPersonal.tsx src/desk/BetTicket.tsx
```

- [ ] **Step 3: Move the surviving desk styling into `src/styles/desk/panes.css`**

Cut the desk block from `global.css` (everything from `/* ---- sign-in ---- */` to end of file)
and rewrite it here in compliance. The list, detail and ticket classes the new components use:

```css
/* ---------- list rows ---------- */
.grp{margin-bottom:18px}
.grp-h{display:flex;align-items:center;justify-content:space-between;
  font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--faint);
  padding:0 0 8px;border-bottom:1px solid var(--border)}
.grp-n{color:var(--faint)}
.li{display:block;width:100%;text-align:left;background:none;cursor:pointer;
  border:none;border-bottom:1px solid rgba(255,255,255,.06);padding:11px 12px 11px 11px;
  position:relative;transition:background-color .15s ease}
.li:hover{background:rgba(255,255,255,.02)}
.li.is-on{background:rgba(255,59,59,.05)}
.li.is-on::before{content:"";position:absolute;left:0;top:0;bottom:0;width:2px;background:var(--red-bright)}
.li-code{display:block;font-style:normal;font-size:9.5px;letter-spacing:.12em;
  text-transform:uppercase;color:var(--faint);margin-bottom:4px}
.li-live{display:inline-block;width:5px;height:5px;border-radius:50%;
  background:var(--red-bright);margin-left:7px;vertical-align:middle}
.li-q{display:block;font-size:13px;line-height:1.4;color:var(--text)}
.li-pnl{display:block;margin-top:5px;font-size:11.5px}
.li-new .li-q{color:var(--red-bright);font-family:var(--mono);font-size:12px;letter-spacing:.08em}

/* ---------- detail ---------- */
.detail-h{font-size:20px;font-weight:500;line-height:1.3;letter-spacing:-.01em;margin:0 0 16px}
.detail-legend{display:flex;flex-wrap:wrap;gap:16px;margin-bottom:10px;
  font-size:11.5px;color:var(--muted)}
.leg{display:inline-flex;align-items:center;gap:7px}
.leg b{color:var(--text)}
.dot{width:5px;height:5px;border-radius:50%;flex:none;display:inline-block}
.detail-outcomes{margin-top:18px}
.oc{display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center;gap:8px;
  padding:10px 0;border-top:1px solid rgba(255,255,255,.06)}
.oc:first-child{border-top:none}
.oc-name{display:flex;align-items:center;gap:9px;font-size:13.5px;color:var(--text);min-width:0}
.oc-meta{font-size:11px;color:var(--faint)}
.oc-p{font-size:11.5px;font-weight:500;padding:6px 12px;border-radius:3px;min-width:62px;
  text-align:center;background:transparent;border:1px solid var(--border-2);cursor:pointer;
  color:var(--muted);transition:border-color .15s ease,color .15s ease}
.oc-p.is-yes{color:var(--green);border-color:rgba(52,211,153,.30)}
.oc-p.is-yes:hover{border-color:var(--green)}
.oc-p.is-no{color:var(--down);border-color:rgba(248,113,113,.28)}
.oc-p.is-no:hover{border-color:var(--down)}
.detail-news{display:grid;grid-template-columns:auto 1fr;gap:10px;margin-top:18px;
  padding-top:14px;border-top:1px solid var(--border)}
.detail-news-mark{color:var(--red-bright);font-size:12px;line-height:1.5}
.detail-news p{margin:0;font-size:12.5px;line-height:1.55;color:var(--muted)}
.detail-vol{margin-top:14px;font-size:11px;letter-spacing:.08em;color:var(--faint)}

/* ---------- ticket ---------- */
.tk-q{font-size:14px;line-height:1.4;margin:0 0 5px;color:var(--text)}
.tk-code{font-size:10.5px;letter-spacing:.08em;color:var(--faint);margin-bottom:16px}
.tk-sides{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px}
.tk-side{padding:9px;border-radius:3px;background:transparent;cursor:pointer;
  border:1px solid var(--border-2);color:var(--faint);
  font-family:var(--mono);font-size:11.5px;letter-spacing:.1em;
  transition:border-color .15s ease,color .15s ease}
.tk-side.is-yes.is-on{color:var(--green);border-color:rgba(52,211,153,.45)}
.tk-side.is-no.is-on{color:var(--down);border-color:rgba(248,113,113,.42)}
.tk-field{display:block;margin-bottom:12px}
.tk-label{display:block;font-size:10px;letter-spacing:.13em;text-transform:uppercase;
  color:var(--faint);margin-bottom:7px}
.tk-input{width:100%;background:transparent;border:1px solid var(--border);border-radius:3px;
  color:var(--text);font-size:14px;padding:10px 12px;font-family:var(--font);
  transition:border-color .18s ease}
.tk-input.mono{font-family:var(--mono)}
.tk-input::placeholder{color:var(--faint)}
.tk-input:focus{outline:none;border-color:rgba(225,29,42,.6)}
.tk-range{width:100%;accent-color:var(--red-bright)}
.tk-chips{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:16px}
.tk-chip{padding:8px 0;border-radius:3px;border:1px solid var(--border-2);background:transparent;
  color:var(--muted);font-size:11.5px;cursor:pointer;
  transition:border-color .14s ease,color .14s ease}
.tk-chip:hover:not(:disabled){border-color:rgba(225,29,42,.6);color:var(--text)}
.tk-chip:disabled{opacity:.35;cursor:not-allowed}
.tk-calc{border-top:1px solid var(--border);padding-top:14px;font-size:11.5px;display:grid;gap:8px}
.tk-calc>div{display:flex;justify-content:space-between}
.tk-calc span{color:var(--faint);letter-spacing:.08em}
.tk-calc b{color:var(--text);font-weight:500}
.tk-err{margin-top:12px;font-size:11.5px;color:var(--down)}
.tk-go{width:100%;margin-top:16px}

/* ---------- join + share code ---------- */
.join{margin-top:24px;padding-top:18px;border-top:1px solid var(--border)}
.join-go{width:100%;margin-top:10px}
.join-msg{margin-top:10px;font-size:11.5px;line-height:1.5}
.code-pill{display:inline-flex;align-items:center;gap:14px;margin:4px 0 12px;
  padding:14px 20px;border-radius:3px;border:1px solid var(--border-2);background:transparent;
  color:var(--text);font-size:22px;letter-spacing:.16em;font-weight:600;cursor:pointer;
  transition:border-color .16s ease}
.code-pill:hover{border-color:rgba(225,29,42,.6)}
.code-pill-hint{font-size:9.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--faint)}
```

- [ ] **Step 4: Import it in `src/main.tsx`**

```ts
import './styles/desk/panes.css';
```

- [ ] **Step 5: Verify the purge is complete**

```bash
wc -l src/styles/global.css
grep -nE "border-radius:(?!3px|50%|inherit)" -P src/styles/global.css src/styles/desk/*.css
```

Expected: `global.css` around 150 lines; the radius grep returns nothing.

- [ ] **Step 6: Verify and commit**

```bash
npx tsc -b && npm run build
git add -A && git commit -m "refactor: delete superseded desk components, move desk styling to panes.css"
```

---

## Task 8: Skeleton transition

Attach to the genuine loading state at `src/pages/Desk.tsx:41` — the blank `desk-auth` div
rendered while the Supabase session check runs — and to `hydrateLive`'s three parallel fetches.
Do not add a skeleton anywhere there is no real loading state.

**Files:**
- Modify: `src/pages/Desk.tsx`
- Reference: `/tmp/ex-ui-system/reference/skeleton--Calendar.tsx`

- [ ] **Step 1: Read the reference implementation**

```bash
cat /tmp/ex-ui-system/reference/skeleton--Calendar.tsx
```

It shows the skeleton → content cross-fade driven by a real `loading | ready | error` state.

- [ ] **Step 2: Replace the blank loading div in `src/pages/Desk.tsx`**

The current code at line 41 renders `<div className="desk-auth" />`. Replace it with the sheet's
structure: an outer `.t-skel` that gains `is-revealed` once loading finishes, wrapping a
`.t-skel-skeleton` (add `is-pulsing` for the shimmer) and a `.t-skel-content`. The cross-fade is
driven entirely by toggling `is-revealed` on the outer element. Ignore the `.cal-skel` bridge
layer at the end of the sheet — that targets the old marketing calendar.

- [ ] **Step 3: Verify against a real slow load**

Throttle the network in Chrome DevTools to "Slow 3G" and reload `/terminal` with Supabase env
vars set. The skeleton must appear, then cross-fade to content. In guest mode with no Supabase
configured, `checking` is `false` from the start and no skeleton shows — that is correct
behaviour, not a bug.

- [ ] **Step 4: Verify reduced motion**

Enable OS reduced motion, reload. The skeleton must resolve to a motionless state and content
must remain legible.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Desk.tsx
git commit -m "feat: skeleton reveal on the Supabase session check"
```

---

## Task 9: Error shake

**Files:**
- Modify: `src/desk/markets/TradeTicket.tsx`, `src/desk/personal/PersonalList.tsx`, `src/desk/DeskSignIn.tsx`
- Reference: `/tmp/ex-ui-system/reference/error-shake--Login.tsx`

- [ ] **Step 1: Read the reference for the nonce pattern**

```bash
cat /tmp/ex-ui-system/reference/error-shake--Login.tsx
```

- [ ] **Step 2: Add the monotonic nonce to `TradeTicket`**

The same wrong amount entered twice produces an identical error string, so an effect keyed only
on the message never re-runs and the shake fires once, ever. A monotonic counter fixes it:

```tsx
const [nonce, setNonce] = useState(0);
const [shaking, setShaking] = useState(false);
const errRef = useRef<HTMLParagraphElement>(null);

const fail = () => setNonce((n) => n + 1);

useEffect(() => {
  if (!nonce) return;
  const el = errRef.current;
  if (!el) return;
  el.classList.remove('t-input', 'is-shaking');
  void el.offsetWidth;              // forces layout; without it nothing replays
  el.classList.add('t-input', 'is-shaking');
  setShaking(true);
}, [tooMuch, nonce]);
```

Call `fail()` from `confirm()` when `invalid` is true instead of returning silently.

The amount `<input>` carries `t-input` permanently and gains `is-error` once; only `is-shaking`
is cycled. Keep them orthogonal — merging them re-flashes the whole error treatment on every
replay. The message element uses `t-error-msg` inside a wrapper carrying `t-input-wrap is-error`.
See the sheet API table near the top of this plan; `error-shake.css` also defines an
`.auth-input.t-input` bridge for the old marketing login — ignore it.

- [ ] **Step 3: Apply the same pattern to the failed join in `PersonalList`**

The `msg.ok === false` branch already sets an error with `role="alert"`. Add the same nonce and
reflow so repeating the same bad code shakes every time.

- [ ] **Step 4: Verify the repeat case specifically**

Drive it: with a $1,000 balance, enter `5000` and press Buy. It shakes. **Press Buy again without
changing the amount.** It must shake again. If it only shakes once, the nonce is not wired.

- [ ] **Step 5: Verify reduced motion resolves motionless**

With OS reduced motion on, the error must appear without any lateral movement — a shake is a
vestibular trigger and must not merely run faster.

- [ ] **Step 6: Commit**

```bash
git add src/desk/markets/TradeTicket.tsx src/desk/personal/PersonalList.tsx src/desk/DeskSignIn.tsx
git commit -m "feat: error shake with monotonic nonce on ticket, join and sign-in failures"
```

---

## Task 10: Success check

**Files:**
- Create: `src/components/SuccessCheck.tsx`
- Modify: `src/desk/markets/TradeTicket.tsx`, `src/desk/personal/PersonalAction.tsx`
- Reference: `/tmp/ex-ui-system/reference/success-check--JoinPage.tsx`

- [ ] **Step 1: Measure the stroke length — do not copy a placeholder**

For the path `M14 25 L21 32 L34 17` in a `0 0 48 48` viewBox:
`|(14,25)→(21,32)| = 9.8995`, `|(21,32)→(34,17)| = 19.8494`, total `29.75`, round up by 1 ⇒ **30**.

```tsx
export default function SuccessCheck({ label }: { label: string }) {
  return (
    <div className="t-success-check" data-state="in" role="status" aria-label={label}>
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <path d="M14 25 L21 32 L34 17"
          style={{ strokeDasharray: 30, strokeDashoffset: 30 }} />
      </svg>
    </div>
  );
}
```

`success.css` styles `.t-success-check svg path` directly, so the path needs no class of its own;
the draw is driven by the `data-state="in"` attribute. Do not add `.success-ring`/`.success-tick` —
they do not exist in the sheet.

- [ ] **Step 2: Fire it on a successful bet**

In `TradeTicket.confirm`, when `placeBet` resolves true, render `SuccessCheck` in place of the
form for ~900ms before calling `onDone()`.

- [ ] **Step 3: Fire it on market creation**

In `PersonalAction`, show `SuccessCheck` above the share code when `created` first becomes
non-null.

- [ ] **Step 4: Verify the draw**

Place a bet and watch the tick draw. It must not pre-reveal (visible before animating) or
over-draw (a tail past the stroke end). Either symptom means the dasharray is wrong.

- [ ] **Step 5: Commit**

```bash
git add src/components/SuccessCheck.tsx src/desk/markets/TradeTicket.tsx src/desk/personal/PersonalAction.tsx
git commit -m "feat: success check with measured stroke on bet placed and market created"
```

---

## Task 11: Number pop-in on the rail balance

**Files:**
- Create: `src/components/PopNumber.tsx`
- Modify: `src/desk/Rail.tsx`
- Reference: `/tmp/ex-ui-system/reference/number-popin--Stats.tsx`

- [ ] **Step 1: Read the reference for the settle-only rule and the a11y fix**

```bash
cat /tmp/ex-ui-system/reference/number-popin--Stats.tsx
```

Two things it carries that the CSS cannot: the pop-in fires **once on the final settle**, and the
per-character spans are hidden from assistive tech behind a labelled container.

- [ ] **Step 2: Create `src/components/PopNumber.tsx`**

Per-character spans make screen readers announce "dollar, one, comma, zero…", so the container
carries `role="img"` and the real label:

```tsx
import { useEffect, useRef } from 'react';

export default function PopNumber({ text, className = '' }: { text: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(text);

  useEffect(() => {
    if (prev.current === text) return;   // first mount and no-op updates never animate
    prev.current = text;
    const el = ref.current;
    if (!el) return;
    el.classList.remove('is-animating');
    void el.offsetWidth;                 // forces layout so the animation replays
    el.classList.add('is-animating');
  }, [text]);

  return (
    <span className={className} role="img" aria-label={text}>
      <span ref={ref} className="t-digit-group" aria-hidden="true">
        {text.split('').map((ch, i) => (
          <span key={i} className="t-digit" data-stagger={String(Math.min(i, 2))}>{ch}</span>
        ))}
      </span>
    </span>
  );
}
```

Track the previous value in a ref, not state. A `useState` mirror would set state inside the
effect, causing a second render on every balance change purely to detect that a change happened.

`number.css` animates `.t-digit-group.is-animating .t-digit`, and staggers via
`data-stagger="1"` and `data-stagger="2"`. The ref must sit on the `.t-digit-group` element —
that is what carries `is-animating` — while `role="img"` and the label stay on the outer span.

- [ ] **Step 3: Use it for the rail balance**

Replace `<span className="rail-bal mono">{money(balance)}</span>` with
`<PopNumber text={money(balance)} className="rail-bal mono" />`.

- [ ] **Step 4: Verify it fires once, not per frame**

Place a bet. The balance must pop **once** on its new value. If digits sit permanently mid-
animation, the pop is being retriggered per render — it must key on the settled value only.

- [ ] **Step 5: Verify with a screen reader**

With VoiceOver on (Cmd+F5), focus the balance. It must announce "one thousand dollars", not
individual characters.

- [ ] **Step 6: Commit**

```bash
git add src/components/PopNumber.tsx src/desk/Rail.tsx
git commit -m "feat: number pop-in on the rail balance, fired on settle only"
```

---

## Task 12: Accordion on the Markets category groups

**Files:**
- Modify: `src/desk/markets/MarketsList.tsx`
- Reference: `/tmp/ex-ui-system/reference/accordion--Faq.tsx`

- [ ] **Step 1: Read the reference**

```bash
cat /tmp/ex-ui-system/reference/accordion--Faq.tsx
```

It shows `<details>` replaced by a controlled button plus a `grid-rows` panel, with `inert` when
collapsed.

- [ ] **Step 2: Make the group header a real disclosure button**

The pre-ship checklist requires real `<button>`s with `aria-expanded` and `aria-controls`, and
collapsed panels carrying `inert` so they leave the tab order:

```tsx
const [open, setOpen] = useState<Record<string, boolean>>({});
const isOpen = (cat: string) => open[cat] ?? true;   // default open
```

```tsx
<section className="grp t-acc" key={cat} data-open={isOpen(cat)}>
  <h3>
    <button className="grp-h mono"
      onClick={() => setOpen((o) => ({ ...o, [cat]: !(o[cat] ?? true) }))}
      aria-expanded={isOpen(cat)} aria-controls={`grp-${cat}`}>
      {cat}<span className="grp-n">{items.length}</span>
    </button>
  </h3>
  <div className="t-acc-panel" id={`grp-${cat}`} inert={!isOpen(cat)}>
    <div className="t-acc-panel-inner grp-items">
      {/* the existing .li buttons, unchanged */}
    </div>
  </div>
</section>
```

Two details that are easy to get wrong:

- The toggle reads `o[cat] ?? true` **inside** the functional update rather than calling
  `isOpen(cat)` from the enclosing closure, so rapid clicks cannot act on a stale snapshot.
- `inert` is passed as a real boolean. React 19 supports `inert` natively; the `inert=""`
  string spread was a React 18 workaround and is unnecessary here (this repo is on React 19.2).

- [ ] **Step 3: Confirm the padding rule**

Height animates `grid-template-rows: 0fr → 1fr`. **Padding must live on `.t-acc-panel-inner`,
never on the `.t-acc-panel` track** — padding on a `0fr` track leaves a residual strip and the
group never fully closes. `data-open` goes on the `.t-acc` section, not on the panel; the sheet
selects `.t-acc[data-open="true"] .t-acc-panel`.

- [ ] **Step 4: Verify collapse, tab order and reduced motion**

Collapse a group: it must reach zero height with no residual strip. Tab through the list: rows
inside a collapsed group must be skipped. With reduced motion on, it must snap without animating.

- [ ] **Step 5: Commit**

```bash
git add src/desk/markets/MarketsList.tsx
git commit -m "feat: collapsible category groups in the markets list"
```

---

## Task 13: Dropdown — account menu and the mid-width slide-over

**Files:**
- Modify: `src/desk/Rail.tsx`, `src/desk/Workspace.tsx`
- Reference: `/tmp/ex-ui-system/reference/dropdown--Nav.tsx`

- [ ] **Step 1: Read the reference for the four-phase machine**

```bash
cat /tmp/ex-ui-system/reference/dropdown--Nav.tsx
```

- [ ] **Step 2: Add the phase type and helper**

`{open && <Menu/>}` removes the node instantly, leaving nothing to transition. The fix:

```tsx
type Phase = 'closed' | 'pre' | 'open' | 'closing';

// opening: mount at rest ('pre'), let it paint ONE frame, then open.
// a single rAF is not enough — you need two.
const openMenu = () => {
  setPhase('pre');
  requestAnimationFrame(() => requestAnimationFrame(() => setPhase('open')));
};

// closing: swap to 'closing', unmount only after the duration elapses.
// without this cleanup the NEXT open starts from the closing scale.
const closeMenu = () => {
  setPhase('closing');
  setTimeout(() => setPhase('closed'), 150);   // --duration-quick
};
```

Open at 250ms (`--duration-fast`), close at 150ms (`--duration-quick`) — open slow, close fast.

- [ ] **Step 3: Wrap the rail's sign-out in an account menu**

`@handle` becomes the trigger; the menu holds Sign out and, in guest mode, Reset demo (call
`resetDesk` from `deskStore`, preserving the existing `confirm()` guard).

- [ ] **Step 4: Apply the same machine to the mid-width action pane**

In `Workspace`, when `mode === 'mid'`, the `.ws-action` slide-over mounts and unmounts through the
same four phases rather than appearing instantly.

- [ ] **Step 5: Verify the close animation actually plays**

Open the account menu and close it: it must animate out, not vanish. Open it again immediately —
if the second open starts from a collapsed or offset state, the `closing` cleanup is missing.

- [ ] **Step 6: Commit**

```bash
git add src/desk/Rail.tsx src/desk/Workspace.tsx
git commit -m "feat: four-phase dropdown for the account menu and mid-width slide-over"
```

---

## Task 14: Restyle sign-in and intro

**Files:**
- Modify: `src/desk/DeskSignIn.tsx`, `src/desk/DeskIntro.tsx`
- Modify: `src/styles/desk/panes.css`

- [ ] **Step 1: Bring the sign-in card into compliance**

Current: `border-radius:16px`, a `linear-gradient` fill, `box-shadow:0 30px 80px -30px`,
`10px` inputs, a solid red button. Target: `3px` radius, transparent with a single hairline, no
shadow, `.kicker` above the heading, `.btn btn-red` for the primary action, `.tk-input` for the
fields.

Wrap the card in `<Reveal>` — sign-in is a genuine scroll surface, unlike the workspace panes.

- [ ] **Step 2: Bring the intro into compliance**

Keep the ring animation and the Newsreader lockup — that is brand, not chrome. Change the skip
control from `border-radius:22px` to `3px` and make its label mono.

- [ ] **Step 3: Verify both**

Sign out to reach the sign-in card; check the fields, the wipe on the button, and the reveal.
Then run `resetDesk` from the account menu to replay the intro.

- [ ] **Step 4: Commit**

```bash
git add src/desk/DeskSignIn.tsx src/desk/DeskIntro.tsx src/styles/desk/panes.css
git commit -m "style: bring sign-in and intro into system compliance"
```

---

## Task 15: Pre-ship checklist and final verification

**Files:** whichever the checklist turns up.

- [ ] **Step 1: Correctness sweep**

```bash
grep -rnE "transition:\s*(all|[.0-9]+s\s*[;}])" src/styles/
grep -rn "stroke-dasharray" src/
grep -rnP "border-radius:(?!3px|50%|inherit)" src/styles/
```

Expected: no hits from the first and third. The second must show only the measured `30`.

- [ ] **Step 2: Accessibility sweep**

Confirm each: every animated stylesheet *contains* a `@media (prefers-reduced-motion: reduce)`
block (three of them place it mid-file, before a project bridge layer — that is expected); collapsed accordion panels carry `inert`; disclosure toggles are real `<button>`s with
`aria-expanded` and `aria-controls`; errors keep `role="alert"` and success `role="status"`;
decorative SVG is `aria-hidden`; split text is labelled on its container; focus is visible on
near-black everywhere.

```bash
for f in src/styles/motion/*.css; do
  grep -Lq "prefers-reduced-motion" "$f" && echo "MISSING reduced-motion: $f"
done
```

- [ ] **Step 3: Full flow at three widths in a foreground browser**

At ≥1200px, ~1000px and ~390px, run the whole loop: select a market → place a bet → view the
position → offset it → create a market → copy the share code → join with `EX-DEMO` → fail a join
with a bad code → overspend to trigger the shake. Everything must work at every width.

- [ ] **Step 4: Reduced motion pass**

Enable OS reduced motion, reload, repeat Step 3. Everything legible and usable; all shakes and
slides resolve to a motionless end state.

- [ ] **Step 5: Final build**

```bash
npx tsc -b && npm run build
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "fix: pre-ship accessibility and correctness sweep"
```

---

## Self-review notes

**Spec coverage.** Every spec section maps to a task: §3.1 shell → Task 4; §3.2 pane contents →
Tasks 4, 5, 6; §3.3 file layout → Tasks 1, 4–7; §3.4 modal removal → Tasks 4 and 7; §4.1
compliance → Tasks 3 and 7; §4.2 stylesheets → Tasks 1, 2, 7; §5 motion table → Tasks 8–13; §5.1
omissions → honoured (no Lenis task exists; `Reveal` is used only in Task 14 and narrow mode);
§5.2 traps → Tasks 9 (nonce, reflow), 10 (measured stroke), 11 (settle-only, `role="img"`), 12
(padding on inner), 13 (four phases); §6 scope → no task touches `deskStore`, `terminalDb`,
`marketsData` or the schema; §7 verification → Task 15.

**Type consistency.** `PaneKey` is defined in Task 4 and used in Tasks 4–6. `Destination` and
`DESTINATIONS` are defined in Task 4's `Rail.tsx`. `PositionRow` is defined in Task 5's
`PositionsList.tsx` and consumed by `PositionDetail` and `CloseTicket` in the same task.
`PersonalSel` is defined in Task 6's `PersonalList.tsx` and consumed by `PersonalDetail` in the
same task. `TradeTicket`'s props (`market`, `side`, `onSide`, `onDone`) are identical at its
definition in Task 4 and its reuse in Task 6's `PersonalAction`.

**Known soft spots, flagged rather than hidden.** Tasks 8, 9, 10, 11 and 12 deliberately say to
read the corresponding file in `src/styles/motion/` and use the class names it defines, instead
of hard-coding names here. The kit's stylesheets were copied verbatim in Task 1 and were not read
while writing this plan, so inventing selectors would risk a mismatch that only surfaces at
runtime as a silently dead animation.
