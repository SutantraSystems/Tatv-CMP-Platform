import { Label } from '@patternfly/react-core';
import { CheckCircleIcon } from '@patternfly/react-icons';

/** An enum as a row of selectable cards (radio semantics). */
export function ChoiceCards({
  name,
  options,
  value,
  onChange,
}: {
  name: string;
  options: { value: string; title: string; hint?: string; badge?: string | null }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="choice-cards" role="radiogroup" aria-label={name}>
      {options.map((o) => {
        const checked = o.value === value;
        return (
          <label key={o.value} className={`choice-card ${checked ? 'is-checked' : ''}`}>
            <input type="radio" name={name} value={o.value} checked={checked} onChange={() => onChange(o.value)} className="visually-hidden" />
            <span className="choice-card__top">
              <span className="choice-card__title">{o.title}</span>
              {checked ? <CheckCircleIcon className="choice-card__check" aria-hidden="true" /> : o.badge ? <Label isCompact color={o.badge === 'Needs approval' ? 'orange' : 'teal'}>{o.badge}</Label> : null}
            </span>
            {o.hint && <span className="choice-card__hint">{o.hint}</span>}
            {checked && o.badge && <Label isCompact color={o.badge === 'Needs approval' ? 'orange' : 'teal'} className="choice-card__badge">{o.badge}</Label>}
          </label>
        );
      })}
    </div>
  );
}
