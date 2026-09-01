// Invariant suite for the hybrid engine — the spec, not just examples.
// Run: npx esbuild scripts/lmsr-test.ts --bundle --format=esm --platform=node \
//        --outfile=/tmp/lmsr-test.mjs && node /tmp/lmsr-test.mjs
import { cost, priceYes, costToTrade, sharesForSpend, seedForOdds, pot, resolvePot, proceedsForSell } from '../src/lib/lmsr';
const near=(a:number,b:number,eps=0.02)=>Math.abs(a-b)<=eps;
let fails=0; const t=(name:string,ok:boolean,detail='')=>{ if(!ok)fails++; console.log(`${ok?'PASS':'FAIL'}  ${name} ${detail}`); };

// ---- the doc's worked example, b=100, fresh market -------------------------
const b=100; let q={qYes:0,qNo:0}; const c0=cost(q,b);
t('opens 50/50', near(priceYes(q,b),0.5,1e-9));
const costA=costToTrade(q,'YES',50,b);
t('A: 50 YES costs 28.10', near(costA,28.10), costA.toFixed(4));
q={qYes:50,qNo:0};
t('price ticks to ~62%', near(priceYes(q,b),0.622,0.005), priceYes(q,b).toFixed(4));
const costB=costToTrade(q,'NO',50,b);
// doc says 21.88 from rounded intermediates; exact is 100·(0.5+ln2) − C(50,0) = 21.907
t('B: 50 NO costs 21.91', near(costB,21.907), costB.toFixed(4));
q={qYes:50,qNo:50};
t('price back to 50/50', near(priceYes(q,b),0.5,1e-9));
const P=pot(q,c0,b);
// doc says 49.98; the exact pot is C(50,50)−C(0,0) = 100·(0.5+ln2)−100·ln2 = 50, on the nose
t('pot is exactly 50.00', Math.abs(P-50)<1e-9, P.toFixed(6));
const r=resolvePot(P,50);
t('YES pays ~1.00/share', near(r.perShare,1.0,0.001), r.perShare.toFixed(6));
t('A nets +21.91 (B loses the same)', near(50*r.perShare-costA,21.907,0.001));
t('conservation: payout == pot exactly', Math.abs(50*r.perShare-P)<1e-9);

// ---- one-sided market nets zero (the "only profit when others are wrong" test)
let q2={qYes:0,qNo:0}; const c02=cost(q2,b);
const spend1=costToTrade(q2,'YES',80,b); q2={qYes:80,qNo:0};
const P2=pot(q2,c02,b);
t('one-sided: pot equals exactly what YES paid', Math.abs(P2-spend1)<1e-9);
t('one-sided: YES splits its own money back, nets ~0', Math.abs(80*resolvePot(P2,80).perShare-spend1)<1e-9);

// ---- sharesForSpend inverts costToTrade ------------------------------------
let q3={qYes:37,qNo:12};
const sh=sharesForSpend(q3,'NO',25,b);
t('inverse: shares bought for $25 cost $25 back', near(costToTrade(q3,'NO',sh,b),25,1e-9), sh.toFixed(4));

// ---- seeded opening odds ---------------------------------------------------
const seed=seedForOdds(0.62,b); const c0s=cost(seed,b);
t('seed opens at 62%', near(priceYes(seed,b),0.62,1e-9));
t('seeded pot starts at zero', Math.abs(pot(seed,c0s,b))<1e-12);
const buy=sharesForSpend(seed,'YES',25,b);
const q4={qYes:seed.qYes+buy,qNo:seed.qNo};
t('seeded: pot after $25 buy is exactly $25', Math.abs(pot(q4,c0s,b)-25)<1e-9);
t('phantom seed never pays: split over REAL shares only', near(buy*resolvePot(pot(q4,c0s,b),buy).perShare,25,1e-9));

// ---- selling: a true exit, conservation intact -----------------------------
{
  const sq={qYes:0,qNo:0}; const sc0=cost(sq,b);
  const paid=costToTrade(sq,'YES',60,b);
  const q1={qYes:60,qNo:0};
  const back=proceedsForSell(q1,'YES',60,b);
  t('sell-all returns exactly what was paid', Math.abs(back-paid)<1e-9, `paid=${paid.toFixed(4)} back=${back.toFixed(4)}`);
  const q0={qYes:0,qNo:0};
  t('sell-all walks the pot back to zero', Math.abs(pot(q0,sc0,b))<1e-12);
  // partial sell after the other side traded: seller banks the price move
  let qq={qYes:60,qNo:0};
  const noCost=costToTrade(qq,'NO',30,b); qq={qYes:60,qNo:30};
  const sellHalf=proceedsForSell(qq,'YES',30,b);
  const qAfter={qYes:30,qNo:30};
  t('partial sell: pot still equals net money in',
    Math.abs(pot(qAfter,sc0,b) - (paid + noCost - sellHalf)) < 1e-9);
  t('pot never goes negative on bounded sells', pot(qAfter,sc0,b) > 0);
}

// ---- zero-winner void ------------------------------------------------------
t('empty winning side voids', resolvePot(10,0).voided===true);

// ---- overflow sanity -------------------------------------------------------
const big={qYes:5000,qNo:0};
t('lopsided market stays finite', Number.isFinite(cost(big,b)) && Number.isFinite(priceYes(big,b)), `p=${priceYes(big,b)}`);

console.log(fails===0?'\nALL PASS':`\n${fails} FAILURES`);
process.exit(fails===0?0:1);
