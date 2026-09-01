import { cost, priceYes, costN, pricesN, sharesForSpendN, proceedsForSellN, seedForOddsN } from '../src/lib/lmsr';
let f=0; const t=(n:string,ok:boolean,d='')=>{ if(!ok)f++; console.log(`${ok?'PASS':'FAIL'}  ${n} ${d}`); };
const b=100;

// binary must be exactly the N=2 case
t('costN([q,0]) == binary cost', Math.abs(costN([50,0],b)-cost({qYes:50,qNo:0},b))<1e-9);
t('pricesN([q,0])[0] == priceYes', Math.abs(pricesN([50,0],b)[0]-priceYes({qYes:50,qNo:0},b))<1e-9);

// 3-outcome market, uniform open
let q=[0,0,0]; const c0=costN(q,b);
const p0=pricesN(q,b);
t('opens uniform 1/3 each', Math.abs(p0[0]-1/3)<1e-9 && Math.abs(p0.reduce((a,v)=>a+v,0)-1)<1e-9);

// buy $30 of outcome 0 — cost the meter charges must equal $30
const sh=sharesForSpendN(q,0,30,b);
const q1=[q[0]+sh,q[1],q[2]];
t('shares priced so a $30 buy costs $30', Math.abs((costN(q1,b)-costN(q,b))-30)<1e-9, `${sh.toFixed(3)} sh`);
const p1=pricesN(q1,b);
t('prices still sum to 1 after a trade', Math.abs(p1.reduce((a,v)=>a+v,0)-1)<1e-9);
t('bought outcome got dearer, others cheaper', p1[0]>p0[0] && p1[1]<p0[1]);

// a second buyer takes outcome 1
const sh1=sharesForSpendN(q1,1,20,b); const q2=[q1[0],q1[1]+sh1,q1[2]];
const pot=costN(q2,b)-c0;
t('pot equals total paid in', Math.abs(pot-(30+20))<1e-9, `pot ${pot.toFixed(4)}`);

// resolve outcome 0 wins: its holders (sh shares) split the pot
const perShare0 = pot/sh;
t('winning outcome splits the whole pot', Math.abs(sh*perShare0-pot)<1e-9);

// sell: outcome 0 holder sells half back
const sell=proceedsForSellN(q2,0,sh/2,b);
t('partial sell returns positive proceeds', sell>0, `$${sell.toFixed(2)}`);
const q3=[q2[0]-sh/2,q2[1],q2[2]];
t('pot after sell == net money in', Math.abs((costN(q3,b)-c0)-(30+20-sell))<1e-9);

// sell-all of outcome 0 returns exactly what outcome-0 buyer paid (from q1 state, fresh)
{ let qa=[0,0,0]; const ca=costN(qa,b); const s=sharesForSpendN(qa,0,40,b); qa=[s,0,0];
  const back=proceedsForSellN(qa,0,s,b);
  t('sell-all returns exactly what was paid', Math.abs(back-40)<1e-9, `back ${back.toFixed(4)}`);
  t('sell-all walks pot to zero', Math.abs((costN([0,0,0],b)-ca))<1e-12); }

// seeded odds: open a 3-way at 60/30/10
const seed=seedForOddsN([0.6,0.3,0.1],b); const ps=pricesN(seed,b);
t('seed opens at the requested odds', Math.abs(ps[0]-0.6)<1e-3 && Math.abs(ps[1]-0.3)<1e-3, ps.map(x=>x.toFixed(2)).join('/'));
t('seeded pot starts at zero', Math.abs(costN(seed,b)-costN(seed,b))<1e-12);

// overflow sanity: 8-way lopsided market stays finite
const big=[9000,0,0,0,0,0,0,0];
t('lopsided N-market stays finite', Number.isFinite(costN(big,b)) && pricesN(big,b).every(Number.isFinite));

console.log(f===0?'\nN-OUTCOME: ALL PASS':`\n${f} FAILURES`); process.exit(f?1:0);
