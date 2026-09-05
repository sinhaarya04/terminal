import { useEffect, useMemo, useRef, useState } from 'react';
import { CATEGORIES, yesOutcome, type Category, type MarketEvent } from '../marketsData';
import { useDesk, adminCreateBoardMarket, adminCreateFromKalshi, adminCreateMultiFromKalshi, createMultiMarket } from '../deskStore';
import { searchKalshiCatalog, kalshiEventOptionCount, type KalshiCatalogItem } from '../terminalDb';
import { useTilt } from '../useTilt';
import Icon from '../../components/Icon';
import type { Side } from '../deskStore';
import DateTimeField from '../../components/DateTimeField';
import CategorySelect from '../../components/CategorySelect';
import OutcomeEditor, { type OutcomeDraft } from '../../components/OutcomeEditor';
import { endOfDay } from '../../lib/closeTime';

// The Kalshi catalog carries its own coarse taxonomy, distinct from the desk's
// seven board categories. An empty value means "every category".
const KALSHI_CATS = [
  'Sports', 'Politics', 'Elections', 'Economics', 'Financials', 'Companies',
  'Culture', 'Entertainment', 'Science and Technology', 'Climate and Weather',
  'Health', 'World', 'Crypto',
];

type Filter = 'All' | 'Live' | Category;
type View = 'grid' | 'list';
const FILTERS: Filter[] = ['All', 'Live', ...CATEGORIES];
const VIEW_KEY = 'ex.markets.view';

const vol = (n: number) => (n >= 1000 ? (n / 1000).toFixed(1) + 'K' : String(n));

// the choice is a per-viewer convenience, so a failed read must never block the
// board — private windows and blocked site data both throw here
function readView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid';
  } catch {
    return 'grid';
  }
}

type Outcome = MarketEvent['outcomes'][number];
export type OpenFn = (ev: MarketEvent, pick?: { o: Outcome; side: Side }) => void;

// A binary event gets the chance figure and priced quick buttons on its card;
// anything else shows its ladder.
const yesNo = yesOutcome;

export default function MarketsGrid({ events, onOpen }: { events: MarketEvent[]; onOpen: OpenFn }) {
  const { isAdmin } = useDesk();
  const [filter, setFilter] = useState<Filter>('All');
  const [view, setView] = useState<View>(readView);
  const [adminOpen, setAdminOpen] = useState(false);

  useEffect(() => {
    try { localStorage.setItem(VIEW_KEY, view); } catch { /* not worth surfacing */ }
  }, [view]);

  const list = useMemo(() => {
    if (filter === 'All') return events;
    if (filter === 'Live') return events.filter((e) => e.live);
    return events.filter((e) => e.cat === filter);
  }, [filter, events]);

  return (
    <div className="grid-wrap">
      <div className="grid-head">
        <div className="kicker">Markets<span className="title-count">{list.length}</span></div>
        <div className="head-actions">
          {isAdmin && (
            <button className={`btn ${adminOpen ? 'btn-ghost' : 'btn-red'} admin-new`} onClick={() => setAdminOpen((o) => !o)}>
              {adminOpen ? <><Icon name="close" />Cancel</> : <><Icon name="plus" />New board market</>}
            </button>
          )}
        </div>
      </div>
      {isAdmin && adminOpen && <AdminCreate onDone={() => setAdminOpen(false)} />}

      <div className="grid-bar">
        <nav className="grid-filters" role="tablist" aria-label="Category">
          {FILTERS.map((f) => (
            <button
              key={f}
              role="tab"
              aria-selected={filter === f}
              className={`grid-filter ${filter === f ? 'is-on' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f === 'Live' ? <span className="t-shimmer" data-text="Live">Live</span> : f}
            </button>
          ))}
        </nav>

        <div className="view-toggle" role="group" aria-label="View">
          <button
            className={`view-btn ${view === 'grid' ? 'is-on' : ''}`}
            aria-pressed={view === 'grid'}
            onClick={() => setView('grid')}
            title="Grid view"
          >
            <Icon name="grid" size={14} />
            <span className="u-sr">Grid</span>
          </button>
          <button
            className={`view-btn ${view === 'list' ? 'is-on' : ''}`}
            aria-pressed={view === 'list'}
            onClick={() => setView('list')}
            title="List view"
          >
            <Icon name="list" size={14} />
            <span className="u-sr">List</span>
          </button>
        </div>
      </div>

      {view === 'grid' ? (
        <div className="grid">
          {list.map((ev) => <Card key={ev.id} ev={ev} onOpen={onOpen} />)}
        </div>
      ) : (
        <div className="mlist">
          <div className="mlist-head mono" aria-hidden="true">
            <span>Market</span><span>Top outcome</span><span className="r">Chance</span><span>Trade</span><span className="r">Volume</span><span className="r">Updated</span>
          </div>
          {list.map((ev) => <Row key={ev.id} ev={ev} onOpen={onOpen} />)}
        </div>
      )}

      {list.length === 0 && (
        <div className="pane-empty">
          <p className="pane-empty-title">Nothing here yet</p>
          <p className="pane-empty-sub">No open markets in this category. Try another filter.</p>
        </div>
      )}
    </div>
  );
}

function OutcomeLine({ o }: { o: MarketEvent['outcomes'][number] }) {
  return (
    <span className="mkt-row">
      <span className="mkt-name">
        {o.meta && <span className="mkt-meta">{o.meta}</span>}{o.name}
      </span>
      <span className="mkt-pct mono">{o.yes}%</span>
      {/* the bar is the whole reason these read at a glance */}
      <span className="mkt-bar"><i style={{ width: `${o.yes}%`, background: o.color }} /></span>
    </span>
  );
}

// Movement since the start of the outcome's price path: the number a trader
// glances at before the chance itself.
function ChanceDelta({ o }: { o: Outcome }) {
  const d = o.path.length > 1 ? Math.round(o.yes - o.path[0]) : 0;
  if (!d) return <span className="mkt-chance-delta is-flat">0</span>;
  return <span className={`mkt-chance-delta ${d > 0 ? 'is-yes' : 'is-no'}`}>{d > 0 ? '+' : ''}{d}</span>;
}

function Card({ ev, onOpen }: { ev: MarketEvent; onOpen: OpenFn }) {
  const [expanded, setExpanded] = useState(false);
  const tilt = useTilt(4);
  const sorted = [...ev.outcomes].sort((a, b) => b.yes - a.yes);
  const yes = yesNo(ev);
  const top = yes ? [yes] : sorted.slice(0, 5);
  const rest = yes ? [] : sorted.slice(5);

  const open = () => onOpen(ev);
  const quick = (side: Side) => (e: React.MouseEvent) => {
    e.stopPropagation();
    if (yes) onOpen(ev, { o: yes, side });
  };
  // The tile is a role="button" div so the expand toggle can be a real nested
  // <button> without nesting buttons. Match a native button's keyboard open.
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
  };
  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setExpanded((v) => !v);
  };

  return (
    <div
      className={`mkt${expanded ? ' is-expanded' : ''}`}
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={onKey}
      aria-label={`Open ${ev.title}`}
      {...(expanded ? {} : tilt)}
    >
      <span className="mkt-top">
        <span className="mkt-cat">{ev.cat}</span>
        {ev.live && <span className="mkt-live"><span className="t-shimmer" data-text="Live">Live</span></span>}
      </span>

      <span className="mkt-title">{ev.title}</span>

      {yes ? (
        <span className="mkt-chance">
          <span>
            <em>Chance</em>
            <b>{yes.yes}%</b>
          </span>
          <span className="mkt-bar"><i style={{ width: `${yes.yes}%`, background: yes.color }} /></span>
          <ChanceDelta o={yes} />
        </span>
      ) : (
      <span className="mkt-rows">
        {top.map((o) => <OutcomeLine key={o.name} o={o} />)}
        {expanded && rest.map((o) => <OutcomeLine key={o.name} o={o} />)}
        {rest.length > 0 && (
          <button
            type="button"
            className="mkt-more-btn mono"
            aria-expanded={expanded}
            onClick={toggle}
          >
            {expanded ? 'Show less' : `${rest.length} more`}
          </button>
        )}
      </span>
      )}

      {yes && (
        <span className="mkt-qa">
          <button type="button" className="qa is-yes" onClick={quick('YES')} aria-label={`Buy Yes at ${yes.yes} cents`}>
            Yes <b>{yes.yes}¢</b>
          </button>
          <button type="button" className="qa is-no" onClick={quick('NO')} aria-label={`Buy No at ${100 - yes.yes} cents`}>
            No <b>{100 - yes.yes}¢</b>
          </button>
        </span>
      )}

      <span className="mkt-foot">
        <span><Icon name="signal" />{vol(ev.vol)} vol</span>
        <span><Icon name="clock" />{ev.closes ?? ev.updated}</span>
      </span>
    </div>
  );
}

function Row({ ev, onOpen }: { ev: MarketEvent; onOpen: OpenFn }) {
  const lead = [...ev.outcomes].sort((a, b) => b.yes - a.yes)[0];
  const more = ev.outcomes.length - 1;
  const quick = (side: Side) => (e: React.MouseEvent) => { e.stopPropagation(); onOpen(ev, { o: lead, side }); };

  return (
    <div className="mrow" role="button" tabIndex={0} onClick={() => onOpen(ev)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(ev); } }}
      aria-label={`Open ${ev.title}`}>
      <span className="mrow-main">
        <span className="mrow-meta">
          <span className="mkt-cat">{ev.cat}</span>
          {ev.live && <span className="mkt-live" style={{ marginLeft: 0 }}><span className="t-shimmer" data-text="Live">Live</span></span>}
        </span>
        <span className="mrow-title">{ev.title}</span>
      </span>

      <span className="mrow-lead">
        <span className="mrow-name">
          <i className="dot" style={{ background: lead.color }} />
          {lead.name}
          {more > 0 && <em className="mrow-more mono">+{more}</em>}
        </span>
        <span className="mrow-bar"><i style={{ width: `${lead.yes}%`, background: lead.color }} /></span>
      </span>

      <span className="mrow-pct r">{lead.yes}%</span>
      <span className="mrow-qa">
        <button type="button" className="qa is-yes" onClick={quick('YES')} aria-label={`Buy Yes on ${lead.name}`}>Yes <b>{lead.yes}¢</b></button>
        <button type="button" className="qa is-no" onClick={quick('NO')} aria-label={`Buy No on ${lead.name}`}>No <b>{100 - lead.yes}¢</b></button>
      </span>
      <span className="mrow-vol r">{vol(ev.vol)}</span>
      <span className="mrow-upd r">{ev.closes ?? ev.updated}</span>
    </div>
  );
}


function AdminCreate({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<'manual' | 'kalshi'>('manual');

  return (
    <div className="admin-create">
      <div className="admin-mode" role="tablist" aria-label="Create mode">
        <button type="button" role="tab" aria-selected={mode === 'manual'}
          className={`admin-mode-tab mono ${mode === 'manual' ? 'is-on' : ''}`}
          onClick={() => setMode('manual')}>Manual</button>
        <button type="button" role="tab" aria-selected={mode === 'kalshi'}
          className={`admin-mode-tab mono ${mode === 'kalshi' ? 'is-on' : ''}`}
          onClick={() => setMode('kalshi')}>Add from Kalshi</button>
      </div>
      {mode === 'manual' ? <ManualCreate onDone={onDone} /> : <KalshiPicker />}
    </div>
  );
}

function ManualCreate({ onDone }: { onDone: () => void }) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('Campus');
  const [yes, setYes] = useState(50);
  const [closesAt, setClosesAt] = useState<number>(() => endOfDay(7));
  const [multi, setMulti] = useState(false);
  const [outcomes, setOutcomes] = useState<OutcomeDraft[]>([{ name: '' }, { name: '' }]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const named = outcomes.map((o) => o.name.trim()).filter(Boolean);
  const canSubmit = q.trim() && (!multi || named.length >= 2) && !busy;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    const code = multi
      ? await createMultiMarket({ q, cat, closes: '', closesAt, outcomes: named, probs: named.map(() => 1 / named.length), board: true })
      : await adminCreateBoardMarket({ q, cat, yes, closesAt });
    setBusy(false);
    if (code) { setQ(''); setOutcomes([{ name: '' }, { name: '' }]); onDone(); }
    else setErr('Could not create — admins only, and requires a live account.');
  };

  return (
    <form className="admin-create-form" onSubmit={submit}>
      <div className="admin-create-grid">
        <label className="tk-field">
          <span className="tk-label mono">Question</span>
          <input className="tk-input" value={q} maxLength={120}
            placeholder="Will Northeastern win the Beanpot?" onChange={(e) => setQ(e.target.value)} />
        </label>
        <div className="tk-field">
          <span className="tk-label mono">Category</span>
          <CategorySelect value={cat} onChange={setCat} />
        </div>
        <div className="tk-field">
          <span className="tk-label mono">Type</span>
          <div className="mtype" role="radiogroup" aria-label="Market type">
            <button type="button" role="radio" aria-checked={!multi} className={`mtype-opt ${!multi ? 'is-on' : ''}`} onClick={() => setMulti(false)}>Yes / No</button>
            <button type="button" role="radio" aria-checked={multi} className={`mtype-opt ${multi ? 'is-on' : ''}`} onClick={() => setMulti(true)}>Multiple outcomes</button>
          </div>
        </div>
        {!multi && (
          <label className="tk-field">
            <span className="tk-label mono">Opening Yes · {yes}%</span>
            <input className="tk-range" type="range" min={5} max={95} value={yes}
              onChange={(e) => setYes(Number(e.target.value))} />
          </label>
        )}
        <div className="tk-field">
          <span className="tk-label mono">Closes</span>
          <DateTimeField value={closesAt} onChange={setClosesAt} label="Board market close" />
        </div>
        {multi && <div className="tk-field admin-outcomes"><OutcomeEditor outcomes={outcomes} onChange={setOutcomes} /></div>}
      </div>
      <button className="btn btn-red admin-create-go" type="submit" disabled={!canSubmit}>
        {busy ? 'Creating…' : 'Create board market'}
      </button>
      {err && <p className="join-msg mono is-no" role="alert">{err}</p>}
    </form>
  );
}

const CAP = 50;

// One rendered picker row: either a single binary market, or a mutually-
// exclusive Kalshi event collapsed into a single "Add event" row.
type BinaryEntry = { kind: 'binary'; item: KalshiCatalogItem };
type EventEntry = {
  kind: 'event'; eventTicker: string; eventTitle: string; category: string;
  options: KalshiCatalogItem[]; lead: KalshiCatalogItem;
};
type PickerEntry = BinaryEntry | EventEntry;

function KalshiPicker() {
  const [cat, setCat] = useState('');
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [rows, setRows] = useState<KalshiCatalogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [added, setAdded] = useState<{ ticker: string; code: string } | null>(null);
  // A late response from a stale query must never overwrite a newer one.
  const seq = useRef(0);
  // True option counts per event (the page is capped, so grouping under-counts).
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const run = ++seq.current;
    setLoading(true);
    setErr('');
    searchKalshiCatalog(cat, debounced, CAP)
      .then((res) => { if (run === seq.current) setRows(res); })
      .catch(() => { if (run === seq.current) setErr('Could not reach the catalog — try again.'); })
      .finally(() => { if (run === seq.current) setLoading(false); });
  }, [cat, debounced]);

  // Group the returned page: mutually-exclusive events collapse to one "Add
  // event" row (the whole event becomes one multi market); everything else
  // stays a per-market binary "Add" row. Grouping is within the fetched page,
  // matching the server-side .limit — the "refine your search" hint covers the
  // rest. Rows arrive ordered by odds ascending, so an event's lead is its max.
  const entries = useMemo<PickerEntry[]>(() => {
    const groups = new Map<string, KalshiCatalogItem[]>();
    const order: ({ t: 'b'; item: KalshiCatalogItem } | { t: 'e'; ticker: string })[] = [];
    for (const r of rows) {
      if (r.eventMutuallyExclusive && r.eventTicker) {
        const g = groups.get(r.eventTicker);
        if (g) { g.push(r); }
        else { groups.set(r.eventTicker, [r]); order.push({ t: 'e', ticker: r.eventTicker }); }
      } else {
        order.push({ t: 'b', item: r });
      }
    }
    return order.map<PickerEntry>((o) => {
      if (o.t === 'b') return { kind: 'binary', item: o.item };
      const options = groups.get(o.ticker)!;
      const lead = options.reduce((a, b) => (b.yesOdds > a.yesOdds ? b : a), options[0]);
      return { kind: 'event', eventTicker: o.ticker, eventTitle: options[0].eventTitle, category: options[0].category, options, lead };
    });
  }, [rows]);

  // Fetch the true option count for each mutually-exclusive event on the page.
  useEffect(() => {
    const evTickers = [...new Set(
      rows.filter((r) => r.eventMutuallyExclusive && r.eventTicker).map((r) => r.eventTicker as string),
    )];
    if (!evTickers.length) { setCounts({}); return; }
    let cancelled = false;
    Promise.all(evTickers.map(async (t) => [t, await kalshiEventOptionCount(t)] as const))
      .then((pairs) => { if (!cancelled) setCounts(Object.fromEntries(pairs)); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [rows]);

  const addBinary = async (item: KalshiCatalogItem) => {
    setPending(item.ticker);
    setErr('');
    const code = await adminCreateFromKalshi(item.ticker);
    setPending(null);
    if (code) {
      setRows((rs) => rs.filter((r) => r.ticker !== item.ticker));
      setAdded({ ticker: item.ticker, code });
    } else {
      setErr('Could not add — admins only, and requires a live account.');
    }
  };

  const addEvent = async (ev: EventEntry) => {
    setPending(ev.eventTicker);
    setErr('');
    const code = await adminCreateMultiFromKalshi(ev.eventTicker);
    setPending(null);
    if (code) {
      setRows((rs) => rs.filter((r) => r.eventTicker !== ev.eventTicker));
      setAdded({ ticker: ev.eventTicker, code });
    } else {
      setErr('Could not add — admins only, and requires a live account.');
    }
  };

  const capped = rows.length >= CAP;

  return (
    <div className="kalshi">
      <div className="kalshi-bar">
        <label className="tk-field kalshi-cat">
          <span className="tk-label mono">Category</span>
          <select className="tk-input cat-select" value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="">All categories</option>
            {KALSHI_CATS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="tk-field kalshi-search">
          <span className="tk-label mono">Search</span>
          <input className="tk-input" value={q} maxLength={80}
            placeholder="Search Kalshi markets by question…" onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>

      {added && (
        <p className="kalshi-ok mono" role="status">
          Added to the board as <strong>{added.code}</strong>.
        </p>
      )}
      {err && <p className="join-msg mono is-no" role="alert">{err}</p>}

      <div className="kalshi-list">
        {loading && rows.length === 0 ? (
          <p className="kalshi-hint mono">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="kalshi-hint mono">No open markets match — widen the category or search.</p>
        ) : (
          entries.map((e) => (e.kind === 'event' ? (
            <div className="kalshi-row" key={`ev-${e.eventTicker}`}>
              <span className="kalshi-main">
                <span className="kalshi-title">{e.eventTitle}</span>
                <span className="kalshi-sub mono">
                  <span className="kalshi-tag">{e.category}</span>
                  <span className="kalshi-opt">{counts[e.eventTicker] ?? e.options.length} options</span>
                </span>
              </span>
              <span className="kalshi-odds mono">{Math.round(e.lead.yesOdds)}&#162;</span>
              <button className="btn btn-red kalshi-add" type="button"
                disabled={pending === e.eventTicker} onClick={() => addEvent(e)}>
                {pending === e.eventTicker ? 'Adding…' : 'Add event'}
              </button>
            </div>
          ) : (
            <div className="kalshi-row" key={e.item.ticker}>
              <span className="kalshi-main">
                <span className="kalshi-title">{e.item.eventTitle}</span>
                <span className="kalshi-sub mono">
                  <span className="kalshi-tag">{e.item.category}</span>
                  {e.item.subTitle && <span className="kalshi-opt">{e.item.subTitle}</span>}
                </span>
              </span>
              <span className="kalshi-odds mono">{Math.round(e.item.yesOdds)}&#162;</span>
              <button className="btn btn-red kalshi-add" type="button"
                disabled={pending === e.item.ticker} onClick={() => addBinary(e.item)}>
                {pending === e.item.ticker ? 'Adding…' : 'Add'}
              </button>
            </div>
          )))
        )}
      </div>

      {capped && (
        <p className="kalshi-hint mono">Showing the first {CAP} — refine your search to narrow it.</p>
      )}
    </div>
  );
}
