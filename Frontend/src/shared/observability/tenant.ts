/** Tenant-plane dummy telemetry: metrics per resource kind, log sources and alert rules. */
import type { Resource, ResourceKind } from '../api/types';
import { TENANT_TEMPLATES, logs, metric, timeline, type LogLine, type RangeId, type Series, type Template } from './data';

export interface ChartDef {
  title: string;
  unit: string;
  series: Series[];
  threshold?: { value: number; label: string };
  max?: number;
}

/** Per-resource level so each resource looks different but stays stable. */
const busy = (id: string) => 20 + ((id.length * 37 + id.charCodeAt(id.length - 1)) % 45);

export function resourceCharts(r: Pick<Resource, 'id' | 'catalogItemId' | 'spec'>, kind: ResourceKind, range: RangeId, end?: number): ChartDef[] {
  const ts = timeline(range, end);
  const b = busy(r.id);
  const s = (name: string, key: string, shape: Parameters<typeof metric>[2]): Series => ({ name, points: metric(`${r.id}-${key}`, ts, shape) });
  switch (kind) {
    case 'vm':
      return [
        { title: 'CPU utilisation', unit: '%', max: 100, threshold: { value: 85, label: 'Alert at 85%' }, series: [s('CPU', 'cpu', { base: b, daily: 30, noise: 6, spikeChance: 0.03, spikeSize: 35, max: 100 })] },
        { title: 'Memory used', unit: '%', max: 100, series: [s('Memory', 'mem', { base: b + 25, daily: 8, noise: 2, max: 100 })] },
        {
          title: 'Disk IOPS',
          unit: '',
          series: [s('Read', 'dr', { base: 420, daily: 300, noise: 90, spikeChance: 0.02, spikeSize: 900 }), s('Write', 'dw', { base: 260, daily: 160, noise: 50 })],
        },
        {
          title: 'Network throughput',
          unit: ' Mbps',
          series: [s('In', 'ni', { base: 120, daily: 160, noise: 30 }), s('Out', 'no', { base: 70, daily: 90, noise: 20, spikeChance: 0.02, spikeSize: 200 })],
        },
      ];
    case 'k8s':
      return [
        { title: 'Node CPU (cluster average)', unit: '%', max: 100, threshold: { value: 80, label: 'Alert at 80%' }, series: [s('CPU', 'cpu', { base: b + 10, daily: 25, noise: 5, max: 100 })] },
        { title: 'Node memory (cluster average)', unit: '%', max: 100, series: [s('Memory', 'mem', { base: b + 30, daily: 6, noise: 2, max: 100 })] },
        { title: 'Running pods', unit: '', series: [s('Pods', 'pods', { base: 64, daily: 24, noise: 3, min: 30 })] },
        { title: 'Container restarts', unit: '', series: [s('Restarts', 'rs', { base: 0.4, noise: 0.6, spikeChance: 0.04, spikeSize: 6 })] },
      ];
    case 'db':
      return [
        { title: 'CPU utilisation', unit: '%', max: 100, threshold: { value: 80, label: 'Alert at 80%' }, series: [s('CPU', 'cpu', { base: b, daily: 25, noise: 5, spikeChance: 0.02, spikeSize: 30, max: 100 })] },
        { title: 'Active connections', unit: '', threshold: { value: 180, label: 'Limit 200' }, series: [s('Connections', 'conn', { base: 70, daily: 70, noise: 10 })] },
        {
          title: 'Query latency',
          unit: ' ms',
          series: [s('p50', 'p50', { base: 4, daily: 2, noise: 1, min: 1 }), s('p95', 'p95', { base: 18, daily: 10, noise: 4, spikeChance: 0.03, spikeSize: 60, min: 3 })],
        },
        { title: 'Replication lag', unit: ' ms', series: [s('Replica lag', 'lag', { base: 40, noise: 25, spikeChance: 0.03, spikeSize: 400 })] },
      ];
    case 'storage': {
      const id = r.catalogItemId;
      if (id === 'object')
        return [
          { title: 'Requests', unit: '/s', series: [s('GET', 'get', { base: 180, daily: 200, noise: 40 }), s('PUT', 'put', { base: 30, daily: 30, noise: 8 })] },
          { title: 'Egress', unit: ' Mbps', series: [s('Egress', 'eg', { base: 80, daily: 90, noise: 20 })] },
        ];
      const size = Number(r.spec.sizeGb ?? r.spec.size ?? 500);
      return [
        { title: 'Used capacity', unit: ' GB', max: size, threshold: { value: size * 0.9, label: '90% full' }, series: [s('Used', 'used', { base: size * 0.62, noise: size * 0.01 })] },
        { title: 'IOPS', unit: '', series: [s('Read', 'r', { base: 600, daily: 400, noise: 100 }), s('Write', 'w', { base: 300, daily: 200, noise: 60 })] },
      ];
    }
    default:
      return [];
  }
}

/** Short CPU trend for tables. */
export function cpuTrend(id: string, end?: number): number[] {
  return metric(`${id}-cpu`, timeline('24h', end), { base: busy(id), daily: 30, noise: 6, spikeChance: 0.03, spikeSize: 35, max: 100 }).map((p) => p.v);
}

export const LOG_SOURCES = [
  { id: 'activity', label: 'Activity trail', note: 'Every action in your organisation. Always on.' },
  { id: 'workload', label: 'Workload logs', note: 'System and application logs from VMs with the Tatv logging agent (opt-in).' },
  { id: 'kubernetes', label: 'Kubernetes events', note: 'Pod, node and autoscaler events from your clusters.' },
  { id: 'database', label: 'Database logs', note: 'Engine logs and slow queries from managed databases.' },
] as const;
export type LogSourceId = (typeof LOG_SOURCES)[number]['id'];

const sourceFor = (kind: ResourceKind): LogSourceId[] =>
  kind === 'vm' ? ['workload', 'activity'] : kind === 'k8s' ? ['kubernetes', 'activity'] : kind === 'db' ? ['database', 'activity'] : ['activity'];

/** Log lines for a set of resources and sources over a window. */
export function tenantLogs(resources: Pick<Resource, 'id' | 'name' | 'catalogItemId'>[], kindOf: (itemId: string) => ResourceKind | undefined, sources: LogSourceId[], range: RangeId, end?: number): LogLine[] {
  const out: LogLine[] = [];
  for (const src of sources) {
    const matching = resources.filter((r) => {
      const k = kindOf(r.catalogItemId);
      return k && sourceFor(k).includes(src);
    });
    if (!matching.length) continue;
    const rate = src === 'workload' ? 90 : src === 'activity' ? 6 : 35;
    out.push(...logs(`tenant-${src}-${matching.map((m) => m.id).join(',')}`, TENANT_TEMPLATES[src] ?? [], matching.map((m) => m.name), range, rate * matching.length, end));
  }
  return out.sort((a, b) => b.t - a.t);
}

export function templatesFor(sources: LogSourceId[]): Template[] {
  return sources.flatMap((s) => TENANT_TEMPLATES[s] ?? []);
}

export function sourcesForKind(kind: ResourceKind): LogSourceId[] {
  return sourceFor(kind);
}

/* Alerts */

export type AlertSeverity = 'critical' | 'warning' | 'info';
export interface AlertRule {
  id: string;
  name: string;
  target: string;
  condition: string;
  severity: AlertSeverity;
  notify: string;
  enabled: boolean;
}
export interface FiringAlert {
  id: string;
  ruleId: string;
  name: string;
  target: string;
  severity: AlertSeverity;
  since: number;
  value: string;
  state: 'firing' | 'resolved';
}

export const DEFAULT_RULES: AlertRule[] = [
  { id: 'rule-1', name: 'High CPU', target: 'web-prod-01', condition: 'CPU > 85% for 10 min', severity: 'warning', notify: 'ops@example.in', enabled: true },
  { id: 'rule-2', name: 'Instance down', target: 'All VMs', condition: 'Heartbeat missing for 3 min', severity: 'critical', notify: 'ops@example.in, SMS on-call', enabled: true },
  { id: 'rule-3', name: 'Connections near limit', target: 'orders-db', condition: 'Connections > 180 for 5 min', severity: 'warning', notify: 'dba@example.in', enabled: true },
  { id: 'rule-4', name: 'Replication lag', target: 'orders-db', condition: 'Replica lag > 1 s for 5 min', severity: 'critical', notify: 'dba@example.in', enabled: true },
  { id: 'rule-5', name: 'Pod restart loop', target: 'apps-cluster', condition: 'Restarts > 5 in 15 min', severity: 'warning', notify: 'Webhook: chat-ops', enabled: true },
  { id: 'rule-6', name: 'Volume almost full', target: 'data-vol-01', condition: 'Used > 90%', severity: 'warning', notify: 'ops@example.in', enabled: false },
  { id: 'rule-7', name: 'Monthly spend', target: 'Project', condition: 'Forecast > ₹2,50,000', severity: 'info', notify: 'finance@example.in', enabled: true },
];

export function seedFiring(now = Date.now()): FiringAlert[] {
  return [
    { id: 'al-1', ruleId: 'rule-1', name: 'High CPU', target: 'web-prod-01', severity: 'warning', since: now - 23 * 60_000, value: 'CPU 91%', state: 'firing' },
    { id: 'al-2', ruleId: 'rule-5', name: 'Pod restart loop', target: 'apps-cluster', severity: 'warning', since: now - 7 * 60_000, value: '8 restarts (jobs-worker)', state: 'firing' },
    { id: 'al-3', ruleId: 'rule-4', name: 'Replication lag', target: 'orders-db', severity: 'critical', since: now - 5 * 3600_000, value: 'Lag 2.4 s', state: 'resolved' },
    { id: 'al-4', ruleId: 'rule-3', name: 'Connections near limit', target: 'orders-db', severity: 'warning', since: now - 26 * 3600_000, value: '187 connections', state: 'resolved' },
  ];
}
