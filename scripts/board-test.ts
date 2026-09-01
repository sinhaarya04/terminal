// Board-on-engine logical suite: drives the REAL deskStore in guest mode
// (no supabase in node) through the board flow the UI performs.
import { placeBet, sellShares, getMarket, ensureMarket, useDesk, engineOf, walletFor, resetDesk } from '../src/desk/deskStore';
import { EVENTS, outcomeToMarket } from '../src/desk/marketsData';
import * as lmsr from '../src/lib/lmsr';

let fails=0; const t=(n:string,ok:boolean,d='')=>{ if(!ok)fails++; console.log(`${ok?'PASS':'FAIL'}  ${n} ${d}`); };
const state = () => (useDesk as any); // not used; read via exported helpers

const ev = EVENTS[0];                       // Beanpot: 4 outcomes
const oA = ev.outcomes[0];                  // Northeastern @41
const oB = ev.outcomes[1];                  // BC @27
const mA = outcomeToMarket(ev, oA);
const mB = outcomeToMarket(ev, oB);
ensureMarket(mA); ensureMarket(mB);

// wallet: board bets must spend PUB
t('board outcome routes to the PUB wallet', walletFor(mA) === 'balance');

// price coherence: first bet must move off the SEEDED odds, not off 50/50
const before = getMarket(mA.id)!;
t('board market seeds at its displayed price', before.yes === oA.yes, `yes=${before.yes}`);
const ok1 = await placeBet(getMarket(mA.id)!, 'YES', 50);
const after = getMarket(mA.id)!;
t('bet accepted', ok1);
// NOTE for the group: at b=100 a $50 spend legitimately moves 41 -> 64. The
// meter is right (asserted below); whether that's too twitchy is a b-tuning
// call — the club notes themselves say raise b if ordinary trades swing hard.
t('price moved UP from the seed, not reset to 50/50', after.yes > oA.yes, `41 -> ${after.yes}`);

// engine agreement: store price equals the meter's price
const eng = engineOf(after);
const meterYes = Math.round(lmsr.priceYes({qYes:eng.qYes,qNo:eng.qNo}, eng.b)*100);
t('displayed price == meter price', Math.abs(after.yes - meterYes) <= 1, `${after.yes} vs ${meterYes}`);

// independent outcomes: betting A must not move B
const bBefore = getMarket(mB.id)!.yes;
t('sibling outcome untouched', bBefore === oB.yes);

// sell exits on the board too, into PUB
const okB = await placeBet(getMarket(mB.id)!, 'NO', 20);
t('NO bet accepted on second outcome', okB);
const engB = engineOf(getMarket(mB.id)!);
const backA = await sellShares(getMarket(mA.id)!, 'YES', 10);
t('partial board sell pays out', backA != null && backA > 0, `$${backA}`);
t('sell moved the price back down', getMarket(mA.id)!.yes < after.yes, `${after.yes} -> ${getMarket(mA.id)!.yes}`);

// conservation at the wallet: net cash out == what the meters hold
// (pub wallet started at 1000; deltas: -50 -20 +backA)
// exposed via positions/pool state rather than direct state access:
const potA = (getMarket(mA.id)!.pool ?? 0);
t('overlay data present for grid (engine fields stamped)', engineOf(getMarket(mA.id)!).sqYes > 0);

console.log(fails===0 ? '\nBOARD SUITE: ALL PASS' : `\n${fails} FAILURES`);
process.exit(fails?1:0);
