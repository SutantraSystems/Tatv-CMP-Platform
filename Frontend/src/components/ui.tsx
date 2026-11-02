import { Button, Card, CardBody, ClipboardCopy, Tooltip } from '@patternfly/react-core';
import { CopyIcon } from '@patternfly/react-icons';
import { useState, type ReactNode } from 'react';
import { monthlyPrice } from '../api/catalog';
import type { Resource } from '../api/types';

export function StatCard({ label, value, sub, icon, tone = 'blue' }: { label: string; value: ReactNode; sub?: ReactNode; icon?: ReactNode; tone?: 'blue' | 'teal' | 'violet' | 'green' | 'red' }) {
  return (
    <Card className="stat-card" isFullHeight>
      <CardBody>
        <div className="stat-card__head">
          <span className="eyebrow">{label}</span>
          {icon && <span className={`icon-tile icon-tile--${tone}`}>{icon}</span>}
        </div>
        <div className="stat-card__value">{value}</div>
        {sub && <div className="stat-card__sub">{sub}</div>}
      </CardBody>
    </Card>
  );
}

/** Monospace value with a copy button (IDs, IP addresses). */
export function CopyValue({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="copy-value">
      <code>{value}</code>
      <Tooltip content={copied ? 'Copied' : `Copy ${label ?? value}`}>
        <Button
          variant="plain"
          size="sm"
          aria-label={`Copy ${label ?? value}`}
          icon={<CopyIcon />}
          onClick={() => {
            void navigator.clipboard?.writeText(value).then(
              () => setCopied(true),
              () => setCopied(false),
            );
            setTimeout(() => setCopied(false), 1500);
          }}
        />
      </Tooltip>
    </span>
  );
}

export function CopyEndpoint({ value }: { value: string }) {
  return (
    <ClipboardCopy isReadOnly hoverTip="Copy" clickTip="Copied" variant="inline-compact">
      {value}
    </ClipboardCopy>
  );
}

/** Indicative monthly cost of a resource while it is in its current state (compute is not billed when shut down). */
export function resourceMonthly(r: Resource): number | undefined {
  const full = monthlyPrice(r.catalogItemId, r.spec);
  if (full === undefined) return undefined;
  if (r.status === 'stopped' || r.status === 'decommissioned') return monthlyPrice(r.catalogItemId, r.spec, true);
  if (['awaiting_approval', 'rejected', 'deleted'].includes(r.status)) return 0;
  return full;
}

/** Month-to-date estimate: the monthly rate prorated over hours since the later of creation and the 1st of the month. */
export function monthToDate(r: Resource): number | undefined {
  const m = resourceMonthly(r);
  if (m === undefined) return undefined;
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  const from = Math.max(start.getTime(), new Date(r.createdAt).getTime());
  const hours = Math.max(0, (Date.now() - from) / 3600_000);
  return (m / 730) * hours;
}

/** Deterministic pseudo-random series per resource, standing in for the observability plane. */
export function series(seed: string, n: number, base: number, spread: number): number[] {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return Array.from({ length: n }, (_, i) => {
    h = (h * 1103515245 + 12345) >>> 0;
    const wave = Math.sin((i / n) * Math.PI * 2 + (h % 7)) * spread * 0.5;
    return Math.max(1, Math.min(100, Math.round(base + wave + ((h % 1000) / 1000 - 0.5) * spread)));
  });
}

export function BarChart({ values, labels, unit = '%', label }: { values: number[]; labels: string[]; unit?: string; label: string }) {
  const max = Math.max(...values, 1);
  const peak = values.indexOf(Math.max(...values));
  return (
    <figure className="chart" aria-label={label}>
      <div className="bar-chart" role="img" aria-label={`${label}: ${values.map((v, i) => `${labels[i] ?? ''} ${v}${unit}`).join(', ')}`}>
        {values.map((v, i) => (
          <div key={i} className={`bar ${i === peak ? 'bar--peak' : ''}`} style={{ height: `${(v / max) * 100}%` }} title={`${labels[i] ?? ''}: ${v}${unit}`} />
        ))}
      </div>
      <div className="chart-axis">
        {labels.filter((_, i) => i % Math.ceil(labels.length / 4) === 0).map((l) => (
          <span key={l}>{l}</span>
        ))}
      </div>
    </figure>
  );
}

export function AreaChart({ a, b, labels, label }: { a: number[]; b: number[]; labels: string[]; label: string }) {
  const w = 600;
  const h = 200;
  const max = Math.max(...a, ...b, 1) * 1.1;
  const pts = (v: number[]) => v.map((y, i) => `${(i / (v.length - 1)) * w},${h - (y / max) * h}`).join(' ');
  return (
    <figure className="chart" aria-label={label}>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="area-chart" role="img" aria-label={`${label}: average in ${avg(a)} MB/s, out ${avg(b)} MB/s`}>
        <polygon points={`0,${h} ${pts(a)} ${w},${h}`} className="area area--a" />
        <polyline points={pts(a)} className="line line--a" />
        <polygon points={`0,${h} ${pts(b)} ${w},${h}`} className="area area--b" />
        <polyline points={pts(b)} className="line line--b" />
      </svg>
      <div className="chart-axis">
        {labels.filter((_, i) => i % Math.ceil(labels.length / 4) === 0).map((l) => (
          <span key={l}>{l}</span>
        ))}
      </div>
    </figure>
  );
}

export const avg = (v: number[]) => Math.round((v.reduce((s, x) => s + x, 0) / Math.max(1, v.length)) * 10) / 10;

/** Clock labels for the last hour in ten-minute steps. */
export function lastHourLabels(n: number): string[] {
  const now = Date.now();
  return Array.from({ length: n }, (_, i) => new Date(now - (n - 1 - i) * (3600_000 / (n - 1))).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }));
}
