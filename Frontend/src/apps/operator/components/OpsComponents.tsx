import { Label } from '@patternfly/react-core';
import type { ReactNode } from 'react';
import { inr } from '@/shared/catalog/catalog';
import type { ChangeRequest, Health, KycStatus, TenantKind, TenantStatus } from '@/shared/api/operatorTypes';

export const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
export const fmtTime = (iso: string) => new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
export const num = (n: number) => n.toLocaleString('en-IN');
/** ₹ in lakh or crore for large figures, as Indian finance teams read them. */
export function inrShort(n: number): string {
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`;
  return inr(n);
}

export function TenantStatusLabel({ status }: { status: TenantStatus }) {
  const c = { active: 'green', suspended: 'red', onboarding: 'blue' } as const;
  return (
    <Label color={c[status]} isCompact>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Label>
  );
}

export function KycLabel({ kyc }: { kyc: KycStatus }) {
  const c = { verified: 'green', pending: 'orange', expired: 'red' } as const;
  return (
    <Label color={c[kyc]} variant="outline" isCompact>
      KYC {kyc}
    </Label>
  );
}

export function KindLabel({ kind, realm }: { kind: TenantKind; realm?: 'shared' | 'dedicated' }) {
  const c = { commercial: 'blue', government: 'purple', regulated: 'teal' } as const;
  return (
    <Label color={c[kind]} isCompact>
      {kind.charAt(0).toUpperCase() + kind.slice(1)}
      {realm ? ` · ${realm} realm` : ''}
    </Label>
  );
}

export function HealthDot({ status }: { status: Health }) {
  const c = { operational: 'green', degraded: 'orange', outage: 'red' } as const;
  return (
    <span className={`status-dot status-dot--${c[status]}`}>
      <span className="dot" aria-hidden="true" />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

export function ChangeStatusLabel({ status }: { status: ChangeRequest['status'] }) {
  const c = { pending: 'orange', approved: 'green', rejected: 'red' } as const;
  return <Label color={c[status]}>{status === 'pending' ? 'Awaiting approval' : status.charAt(0).toUpperCase() + status.slice(1)}</Label>;
}

/** Used-of-total bar with the threshold colours operators expect (amber at 70 %, red at 85 %). */
export function Meter({ label, used, total, unit = '', note }: { label: ReactNode; used: number; total: number; unit?: string; note?: ReactNode }) {
  const pct = total ? Math.round((used / total) * 100) : 0;
  return (
    <div className={`qbar ${pct >= 85 ? 'is-bad' : pct >= 70 ? 'is-warn' : ''}`}>
      <div className="qbar__top">
        <span>{label}</span>
        <span>
          {num(Math.round(used * 10) / 10)} of {num(total)} {unit} · <strong>{pct}%</strong>
        </span>
      </div>
      <div className="qbar__track" role="meter" aria-label={typeof label === 'string' ? label : undefined} aria-valuemin={0} aria-valuemax={total} aria-valuenow={used}>
        <span className="qbar__used" style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      {note && <div className="muted small">{note}</div>}
    </div>
  );
}

/** Simple labelled bar chart with a text alternative. */
export function TrendBars({ values, labels, format, label }: { values: number[]; labels: string[]; format: (n: number) => string; label: string }) {
  const max = Math.max(...values, 1);
  return (
    <figure className="trend" aria-label={label}>
      <div className="trend__bars" role="img" aria-label={`${label}: ${values.map((v, i) => `${labels[i]} ${format(v)}`).join(', ')}`}>
        {values.map((v, i) => (
          <div key={i} className="trend__col">
            <span className="trend__value">{v ? format(v) : ''}</span>
            <div className={`trend__bar ${i === values.length - 1 ? 'is-current' : ''}`} style={{ height: `${(v / max) * 100}%` }} />
          </div>
        ))}
      </div>
      <div className="trend__labels">
        {labels.map((l) => (
          <span key={l}>{l}</span>
        ))}
      </div>
    </figure>
  );
}

/** Horizontal share bars, e.g. revenue by service. */
export function ShareBars({ rows, format }: { rows: [string, number][]; format: (n: number) => string }) {
  const total = rows.reduce((s, [, v]) => s + v, 0) || 1;
  const max = Math.max(...rows.map(([, v]) => v), 1);
  return (
    <ul className="share-bars">
      {rows.map(([k, v]) => (
        <li key={k}>
          <span className="share-bars__label">{k}</span>
          <span className="share-bars__track">
            <span style={{ width: `${(v / max) * 100}%` }} />
          </span>
          <span className="share-bars__value">
            {format(v)} <span className="muted small">{Math.round((v / total) * 100)}%</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function lastMonths(n: number): string[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - (n - 1 - i));
    return d.toLocaleDateString('en-IN', { month: 'short' });
  });
}
