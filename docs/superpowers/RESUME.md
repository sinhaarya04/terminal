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
| 6 · Personal panes | ✅ done | `8f0a4c1` |
| 7 · Delete superseded components, `panes.css` | ✅ done | `ccce3c0` |
| 8 · Skeleton transition | ⬜ | — |
| 9 · Error shake | ⬜ | — |
| 10 · Success check | ⬜ | — |
| 11 · Number pop-in | ⬜ | — |
| 12 · Accordion category groups | ⬜ | — |
| 13 · Dropdown (account menu + slide-over) | ⬜ | — |
| 14 · Restyle sign-in and intro | ⬜ | — |
| 15 · Pre-ship checklist | ⬜ | — |

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
3. **`global.css` is now 355 lines**: foundation (lines 1–86) + the desk block (lines 88–355)
   that Task 7 replaces with `src/styles/desk/panes.css`.
4. **The motion sheets carry inert bridge layers** targeting the old marketing site
   (`.cal-skel`, `.wl-check`, `.faq-summary`, `.auth-input`, `.stat`). Leave them alone; do not
   wire the desk to them.
5. **Three motion sheets put their `prefers-reduced-motion` block mid-file**, not at the end,
   because a bridge layer follows. That is correct. Task 15 checks each sheet *contains* one.
6. Baseline screenshots for visual comparison: `.superpowers/baseline/{markets,personal}.jpg`.
   Note the Personal baseline was captured mid-`transition:color .18s`, so its active tab label
   looks muted — that is a capture artifact, not a style.

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
