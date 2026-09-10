import { useEffect, useState, type FormEvent } from 'react';
import DeskSpark from '../DeskSpark';
import LiquidRange from '../../components/LiquidRange';
import DateTimeField from '../../components/DateTimeField';
import OutcomeEditor, { type OutcomeDraft } from '../../components/OutcomeEditor';
import { endOfDay, formatClose, relativeClose } from '../../lib/closeTime';
import { useNow } from '../../lib/useNow';
import {
  createMarket, createMultiMarket, resolveMarket, resolveMulti, refreshMulti, outcomePrices,
  marketActivity, participants, useDesk, marketPhase, refreshLiveMarket,
  money, type Activity, type DeskMarket, type Side,
} from '../deskStore';
export type PersonalSel = { kind: 'new' } | { kind: 'market'; m: DeskMarket };

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
  return <MarketView code={sel.m.id} />;
}

// Reads the market out of the store rather than trusting the selection, so a
// settle (or someone's bet) repaints this pane instead of showing the snapshot
// that was current when the row was clicked.
function MarketView({ code }: { code: string }) {
  const { custom, user, userId, isAdmin } = useDesk();
  const m = custom.find((x) => x.id === code);
  if (!m) return <div className="pane-body pane-empty"><p className="mono">Market not found</p></div>;

  const feed = marketActivity(code);
  const people = participants(code);
  // Same split as resolveMarket: auth id when the market came from the server,
  // handle when it's a local guest market.
  const isOwner = m.ownerId != null ? m.ownerId === userId : m.owner === (user?.handle || 'you');
  // Re-reads on the shared 30s tick, so a market crosses into `closed` on its
  // own rather than waiting for the next click.
  const now = useNow();
  const phase = marketPhase(m, now);

  // Live mode: pull the server's view of this market on open, and again on
  // every 30s tick while it stays open — cheap polling that makes other
  // people's bets, joins and the settle show up without a reload.
  useEffect(() => { void (m.isMulti ? refreshMulti(code) : refreshLiveMarket(code)); }, [code, now, m.isMulti]);

  return (
    <div className="pane-body">
      <div className="detail-meta">
        <span className="mkt-cat">{m.isMulti ? `${m.outcomes?.length ?? 0} outcomes` : 'Yes / No'}</span>
        <span className="sep" />
        <span>Closes {m.closesAt != null ? formatClose(m.closesAt) : m.closes}</span>
        {m.closesAt != null && phase !== 'settled' && (
          <><span className="sep" /><span className="close-rel">{relativeClose(m.closesAt, now)}</span></>
        )}
        <span className="sep" />
        <span>by @{m.owner}</span>
      </div>
      <h2 className="detail-h">{m.q}</h2>

      {phase === 'closed' && (
        <p className="settled-banner mono" role="status">
          Closed — betting has stopped.{' '}
          {isOwner ? 'Settle it below to pay everyone out.' : `Waiting on @${m.owner} to settle it.`}
        </p>
      )}

      {m.resolved && (
        <p className={`settled-banner mono ${m.resolved === 'YES' ? 'is-yes' : m.resolved === 'NO' ? 'is-no' : ''}`} role="status">
          {m.resolved === 'VOID'
            ? 'Voided — nobody held the winning outcome, so every stake was refunded'
            : m.resolved === 'MULTI'
              ? `Settled · ${m.outcomes?.find((o) => o.idx === m.resolvedIdx)?.name ?? 'a winner'} won — the ${money(m.pool || 0)} pot split across its holders`
              : `Settled ${m.resolved} · the ${money(m.pool || 0)} pot was split across the winning shares`}
        </p>
      )}

      {m.spark && <DeskSpark pts={m.spark} up={m.spark[m.spark.length - 1] >= m.spark[0]} id={`pv-${m.id}`} />}

      {m.isMulti ? (
        <MultiOutcomes m={m} />
      ) : (
        <div className="tk-calc mono">
          {/* the pot is what winners split — everything traders paid in, nothing minted */}
          <div><span>POT</span><b className="is-yes">{money(m.pool || 0)}</b></div>
          <div><span>YES</span><b>{m.yes}¢</b></div>
          <div><span>NO</span><b>{100 - m.yes}¢</b></div>
          <PotCut m={m} />
        </div>
      )}

      <Participants people={people} owner={m.owner} />

      {(isOwner || isAdmin) && phase !== 'settled' && (
        m.isMulti ? <MultiSettle m={m} /> : <SettleBox code={code} q={m.q} />
      )}

      <Feed feed={feed} />
    </div>
  );
}

// The outcome ladder for a multi market: name, live softmax price, and your
// holding if any. Read-only — trading happens in the ticket pane.
function MultiOutcomes({ m }: { m: DeskMarket }) {
  const { positions } = useDesk();
  const prices = outcomePrices(m);
  const outs = m.outcomes ?? [];
  return (
    <>
      <div className="tk-calc mono">
        <div><span>POT</span><b className="is-yes">{money(m.pool || 0)}</b></div>
      </div>
      <div className="mo-list">
        {outs.map((o, i) => {
          const held = positions.filter((p) => p.marketId === m.id && p.outcomeIdx === o.idx && !p.settled).reduce((a, p) => a + p.shares, 0);
          const won = m.resolved === 'MULTI' && m.resolvedIdx === o.idx;
          return (
            <div className={`mo-row ${won ? 'is-won' : ''}`} key={o.idx}>
              <span className="mo-name">{o.name}{won && <em className="mo-badge mono">winner</em>}</span>
              <span className="mo-held mono">{held > 0 ? `${held.toFixed(1)} sh` : ''}</span>
              <span className="mo-price mono">{prices[i]}¢</span>
            </div>
          );
        })}
      </div>
    </>
  );
}

// Officer/owner picks the winning outcome. Pays that outcome's holders out of
// the pot; a winner with no shares voids and refunds.
function MultiSettle({ m }: { m: DeskMarket }) {
  const [pending, setPending] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const outs = m.outcomes ?? [];
  const chosen = outs.find((o) => o.idx === pending);
  const confirm = async () => {
    if (pending == null || busy) return;
    setBusy(true);
    const ok = await resolveMulti(m, pending);
    setBusy(false);
    if (!ok) setErr('Could not settle this market.'); else setPending(null);
  };
  return (
    <section className="pv-block pv-settle">
      <div className="pv-head mono">Settle · pick the winner</div>
      {pending != null ? (
        <>
          <p className="pv-confirm">Settle <b>{chosen?.name}</b> as the winner? The
            {' '}{money(m.pool || 0)} pot splits across everyone holding it; every other
            outcome pays nothing. Can't be undone.</p>
          <div className="pv-settle-row">
            <button className="btn btn-red pv-btn" type="button" onClick={confirm} disabled={busy}>{busy ? 'Settling…' : `Confirm ${chosen?.name}`}</button>
            <button className="pv-cancel" type="button" onClick={() => setPending(null)} disabled={busy}>Cancel</button>
          </div>
        </>
      ) : (
        <div className="mo-settle-grid">
          {outs.map((o) => (
            <button key={o.idx} type="button" className="tk-side pv-btn" onClick={() => setPending(o.idx)}>{o.name}</button>
          ))}
        </div>
      )}
      {err && <p className="join-msg mono is-no" role="alert">{err}</p>}
    </section>
  );
}

// "You hold 40 YES — worth $31 (18% of the pot) if YES resolves." The live
// readout that makes the pot real: your claim moves as others pile in.
function PotCut({ m }: { m: DeskMarket }) {
  const { positions } = useDesk();
  const mine = positions.filter((p) => p.marketId === m.id && !p.settled);
  if (mine.length === 0 || m.resolved) return null;
  const pot = m.pool || 0;
  return (
    <>
      {(['YES', 'NO'] as const).map((side) => {
        const held = mine.filter((p) => p.side === side).reduce((a, p) => a + p.shares, 0);
        if (held <= 0) return null;
        const total = side === 'YES' ? (m.sqYes ?? held) : (m.sqNo ?? held);
        const cut = total > 0 ? held * (pot / total) : 0;
        const pct = total > 0 ? Math.round((held / total) * 100) : 0;
        return (
          <div key={side}>
            <span>YOUR CUT IF {side}</span>
            <b className={side === 'YES' ? 'is-yes' : 'is-no'}>{money(cut)} · {pct}%</b>
          </div>
        );
      })}
    </>
  );
}

function Participants({ people, owner }: { people: { handle: string; at: number }[]; owner?: string }) {
  if (people.length === 0) return null;
  return (
    <section className="pv-block">
      <div className="pv-head mono">In this market · {people.length}</div>
      <ul className="pv-people">
        {people.map((p) => (
          <li key={p.handle} className="pv-person">
            <span className="pv-dot" aria-hidden="true" />
            <span className="pv-handle mono">@{p.handle}</span>
            {p.handle === owner && <em className="pv-tag mono">owner</em>}
          </li>
        ))}
      </ul>
    </section>
  );
}

// Settling pays real credits out, and there is no undo, so the outcome needs a
// second deliberate click rather than one stray one.
function SettleBox({ code, q }: { code: string; q: string }) {
  const [pending, setPending] = useState<Side | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const confirm = async () => {
    if (!pending || busy) return;
    setBusy(true);
    const credited = await resolveMarket(code, pending);
    setBusy(false);
    if (credited === null) { setErr('Could not settle this market.'); setPending(null); }
  };

  return (
    <section className="pv-block pv-settle">
      <div className="pv-head mono">Settle this market</div>
      {pending ? (
        <>
          <p className="pv-confirm">
            Settle <b>{pending}</b> for “{q}”? The pot splits across everyone
            holding {pending}; the other side gets nothing. If nobody holds
            {' '}{pending}, the market voids and all stakes are refunded. This
            can't be undone.
          </p>
          <div className="pv-settle-row">
            <button className="btn btn-red pv-btn" type="button" onClick={confirm} disabled={busy}>
              {busy ? 'Settling…' : `Confirm ${pending}`}
            </button>
            <button className="pv-cancel" type="button" onClick={() => setPending(null)} disabled={busy}>
              Cancel
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="pv-sub">Pick the outcome that actually happened. Holders are paid immediately.</p>
          <div className="pv-settle-row">
            <button className="tk-side is-yes pv-btn" type="button" onClick={() => setPending('YES')}>YES</button>
            <button className="tk-side is-no pv-btn" type="button" onClick={() => setPending('NO')}>NO</button>
          </div>
        </>
      )}
      {err && <p className="join-msg mono is-no" role="alert">{err}</p>}
    </section>
  );
}

const ago = (at: number) => {
  const mins = Math.max(0, Math.round((Date.now() - at) / 60_000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  return hrs < 24 ? `${hrs}h ago` : `${Math.round(hrs / 24)}d ago`;
};

function line(a: Activity) {
  switch (a.kind) {
    case 'create':  return 'opened the market';
    case 'join':    return 'joined';
    case 'resolve': return a.outcome ? `settled it — ${a.outcome} won` : a.side ? `settled it ${a.side}` : 'voided the market — stakes refunded';
    case 'bet':     return `bought ${a.outcome ?? a.side} · ${money(a.dollars || 0)}`;
    case 'sell':    return `sold ${a.outcome ?? a.side} · ${money(a.dollars || 0)}`;
  }
}

function Feed({ feed }: { feed: Activity[] }) {
  return (
    <section className="pv-block">
      <div className="pv-head mono">Activity</div>
      {feed.length === 0 ? (
        <p className="pv-sub">Nothing yet. Share the code and the first bet shows up here.</p>
      ) : (
        <ul className="pv-feed">
          {feed.map((a) => (
            <li key={a.id} className={`pv-ev ${a.kind === 'resolve' ? 'is-settle' : ''}`}>
              <span className="pv-handle mono">@{a.handle}</span>
              <span className={`pv-what ${a.side === 'YES' ? 'is-yes' : a.side === 'NO' ? 'is-no' : ''}`}>
                {line(a)}
              </span>
              <span className="pv-when mono">{ago(a.at)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CreateForm({ onCreated }: { onCreated: (m: DeskMarket) => void }) {
  const [q, setQ] = useState('');
  // Every personal market is private — a category field was a question with
  // only one answer.
  const cat = 'Private';
  // Every market gets a close now, defaulting to tomorrow night. Optional free
  // text is what produced markets that never ended.
  const [closesAt, setClosesAt] = useState<number>(() => endOfDay(1));
  const [yes, setYes] = useState(50);
  const [multi, setMulti] = useState(false);
  const [outcomes, setOutcomes] = useState<OutcomeDraft[]>([{ name: '' }, { name: '' }]);
  const [busy, setBusy] = useState(false);
  const { live } = useDesk();

  const named = outcomes.map((o) => o.name.trim()).filter(Boolean);
  const canSubmit = q.trim() && (!multi || named.length >= 2) && !busy;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    if (multi) {
      const code = await createMultiMarket({
        q, cat, closes: formatClose(closesAt), closesAt,
        outcomes: named, probs: named.map(() => 1 / named.length), board: false,
      });
      setBusy(false);
      if (code) { setQ(''); setOutcomes([{ name: '' }, { name: '' }]); onCreated({ id: code, q, cat, yes: 0, closes: formatClose(closesAt), spark: [], custom: true } as DeskMarket); }
      return;
    }
    const m = await createMarket({ q, cat, closes: formatClose(closesAt), yes, closesAt });
    setBusy(false);
    setQ(''); setClosesAt(endOfDay(1)); setYes(50);
    onCreated(m);
  };

  return (
    <form className="pane-body" onSubmit={submit}>
      <div className="kicker">Create a market</div>
      <label className="tk-field">
        <span className="tk-label mono">Question</span>
        <input
          className="tk-input"
          value={q}
          maxLength={120}
          placeholder="Will we hit the gym 4x this week?"
          onChange={(e) => setQ(e.target.value)}
        />
      </label>
      <div className="tk-field">
        <span className="tk-label mono">Closes</span>
        <DateTimeField value={closesAt} onChange={setClosesAt} label="Market close date and time" />
      </div>
      <div className="tk-field">
        <span className="tk-label mono">Type</span>
        <div className="mtype" role="radiogroup" aria-label="Market type">
          <button type="button" role="radio" aria-checked={!multi} className={`mtype-opt ${!multi ? 'is-on' : ''}`} onClick={() => setMulti(false)}>Yes / No</button>
          <button type="button" role="radio" aria-checked={multi} className={`mtype-opt ${multi ? 'is-on' : ''}`} onClick={() => setMulti(true)} disabled={!live} title={live ? '' : 'Multiple outcomes need a live account'}>Multiple outcomes</button>
        </div>
      </div>
      {multi && <div className="tk-field"><OutcomeEditor outcomes={outcomes} onChange={setOutcomes} /></div>}
      {!multi && <div className="tk-field">
        <span className="tk-label mono">Opening Yes odds · {yes}¢</span>
        <LiquidRange
          value={yes}
          min={5}
          max={95}
          onChange={setYes}
          label={`Opening Yes odds, ${yes} cents`}
        />
      </div>}
      <button className="btn btn-red tk-go" type="submit" disabled={!canSubmit}>
        {busy ? 'Creating…' : 'Generate share code'}
      </button>
    </form>
  );
}
