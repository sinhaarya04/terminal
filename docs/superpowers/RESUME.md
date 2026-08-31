# Resume: E[X] Terminal split-pane redesign

**Branch:** `desk-workspace-redesign` · **Base:** `main` @ `29035a2` (clean, matches origin)

## How to resume

Open Claude Code in `/Users/sbateman/ex-terminal` and say:

> Resume the desk redesign from docs/superpowers/RESUME.md

That is all that is needed. Everything below is for whoever (or whatever) picks it up.

---

## State as of 2026-08-31 03:50 MDT — all 15 tasks complete

| Task | Status | Commit |
|---|---|---|
| 1 · Motion foundation (hooks, `Reveal`, motion sheets) | ✅ done | `a10c9f3` |
| 2 · Purge `global.css` 1408 → 355 lines | ✅ done | `6fa2be3` |
| 3 · Repair `.btn`/`.btn-red`, normalise foundation radius | ✅ done | `e43bcb1` |
| 4 · Workspace shell + Markets panes | ✅ done | `4b4513a` |
| 5 · Positions panes | ✅ done | `fbeb1d0` |
| 6 · Personal panes | ✅ done | `ebdc82a` |
| 7 · Delete superseded components, `panes.css` | ✅ done | `ccce3c0` |
| 8 · Skeleton transition | ✅ done | `e2296fe` |
| 9 · Error shake | ✅ done | `a085e12` |
| 10 · Success check | ✅ done | `eeceb56` |
| 11 · Number pop-in | ✅ done | `a085e12` |
| 12 · Accordion category groups | ✅ done | `f064dee` |
| 13 · Dropdown (account menu) | ✅ done | `5e835e8` |
| 14 · Restyle sign-in and intro | ✅ done | `56231db` |
| 15 · Pre-ship checklist | ✅ done | `e2296fe` |

**Plan:** `docs/superpowers/plans/2026-08-30-desk-workspace-redesign.md` — full text of every task.
**Spec:** `docs/superpowers/specs/2026-08-30-desk-workspace-redesign-design.md` — the approved design.

The plan is the source of truth. It has been corrected twice since it was written (see
"Motion stylesheet API" near the top, and the ⚠️ notes in Tasks 2 and 3) — trust the current
file, not any recollection of it.

## Verification model — read before doing anything

**This repo has no test runner, and that is deliberate.** `package.json` has exactly three
scripts: `dev`, `build`, `preview`. The approved spec scopes out adding a test framework.
**Do not write test files. Do not add vitest/jest.** Verification is:

```bash
npx tsc -b && npm run build      # both must exit 0
```

plus driving the real app at `http://localhost:5173/terminal` (`npm run dev`). Guest mode is
the test account — the app runs fully without Supabase env vars; sign in via the guest handle
field.

A green build proves nothing about whether a transition looks right. The browser is the real gate.

## Things already learned the hard way — do not rediscover these

1. **Motion selectors use a `t-` prefix.** `.t-acc-panel`, `.t-digit-group.is-animating`,
   `.t-success-check[data-state="in"]`, `.t-input.is-shaking`, `.t-skel.is-revealed`,
   `.t-dropdown.is-closing`. An earlier draft of the plan guessed `.panel`, `.is-pop`,
   `.success-tick` — all wrong. The authoritative table is at the top of the plan. A wrong
   selector fails silently: the animation simply never fires.
2. **`.btn`, `.btn-red`, `.kicker`, `.h-sec`, `.lead`, `.wrap` already exist** in `global.css`
   (lines 31–52). Do not re-add them. The desk's problem was never that the wipe was missing —
   it was that the desk used `.desk-btn` (a solid red fill) and never used `.btn-red` at all.
3. **`global.css` is now 169 lines** (down from 1408): foundation, plus the sign-in and intro
   blocks that Task 14 still restyles, plus shared chart/spark primitives. Desk styling lives in
   `src/styles/desk/workspace.css` and `panes.css`.
4. **The motion sheets carry inert bridge layers** targeting the old marketing site
   (`.cal-skel`, `.wl-check`, `.faq-summary`, `.auth-input`, `.stat`). Leave them alone; do not
   wire the desk to them.
5. **Three motion sheets put their `prefers-reduced-motion` block mid-file**, not at the end,
   because a bridge layer follows. That is correct. Task 15 checks each sheet *contains* one.
6. Baseline screenshots: `.superpowers/baseline/{markets,personal}.jpg`. These predate the
   redesign and are no longer comparable — the layout has intentionally changed. Keep them only
   as a record of the old desk.
7. **`BrandLockup` styling depends on a `.brand` ancestor** (`.brand .ex`, `.brand .div`,
   `.brand .neu-logo` in global.css). Any container rendering it must include `brand` in its
   className or the wordmark silently loses its serif and red brackets. `Rail` uses
   `className="brand rail-brand"` for exactly this reason.
8. **Tasks 4-6 render markup styled by `panes.css`, which was brought forward from Task 7** so
   each task stayed visually verifiable. Task 7 kept only the deletions.

## Outstanding

All 15 tasks are done. What is left is human judgement, not code:

- ~~Nobody has watched the animations run.~~ **Done 2026-08-31.** Chrome was brought to the
  foreground (`osascript` → activate + select the tab; `visibilityState` went `hidden` →
  `visible`, rAF resumed at ~123fps) and all five were sampled frame-by-frame while running:
  accordion collapse 114.4→81.8→58.1→40.1→…→1.2px and expand 0→40.8→86→114.4px; error shake
  translateX 0→+5.6→−1.8px, replaying identically on three consecutive same-amount overspends
  (the nonce doing its job); success check stroke-dashoffset 30→10.4; balance digits opacity
  0.14→0.97; account menu opacity 0→1 over 250ms and 1→0.01 over 150ms with no stale
  `is-closing` on reopen.

  **Note for future browser testing:** setting a React controlled input via `el.value = x` is
  ignored by React's value tracker — the first shake test silently placed a real $25 bet
  instead. Use the native setter:
  `Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el, v)` then
  dispatch `input`.
- **`resize_window` is broken in this environment** — it reports success but `window.innerWidth`
  never changes, and it drops the browser-extension connection. The narrow layout was verified
  by overriding `innerWidth` (which exercises the real React drill-down) plus promoting the
  `max-width:899px` block to unconditional and clamping `#root` to 390px. That covers both the
  logic and the CSS, but not a genuine mobile viewport. Check on a real phone before shipping.
- **`MultiLineChart`'s `<svg class="mchart">` has no accessible name.** It is a data chart, so
  `aria-hidden` is the wrong fix — it wants `role="img"` and a summary label. Left alone because
  the spec puts `MultiLineChart.tsx` off limits. Worth a follow-up.
- **The account menu depends on a double `requestAnimationFrame`**, which does not run in a
  hidden tab. Queued frames fire when the tab is shown, so it self-heals — but if you ever see
  the menu mount invisible, that is the cause, not a CSS bug.
- Four `npm audit` advisories remain, deliberately out of scope.

## Scope boundary — do not cross it

**No business logic changes.** `deskStore.ts`, `terminalDb.ts`, `marketsData.ts`,
`MultiLineChart.tsx`, `DeskSpark.tsx`, `BrandLockup.tsx` and `supabase/terminal-schema.sql`
are untouched. Bet math, balances, persistence, guest-vs-live mode all behave exactly as they
do today. This work is presentation and component structure only.

Out of scope: adding a test runner, changing the data model, touching auth, resolving the four
`npm audit` advisories.

## Working agreement

- Commit after every task, using the commit message given in the plan.
- If a task's instructions turn out to be wrong (as happened in Tasks 2 and 3), **fix the plan
  file too** and say so — do not silently work around it.
- If something is genuinely ambiguous, stop and leave a note in this file rather than guessing.
- Never commit to `main`. Never force-push.
