/**
 * Dummy observability data for the prototypes.
 *
 * Everything is deterministic for a given seed and time window, so a resource always shows the same
 * history and the screens are reproducible in tests and screenshots. In production these come from
 * the tenant plane (VictoriaMetrics per project, OpenSearch per organisation) and the operator plane.
 */

export type RangeId = '1h' | '6h' | '24h' | '7d';

export const RANGES: { id: RangeId; label: string; points: number; stepMs: number }[] = [
  { id: '1h', label: 'Last hour', points: 60, stepMs: 60_000 },
  { id: '6h', label: 'Last 6 hours', points: 72, stepMs: 5 * 60_000 },
  { id: '24h', label: 'Last 24 hours', points: 96, stepMs: 15 * 60_000 },
  { id: '7d', label: 'Last 7 days', points: 84, stepMs: 2 * 3600_000 },
];
export const rangeOf = (id: RangeId) => RANGES.find((r) => r.id === id)!;

/** Small, fast, seedable PRNG (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

export interface Point {
  t: number;
  v: number;
}
export interface Series {
  name: string;
  points: Point[];
}

/** Timestamps for a window ending at `end`, aligned to the step so the same window gives the same data. */
export function timeline(range: RangeId, end = Date.now()): number[] {
  const r = rangeOf(range);
  const last = Math.floor(end / r.stepMs) * r.stepMs;
  return Array.from({ length: r.points }, (_, i) => last - (r.points - 1 - i) * r.stepMs);
}

export interface Shape {
  /** Typical level. */
  base: number;
  /** Size of the daily swing (busier in office hours, IST). */
  daily?: number;
  /** Random noise around the level. */
  noise?: number;
  /** Chance per point of a short spike, and its height. */
  spikeChance?: number;
  spikeSize?: number;
  min?: number;
  max?: number;
}

/** A metric series: daily pattern + noise + occasional spikes; the value at a timestamp depends only on seed and time. */
export function metric(seed: string, ts: number[], shape: Shape): Point[] {
  const { base, daily = 0, noise = 0, spikeChance = 0, spikeSize = 0, min = 0, max = Infinity } = shape;
  const s = hash(seed);
  return ts.map((t) => {
    const r = rng(s ^ Math.floor(t / 60_000));
    const istHour = ((t / 3600_000 + 5.5) % 24 + 24) % 24;
    const dayCurve = Math.sin(((istHour - 9) / 24) * Math.PI * 2) * 0.5 + 0.5; // peaks mid-afternoon IST
    let v = base + daily * (dayCurve - 0.5) + (r() - 0.5) * 2 * noise;
    if (r() < spikeChance) v += spikeSize * (0.6 + r() * 0.4);
    return { t, v: Math.round(Math.min(max, Math.max(min, v)) * 10) / 10 };
  });
}

export const avgOf = (p: Point[]) => (p.length ? Math.round((p.reduce((s, x) => s + x.v, 0) / p.length) * 10) / 10 : 0);
export const maxOf = (p: Point[]) => (p.length ? Math.max(...p.map((x) => x.v)) : 0);
export const lastOf = (p: Point[]) => p.at(-1)?.v ?? 0;

/* ---------------- Logs ---------------- */

export type Severity = 'debug' | 'info' | 'warning' | 'error' | 'critical';
export const SEVERITIES: Severity[] = ['critical', 'error', 'warning', 'info', 'debug'];

export interface LogLine {
  id: string;
  t: number;
  severity: Severity;
  source: string;
  /** Resource or component the line is about. */
  subject: string;
  message: string;
  fields: Record<string, string | number>;
}

export interface Template {
  source: string;
  severity: Severity;
  /** Relative frequency. */
  weight: number;
  /** `{subject}`, `{n}`, `{ms}`, `{ip}`, `{user}`, `{pct}`, `{id}` are filled in. */
  text: string;
}

const USERS = ['Meera Iyer', 'Ravi Kumar', 'Asha Rao'];

/** Log lines for a window: count scales with the window and is deterministic for the seed and window start. */
export function logs(seed: string, templates: Template[], subjects: string[], range: RangeId, perHour: number, end = Date.now()): LogLine[] {
  if (!templates.length || !subjects.length) return [];
  const r0 = rangeOf(range);
  const span = r0.points * r0.stepMs;
  const start = Math.floor(end / r0.stepMs) * r0.stepMs - span;
  const total = Math.min(1500, Math.max(20, Math.round((span / 3600_000) * perHour)));
  const rand = rng(hash(seed) ^ Math.floor(start / r0.stepMs));
  const weightSum = templates.reduce((s, t) => s + t.weight, 0);
  const pick = () => {
    let x = rand() * weightSum;
    for (const t of templates) {
      x -= t.weight;
      if (x <= 0) return t;
    }
    return templates.at(-1)!;
  };
  const out: LogLine[] = [];
  for (let i = 0; i < total; i++) {
    const tpl = pick();
    const subject = subjects[Math.floor(rand() * subjects.length)] ?? subjects[0]!;
    const vals = {
      subject,
      n: String(Math.floor(rand() * 900) + 100),
      ms: String(Math.floor(rand() * 400) + 8),
      ip: `10.20.${Math.floor(rand() * 4)}.${Math.floor(rand() * 240) + 4}`,
      user: USERS[Math.floor(rand() * USERS.length)]!,
      pct: String(Math.floor(rand() * 30) + 55),
      id: Math.floor(rand() * 0xffffff).toString(16).padStart(6, '0'),
    };
    const message = tpl.text.replace(/\{(\w+)\}/g, (_, k: keyof typeof vals) => vals[k] ?? '');
    const t = start + Math.floor(rand() * span);
    out.push({
      id: `${seed}-${start}-${i}`,
      t,
      severity: tpl.severity,
      source: tpl.source,
      subject,
      message,
      fields: { source: tpl.source, subject, severity: tpl.severity, host: `${subject}`, trace_id: vals.id + vals.n },
    });
  }
  return out.sort((a, b) => b.t - a.t);
}

/** Counts per time bucket and severity, for the log histogram. */
export function histogram(lines: LogLine[], range: RangeId, buckets = 30, end = Date.now()): { t: number; counts: Record<Severity, number> }[] {
  const r0 = rangeOf(range);
  const span = r0.points * r0.stepMs;
  const start = Math.floor(end / r0.stepMs) * r0.stepMs - span;
  const size = span / buckets;
  const out = Array.from({ length: buckets }, (_, i) => ({ t: start + i * size, counts: { debug: 0, info: 0, warning: 0, error: 0, critical: 0 } as Record<Severity, number> }));
  for (const l of lines) {
    const i = Math.min(buckets - 1, Math.max(0, Math.floor((l.t - start) / size)));
    out[i]!.counts[l.severity]++;
  }
  return out;
}

/* ---------------- Templates ---------------- */

export const TENANT_TEMPLATES: Record<string, Template[]> = {
  workload: [
    { source: 'Workload', severity: 'info', weight: 30, text: 'nginx: GET /api/orders 200 {ms}ms' },
    { source: 'Workload', severity: 'info', weight: 12, text: 'nginx: POST /api/payments 201 {ms}ms' },
    { source: 'Workload', severity: 'info', weight: 6, text: 'sshd: Accepted publickey for ubuntu from {ip}' },
    { source: 'Workload', severity: 'info', weight: 5, text: 'systemd: Started Daily apt download activities' },
    { source: 'Workload', severity: 'warning', weight: 4, text: 'nginx: upstream response time {ms}ms exceeds 300ms for /api/orders' },
    { source: 'Workload', severity: 'warning', weight: 2, text: 'kernel: TCP: request_sock_TCP: possible SYN flooding on port 443' },
    { source: 'Workload', severity: 'error', weight: 2, text: 'app[orders]: payment gateway timeout after 30s (order {n})' },
    { source: 'Workload', severity: 'error', weight: 1, text: 'nginx: GET /api/orders 502 Bad Gateway' },
    { source: 'Workload', severity: 'debug', weight: 6, text: 'app[orders]: cache hit ratio 0.{pct}' },
  ],
  kubernetes: [
    { source: 'Kubernetes', severity: 'info', weight: 10, text: 'Pod orders-api-{id} started container api' },
    { source: 'Kubernetes', severity: 'info', weight: 6, text: 'ReplicaSet orders-api scaled to {pct} percent of target' },
    { source: 'Kubernetes', severity: 'info', weight: 4, text: 'HorizontalPodAutoscaler: new size 4; reason: cpu above target' },
    { source: 'Kubernetes', severity: 'warning', weight: 3, text: 'Back-off restarting failed container worker in pod jobs-{id}' },
    { source: 'Kubernetes', severity: 'warning', weight: 1, text: 'FailedScheduling: 0/3 nodes available: insufficient nvidia.com/gpu' },
    { source: 'Kubernetes', severity: 'error', weight: 1, text: 'OOMKilled: container worker exceeded 2Gi memory limit' },
  ],
  database: [
    { source: 'Database', severity: 'info', weight: 10, text: 'checkpoint complete: wrote {n} buffers' },
    { source: 'Database', severity: 'info', weight: 8, text: 'connection authorized: user=app database=orders' },
    { source: 'Database', severity: 'info', weight: 4, text: 'automatic vacuum of table "orders.public.line_items"' },
    { source: 'Database', severity: 'warning', weight: 3, text: 'duration: {n}0 ms statement: SELECT * FROM line_items WHERE ...' },
    { source: 'Database', severity: 'warning', weight: 1, text: 'replication lag {ms}ms on replica 2' },
    { source: 'Database', severity: 'error', weight: 1, text: 'FATAL: password authentication failed for user "report"' },
  ],
  activity: [
    { source: 'Activity trail', severity: 'info', weight: 8, text: '{user} started {subject}' },
    { source: 'Activity trail', severity: 'info', weight: 6, text: '{user} took a snapshot of {subject}' },
    { source: 'Activity trail', severity: 'info', weight: 5, text: '{user} signed in with single sign-on' },
    { source: 'Activity trail', severity: 'info', weight: 3, text: '{user} added tag environment:production to {subject}' },
    { source: 'Activity trail', severity: 'warning', weight: 2, text: '{user} shut down {subject}' },
    { source: 'Activity trail', severity: 'warning', weight: 1, text: 'Policy denied {user}: quota for vCPUs would be exceeded' },
  ],
};

export const PLATFORM_TEMPLATES: Template[] = [
  { source: 'OpenStack', severity: 'info', weight: 20, text: 'nova-compute: instance {id} spawned successfully on {subject}' },
  { source: 'OpenStack', severity: 'info', weight: 10, text: 'cinder-volume: volume {id} attached over FC (PowerMax, masking view mv-{n})' },
  { source: 'OpenStack', severity: 'info', weight: 8, text: 'ovn-controller: claiming logical port {id} for chassis {subject}' },
  { source: 'OpenStack', severity: 'warning', weight: 3, text: 'nova-scheduler: no valid host for flavour g.gpu1; GPU placement group full' },
  { source: 'OpenStack', severity: 'error', weight: 1, text: 'neutron: port binding failed for {id} on {subject}; retrying' },
  { source: 'CMP', severity: 'info', weight: 18, text: 'temporal: workflow ProvisionVm-{id} completed in {ms}0 ms' },
  { source: 'CMP', severity: 'info', weight: 8, text: 'metering: hourly batch sent to Kill Bill, {n} usage records' },
  { source: 'CMP', severity: 'warning', weight: 2, text: 'kafka: consumer group audit-writer lag {n} messages on audit.events' },
  { source: 'CMP', severity: 'error', weight: 1, text: 'temporal: activity CreateLoadBalancer timed out after 300s (attempt 3)' },
  { source: 'Storage', severity: 'info', weight: 6, text: 'PowerMax: storage resource pool SRP_1 at {pct}% of usable capacity' },
  { source: 'Storage', severity: 'warning', weight: 2, text: 'Cloudian: node {subject} rebuilding, {pct}% complete; no client impact' },
  { source: 'Network', severity: 'info', weight: 6, text: 'leaf {subject}: BGP neighbour 172.20.252.{n} established' },
  { source: 'Network', severity: 'warning', weight: 1, text: 'leaf {subject}: interface Ethernet1/{n} CRC errors rising' },
  { source: 'Security', severity: 'warning', weight: 4, text: 'firewall: denied tcp 203.0.113.{n}:51544 to 172.20.52.10:22' },
  { source: 'Security', severity: 'warning', weight: 2, text: 'keycloak: LOGIN_ERROR invalid_user_credentials for operator account (3rd attempt)' },
  { source: 'Security', severity: 'critical', weight: 0.3, text: 'SIEM rule: multiple failed SSH logins to jump host from one source' },
  { source: 'RHOCP', severity: 'info', weight: 5, text: 'kubelet on {subject}: pod nova-api-{id} ready' },
  { source: 'RHOCP', severity: 'warning', weight: 1, text: 'etcd: slow fdatasync on {subject} ({ms}ms)' },
];
