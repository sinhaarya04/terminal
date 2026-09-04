// Editor for a multi-outcome market's outcomes. Two or more named outcomes,
// add/remove rows, capped at what the engine allows (12). Opening odds are left
// uniform — officers/creators can seed them, but for a club "who wins" the even
// open is the honest default and the price discovers from there.
import Icon from './Icon';

export type OutcomeDraft = { name: string };

export default function OutcomeEditor({
  outcomes, onChange,
}: { outcomes: OutcomeDraft[]; onChange: (o: OutcomeDraft[]) => void }) {
  const set = (i: number, name: string) => onChange(outcomes.map((o, j) => (j === i ? { name } : o)));
  const add = () => outcomes.length < 12 && onChange([...outcomes, { name: '' }]);
  const remove = (i: number) => outcomes.length > 2 && onChange(outcomes.filter((_, j) => j !== i));

  return (
    <div className="oe">
      <span className="tk-label mono">Outcomes</span>
      {outcomes.map((o, i) => (
        <div className="oe-row" key={i}>
          <span className="oe-idx mono">{i + 1}</span>
          <input
            className="tk-input oe-input" value={o.name} maxLength={40}
            placeholder={`Outcome ${i + 1}`} aria-label={`Outcome ${i + 1} name`}
            onChange={(e) => set(i, e.target.value)}
          />
          <button type="button" className="oe-del" aria-label={`Remove outcome ${i + 1}`}
            disabled={outcomes.length <= 2} onClick={() => remove(i)}><Icon name="close" size={14} /></button>
        </div>
      ))}
      {outcomes.length < 12 && (
        <button type="button" className="oe-add" onClick={add}><Icon name="plus" size={13} />Add outcome</button>
      )}
    </div>
  );
}
