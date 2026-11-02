import type { ObjectSchema } from '../api/types';

export type Values = Record<string, string | number | boolean>;
export type Errors = Record<string, string>;

/** Initial form values from schema defaults. */
export function defaults(schema: ObjectSchema): Values {
  const v: Values = {};
  for (const [key, f] of Object.entries(schema.properties)) {
    if (f.default !== undefined) v[key] = f.default;
    else if (f.type === 'boolean') v[key] = false;
    else if (f.type === 'string') v[key] = '';
  }
  return v;
}

/** Validates values against the catalog schema; the API repeats the same checks server-side. */
export function validate(schema: ObjectSchema, values: Values): Errors {
  const errors: Errors = {};
  for (const [key, f] of Object.entries(schema.properties)) {
    const v = values[key];
    const empty = v === undefined || v === '' || (typeof v === 'number' && Number.isNaN(v));
    if (empty) {
      if (schema.required?.includes(key)) errors[key] = `${f.title} is required.`;
      continue;
    }
    if (f.type === 'string') {
      const s = String(v);
      if (f.enum && !f.enum.includes(s)) errors[key] = `Choose a valid ${f.title.toLowerCase()}.`;
      else if (f.minLength !== undefined && s.length < f.minLength) errors[key] = `At least ${f.minLength} characters.`;
      else if (f.maxLength !== undefined && s.length > f.maxLength) errors[key] = `At most ${f.maxLength} characters.`;
      else if (f.pattern && !new RegExp(f.pattern).test(s)) errors[key] = f.description ?? 'Invalid format.';
    } else if (f.type === 'integer') {
      const n = Number(v);
      if (!Number.isInteger(n)) errors[key] = 'Enter a whole number.';
      else if (f.minimum !== undefined && n < f.minimum) errors[key] = `Minimum ${f.minimum}.`;
      else if (f.maximum !== undefined && n > f.maximum) errors[key] = `Maximum ${f.maximum}.`;
    }
  }
  return errors;
}
