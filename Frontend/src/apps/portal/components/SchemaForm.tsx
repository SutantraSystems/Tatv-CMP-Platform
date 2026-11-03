import {
  FormGroup,
  FormHelperText,
  FormSelect,
  FormSelectOption,
  HelperText,
  HelperTextItem,
  NumberInput,
  Switch,
  TextInput,
} from '@patternfly/react-core';
import type { FieldSchema, ObjectSchema } from '@/shared/api/types';
import { ChoiceCards } from '@/shared/ui/ChoiceCards';
import type { Errors, Values } from './schema';

interface Props {
  schema: ObjectSchema;
  values: Values;
  errors: Errors;
  onChange: (key: string, value: string | number | boolean) => void;
  /** Render only these fields (a form section); all fields when omitted. */
  only?: string[];
}

/** Groups a schema's fields by `x-section`, in order of first appearance. */
export function sectionsOf(schema: ObjectSchema): [string, string[]][] {
  const out: [string, string[]][] = [];
  for (const [key, f] of Object.entries(schema.properties)) {
    const name = f['x-section'] ?? 'Settings';
    const s = out.find(([n]) => n === name);
    if (s) s[1].push(key);
    else out.push([name, [key]]);
  }
  return out;
}

/**
 * Renders a catalog item's JSON Schema as PatternFly form fields.
 * New catalog items therefore need no hand-built screens.
 */
export function SchemaFields({ schema, values, errors, onChange, only }: Props) {
  const entries = Object.entries(schema.properties).filter(([k]) => !only || only.includes(k));
  return (
    <>
      {entries.map(([key, f]: [string, FieldSchema]) => {
        const fieldId = `field-${key}`;
        const error = errors[key];
        const required = schema.required?.includes(key) ?? false;
        const helper = (error || f.description) && (
          <FormHelperText>
            <HelperText>
              <HelperTextItem variant={error ? 'error' : 'default'} id={`${fieldId}-help`}>
                {error ?? f.description}
              </HelperTextItem>
            </HelperText>
          </FormHelperText>
        );

        if (f.type === 'boolean') {
          return (
            <FormGroup key={key} fieldId={fieldId}>
              <Switch id={fieldId} label={f.title} isChecked={Boolean(values[key])} onChange={(_e, c) => onChange(key, c)} />
              {helper}
            </FormGroup>
          );
        }
        if (f.enum && f['x-widget'] === 'cards') {
          return (
            <FormGroup key={key} label={f.title} isRequired={required} fieldId={fieldId} role="group">
              <ChoiceCards
                name={f.title}
                value={String(values[key] ?? '')}
                onChange={(v) => onChange(key, v)}
                options={f.enum.map((v, i) => ({ value: v, title: f['x-enumLabels']?.[i] ?? v, hint: f['x-enumHints']?.[i], badge: f['x-enumBadges']?.[i] }))}
              />
              {helper}
            </FormGroup>
          );
        }
        if (f.type === 'integer' && f['x-widget'] === 'stepper') {
          const n = Number(values[key] ?? f.default ?? 0) || 0;
          const lo = f.minimum ?? 0;
          const hi = f.maximum ?? Number.MAX_SAFE_INTEGER;
          return (
            <FormGroup key={key} label={f.title} isRequired={required} fieldId={fieldId}>
              <NumberInput
                id={fieldId}
                value={n}
                min={lo}
                max={hi}
                onMinus={() => onChange(key, Math.max(lo, n - 1))}
                onPlus={() => onChange(key, Math.min(hi, n + 1))}
                onChange={(e) => {
                  const v = Number((e.target as HTMLInputElement).value);
                  onChange(key, Number.isNaN(v) ? lo : Math.min(hi, Math.max(lo, Math.floor(v))));
                }}
                inputName={key}
                inputAriaLabel={f.title}
                minusBtnAriaLabel={`Fewer ${f.title.toLowerCase()}`}
                plusBtnAriaLabel={`More ${f.title.toLowerCase()}`}
                validated={error ? 'error' : 'default'}
              />
              {helper}
            </FormGroup>
          );
        }
        if (f.enum) {
          return (
            <FormGroup key={key} label={f.title} isRequired={required} fieldId={fieldId}>
              <FormSelect
                id={fieldId}
                value={String(values[key] ?? '')}
                onChange={(_e, v) => onChange(key, v)}
                validated={error ? 'error' : 'default'}
                aria-describedby={`${fieldId}-help`}
              >
                {f.enum.map((v, i) => (
                  <FormSelectOption key={v} value={v} label={f['x-enumLabels']?.[i] ?? v} />
                ))}
              </FormSelect>
              {helper}
            </FormGroup>
          );
        }
        return (
          <FormGroup key={key} label={f.title} isRequired={required} fieldId={fieldId}>
            <TextInput
              id={fieldId}
              type={f.type === 'integer' ? 'number' : 'text'}
              value={values[key] === undefined ? '' : String(values[key])}
              onChange={(_e, v) => onChange(key, f.type === 'integer' ? (v === '' ? '' : Number(v)) : v)}
              validated={error ? 'error' : 'default'}
              aria-describedby={`${fieldId}-help`}
              isRequired={required}
            />
            {helper}
          </FormGroup>
        );
      })}
    </>
  );
}
