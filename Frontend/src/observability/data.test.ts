import { describe, expect, it } from 'vitest';
import { PLATFORM_TEMPLATES, TENANT_TEMPLATES, histogram, logs, metric, timeline } from './data';
import { resourceCharts } from './tenant';

const END = Date.UTC(2026, 9, 29, 10, 0, 0);

describe('observability dummy data', () => {
  it('is deterministic for the same seed and window', () => {
    const ts = timeline('24h', END);
    expect(metric('vm-1-cpu', ts, { base: 40, noise: 10 })).toEqual(metric('vm-1-cpu', ts, { base: 40, noise: 10 }));
    expect(metric('vm-1-cpu', ts, { base: 40, noise: 10 })).not.toEqual(metric('vm-2-cpu', ts, { base: 40, noise: 10 }));
  });

  it('keeps values inside bounds', () => {
    const pts = metric('x', timeline('7d', END), { base: 90, noise: 30, spikeChance: 0.2, spikeSize: 50, max: 100 });
    expect(pts).toHaveLength(84);
    expect(pts.every((p) => p.v >= 0 && p.v <= 100)).toBe(true);
  });

  it('generates sorted log lines inside the window and a histogram that adds up', () => {
    const lines = logs('w', TENANT_TEMPLATES.workload!, ['web-prod-01'], '6h', 100, END);
    expect(lines.length).toBe(600);
    expect(lines.every((l, i) => i === 0 || lines[i - 1]!.t >= l.t)).toBe(true);
    expect(lines.every((l) => l.t <= END && l.t >= END - 6 * 3600_000 - 5 * 60_000)).toBe(true);
    const total = histogram(lines, '6h', 30, END).reduce((s, b) => s + Object.values(b.counts).reduce((a, c) => a + c, 0), 0);
    expect(total).toBe(lines.length);
  });

  it('fills message placeholders', () => {
    const lines = logs('p', PLATFORM_TEMPLATES, ['cmp-w-01'], '1h', 500, END);
    expect(lines.some((l) => /\{\w+\}/.test(l.message))).toBe(false);
  });

  it('offers charts per resource kind', () => {
    const r = { id: 'res-1', catalogItemId: 'vm-linux', spec: {} };
    expect(resourceCharts(r, 'vm', '1h', END).map((c) => c.title)).toContain('CPU utilisation');
    expect(resourceCharts({ ...r, catalogItemId: 'object' }, 'storage', '1h', END)[0]!.title).toBe('Requests');
  });
});
