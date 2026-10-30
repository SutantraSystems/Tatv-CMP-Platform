import { CATALOG } from '@/shared/catalog/catalog';
import { defaults, validate } from './schema';

const schema = CATALOG.find((c) => c.id === 'vm-linux')!.schema!;

describe('catalog schema validation', () => {
  it('fills defaults and requires a name', () => {
    const v = defaults(schema);
    expect(v.flavour).toBe('s.small');
    expect(validate(schema, v).name).toBe('Instance name is required.');
  });

  it('rejects invalid names and out-of-range volumes', () => {
    const errs = validate(schema, { ...defaults(schema), name: 'Bad Name', volumeGb: 5 });
    expect(errs.name).toBeDefined();
    expect(errs.volumeGb).toBe('Minimum 20.');
  });

  it('accepts a valid request', () => {
    expect(validate(schema, { ...defaults(schema), name: 'web-01' })).toEqual({});
  });
});
