# Supabase project map — dtgciwhecaqwnddzepiz

One shared project ("sinhaarya04's Project"), three apps. Every table also
carries this as a `comment on table`, so the Supabase Table Editor shows it.

## Poker — Showdown portal
| Table | What it is |
| --- | --- |
| `users` | Player profiles: display name, avatar + hat cosmetics. **Not** terminal users. |
| `bots` | Uploaded poker-bot submissions; code at `storage_path`, `status` tracks validation. |
| `tournaments` | Tournament definitions and phase/round state. |
| `matches` | One table of a tournament round. |
| `match_bots` | Bot seating, final stacks, chip deltas per match. |
| `hands` | Hand-by-hand history (streets, pot, action log). |
| `hand_winners` | Who won each hand, and how much. |
| `leaderboard` | Cumulative bot standings per tournament. |

## Landing site
| Table | What it is |
| --- | --- |
| `applicants` | Club membership applications; `token` feeds the `join-discord` edge function. |

## Terminal
| Table | What it is |
| --- | --- |
| `waitlist` | Terminal launch waitlist (name + email). |
| `term_profiles` | Terminal accounts: balance, seen-intro. Made by `term_ensure_profile()` on first sign-in — deliberately no signup trigger, since `auth.users` is shared with poker. |
| `term_markets` | Prediction markets — private share-code + lazily-materialised board markets. |
| `term_bets` | Individual bets; written only via `term_place_bet`. |
| `term_activity` | Private-market feed (create/join/bet/resolve), written inside the RPCs. |

`auth.users` is shared by all three apps. It carries exactly two triggers —
`enforce_northeastern_email` and the poker portal's `on_auth_user_created` —
and the terminal must never add one.
