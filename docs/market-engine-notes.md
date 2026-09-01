# Market engine — decision record

The terminal's private markets run the club's hybrid engine:
**LMSR pricing, parimutuel payout.** Full rationale lives in the club's
platform notes; the operative rules are:

- Pricing: C(q_yes,q_no) = b·ln(e^(q_yes/b) + e^(q_no/b)); a trade costs ΔC;
  the quoted price is the softmax slope. b = 100.
- Payout: at resolution the pot (C(now) − C(at open)) is split across the
  winning side's REAL held shares. Points are conserved exactly — profit can
  only come from other players, never be minted.
- Zero winning shares → void and refund every stake (the friendlier rule).
- Opening odds: the create-form slider seeds the PRICING quantities only
  (q_side = b·ln(p/(1−p)) on one side); seed shares are phantom — they set
  the opening price but never receive payout, and the pot baseline c0 is
  C(seed) so the pot starts at zero.
- Implementation is mirrored: src/lib/lmsr.ts (client engine for guest mode
  and display) and plpgsql helpers in terminal-schema.sql (authoritative in
  live mode). Both must reproduce the worked example in this file's tests:
  b=100, A buys 50 YES for 28.10, B buys 50 NO for 21.88, pot 49.98,
  YES resolves → 0.9996/share, A nets +21.88, B −21.88.
