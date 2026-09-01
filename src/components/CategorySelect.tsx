import { useState } from 'react';
import { CATEGORIES } from '../desk/marketsData';

// Category picker: the built-in categories plus any the club has added, with an
// "Add new…" option that reveals an inline field. Custom categories persist in
// localStorage so they stay in the dropdown for next time — a lightweight
// taxonomy without a DB table for it.
const CUSTOM_KEY = 'ex_custom_cats_v1';

function loadCustom(): string[] {
  try { return JSON.parse(localStorage.getItem(CUSTOM_KEY) || '[]'); } catch { return []; }
}
function saveCustom(list: string[]) {
  try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(list)); } catch { /* quota — the value still applies this session */ }
}

const ADD = '__add__';

export default function CategorySelect({
  value, onChange,
}: { value: string; onChange: (cat: string) => void }) {
  const [custom, setCustom] = useState<string[]>(loadCustom);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');

  // the current value might be a custom one not yet in either list (e.g. an
  // edited existing market) — fold it in so the select can show it selected
  const all = [...new Set([...CATEGORIES, ...custom, ...(value && !CATEGORIES.includes(value as never) ? [value] : [])])];

  const commit = () => {
    const c = draft.trim();
    if (!c) { setAdding(false); return; }
    if (!all.includes(c)) { const next = [...custom, c]; setCustom(next); saveCustom(next); }
    onChange(c);
    setDraft('');
    setAdding(false);
  };

  if (adding) {
    return (
      <div className="cat-add">
        <input
          className="tk-input" autoFocus value={draft} maxLength={16}
          placeholder="New category" aria-label="New category name"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } if (e.key === 'Escape') setAdding(false); }}
        />
        <button type="button" className="btn btn-red cat-add-go" onClick={commit}>Add</button>
      </div>
    );
  }

  return (
    <select
      className="tk-input cat-select"
      value={value}
      onChange={(e) => { if (e.target.value === ADD) { setAdding(true); } else onChange(e.target.value); }}
    >
      {all.map((c) => <option key={c} value={c}>{c}</option>)}
      <option value={ADD}>+ Add new…</option>
    </select>
  );
}
