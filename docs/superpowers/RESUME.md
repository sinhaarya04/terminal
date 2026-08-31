# Resume: E[X] Terminal split-pane redesign

**Branch:** `desk-workspace-redesign` · **Base:** `main` @ `29035a2` (clean, matches origin)

## How to resume

Open Claude Code in `/Users/sbateman/ex-terminal` and say:

> Resume the desk redesign from docs/superpowers/RESUME.md

That is all that is needed. Everything below is for whoever (or whatever) picks it up.

---

## State as of 2026-08-31 01:45 MDT

| Task | Status | Commit |
|---|---|---|
| 1 · Motion foundation (hooks, `Reveal`, motion sheets) | ✅ done | `a10c9f3` |
| 2 · Purge `global.css` 1408 → 355 lines | ✅ done | `6fa2be3` |
| 3 · Repair `.btn`/`.btn-red`, normalise foundation radius | ✅ done | `e43bcb1` |
| 4 · Workspace shell + Markets panes | ✅ done | `4b4513a` |
| 5 · Positions panes | ✅ done | `fbeb1d0` |
| 6 · Personal panes | ✅ done | `ebdc82a` |
| 7 · Delete superseded components, `panes.css` | ✅ done | `ccce3c0` |
| 8 · Skeleton transition | ⬜ **not done** | — |
| 9 · Error shake | ✅ done | `a085e12` |
| 10 · Success check | ✅ done | `e1b0f5b` |
| 11 · Number pop-in | ✅ done | `a085e12` |
| 12 · Accordion category groups | ✅ done | `f064dee` |
| 13 · Dropdown (account menu + slide-over) | ⬜ **not done** | — |
| 14 · Restyle sign-in and intro | ✅ done | `(this commit)` |
| 15 · Pre-ship checklist | 🟡 partial — see "Outstanding" | — |

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

**Task 8 (skeleton) and Task 13 (dropdown) are not done.** Neither blocks the redesign:
- *Skeleton* attaches to `Desk.tsx`'s `checking` state, which is only truthy when Supabase env
  vars are set. In guest mode it never renders, so it could not be verified in this session.
- *Dropdown* would move Sign out / Reset demo into an account menu in the rail, and drive the
  mid-width action pane's slide-over through a four-phase mount. Both work today without it.

**Known gaps from the Task 15 sweep:**
- `MultiLineChart`'s `<svg class="mchart">` has neither `aria-hidden` nor an accessible name.
  It is a data chart, not decoration, so hiding it is the wrong fix — it wants a `role="img"`
  and a summary label. Left alone because the spec puts `MultiLineChart.tsx` off limits.
- Mid (900–1199px) and narrow (<900px) layouts are **unverified in a real browser**. The code
  paths exist and typecheck; nobody has looked at them. `resize_window` dropped the extension
  connection every time it was tried.
- The tab was backgrounded for most verification, which freezes CSS transitions at their start
  value. Animations were confirmed by reading computed styles with `transition:none` (the
  brief's own diagnostic) rather than by eye. **Someone should watch them run once.**

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
