import { Alert, Button, Card, Content, Label, PageSection, Tab, Tabs, TabTitleText, Title, ToggleGroup, ToggleGroupItem } from '@patternfly/react-core';
import { LockIcon } from '@patternfly/react-icons';
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { RegionId } from '../../api/types';
import { LineChart, LogViewer, RangePicker, Sparkline, fmtStamp } from '../../observability/components';
import { PLATFORM_TEMPLATES, logs, metric, timeline, type RangeId, type Series } from '../../observability/data';
import { AlertSev } from '../../pages/Monitoring';
import type { AlertSeverity } from '../../observability/tenant';
import { useOps, useOpsLive } from '../session';

const REGION_LABEL: Record<RegionId, string> = { 'in-west': 'India-West', 'in-south': 'India-South' };
const HOSTS: Record<RegionId, string[]> = {
  'in-west': ['cmp-w-01', 'cmp-w-02', 'cmp-w-03', 'cmp-w-07', 'cmp-w-12', 'gpu-w-01', 'leaf-w-1a', 'leaf-w-2b', 'ocp-w-m1', 'ocp-w-m2', 'objstor-w-3'],
  'in-south': ['cmp-s-01', 'cmp-s-02', 'cmp-s-04', 'leaf-s-1a', 'ocp-s-m1', 'objstor-s-2'],
};

interface Chart {
  title: string;
  unit: string;
  series: Series[];
  threshold?: { value: number; label: string };
  max?: number;
}

function platformCharts(region: RegionId, range: RangeId): Chart[] {
  const ts = timeline(range);
  const k = region === 'in-west' ? 1 : 0.45;
  const m = (key: string, shape: Parameters<typeof metric>[2]) => metric(`${region}-${key}`, ts, shape);
  return [
    {
      title: 'Compute: vCPU allocated vs used',
      unit: '%',
      max: 100,
      threshold: { value: 85, label: 'Expansion trigger 85%' },
      series: [
        { name: 'Allocated', points: m('alloc', { base: region === 'in-west' ? 71 : 48, noise: 0.6 }) },
        { name: 'Used', points: m('used', { base: region === 'in-west' ? 42 : 27, daily: 18, noise: 3 }) },
      ],
    },
    {
      title: 'API latency, p95',
      unit: ' ms',
      threshold: { value: 800, label: 'SLO 800 ms' },
      series: [
        { name: 'CMP gateway', points: m('gw', { base: 140, daily: 60, noise: 25, spikeChance: 0.02, spikeSize: 500 }) },
        { name: 'Nova API', points: m('nova', { base: 260, daily: 90, noise: 40, spikeChance: 0.02, spikeSize: 600 }) },
        { name: 'Neutron API', points: m('neutron', { base: 210, daily: 70, noise: 30 }) },
      ],
    },
    {
      title: 'API error rate (5xx)',
      unit: '%',
      threshold: { value: 1, label: 'SLO 1%' },
      series: [{ name: 'All public APIs', points: m('err', { base: 0.12, noise: 0.06, spikeChance: 0.03, spikeSize: 1.2 }) }],
    },
    {
      title: 'Provisioning workflows',
      unit: '/h',
      series: [
        { name: 'Completed', points: m('wf-ok', { base: 60 * k, daily: 70 * k, noise: 8 }) },
        { name: 'Failed', points: m('wf-bad', { base: 0.6, noise: 0.8, spikeChance: 0.04, spikeSize: 6 }) },
      ],
    },
    {
      title: 'Storage pools used',
      unit: '%',
      max: 100,
      threshold: { value: 80, label: 'Plan expansion 80%' },
      series: [
        { name: 'Block (PowerMax SRP_1)', points: m('blk', { base: region === 'in-west' ? 63 : 41, noise: 0.4 }) },
        { name: 'Object (Cloudian)', points: m('obj', { base: region === 'in-west' ? 52 : 30, noise: 0.3 }) },
      ],
    },
    {
      title: 'Fabric throughput (spine uplinks)',
      unit: ' Gbps',
      series: [
        { name: 'North-south', points: m('ns', { base: 18 * k, daily: 14 * k, noise: 2 }) },
        { name: 'East-west', points: m('ew', { base: 62 * k, daily: 40 * k, noise: 6 }) },
      ],
    },
  ];
}

interface PlatformAlert {
  id: string;
  severity: AlertSeverity;
  name: string;
  region: RegionId | 'control';
  component: string;
  since: number;
  detail: string;
  state: 'firing' | 'acknowledged' | 'resolved';
  ackBy?: string;
}

function seedAlerts(now = Date.now()): PlatformAlert[] {
  return [
    { id: 'pa-1', severity: 'warning', name: 'GPU placement group full', region: 'in-west', component: 'nova-scheduler', since: now - 52 * 60_000, detail: '0 of 8 GPUs free; 1 request queued', state: 'firing' },
    { id: 'pa-2', severity: 'warning', name: 'Kafka consumer lag', region: 'control', component: 'audit-writer', since: now - 14 * 60_000, detail: 'Lag 4,180 messages on audit.events', state: 'firing' },
    { id: 'pa-3', severity: 'critical', name: 'Repeated SSH failures on jump host', region: 'control', component: 'SIEM', since: now - 9 * 60_000, detail: '41 failed logins from 203.0.113.18 in 5 min', state: 'firing' },
    { id: 'pa-4', severity: 'warning', name: 'CRC errors rising', region: 'in-south', component: 'leaf-s-1a Eth1/14', since: now - 3 * 3600_000, detail: '1,240 errors per hour', state: 'acknowledged', ackBy: 'Priya Nair' },
    { id: 'pa-5', severity: 'info', name: 'Object node rebuild', region: 'in-west', component: 'objstor-w-3', since: now - 6 * 3600_000, detail: 'Rebuild 100%, no client impact', state: 'resolved' },
    { id: 'pa-6', severity: 'critical', name: 'etcd slow fsync', region: 'in-west', component: 'ocp-w-m2', since: now - 30 * 3600_000, detail: 'p99 fsync 120 ms for 12 min', state: 'resolved' },
  ];
}

const ago = (t: number) => {
  const m = Math.round((Date.now() - t) / 60_000);
  return m < 60 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};

export function OpsMonitoring() {
  const { api, op, access } = useOps();
  const tenants = useOpsLive(() => api.listTenants());
  const [tab, setTab] = useState<string | number>('metrics');
  const [range, setRange] = useState<RangeId>('24h');
  const [region, setRegion] = useState<RegionId>('in-west');
  const [alerts, setAlerts] = useState<PlatformAlert[]>(() => seedAlerts());
  const charts = useMemo(() => platformCharts(region, range), [region, range]);
  const subjects = [...HOSTS['in-west'], ...HOSTS['in-south']];
  const lines = useMemo(() => logs('platform', PLATFORM_TEMPLATES, subjects, range, 260), [range]);
  const firing = alerts.filter((a) => a.state === 'firing');
  const sources = [...new Set(PLATFORM_TEMPLATES.map((t) => t.source))];

  const usage = useMemo(
    () =>
      (tenants ?? [])
        .filter((t) => t.status !== 'onboarding')
        .map((t) => {
          const ts = timeline('7d');
          const api7 = metric(`tenant-api-${t.id}`, ts, { base: 4 + t.usage.vcpu / 20, daily: 3 + t.usage.vcpu / 30, noise: 1, min: 0 }).map((p) => p.v);
          const logsGb = Math.round((0.4 + t.usage.vcpu / 90 + (t.id.charCodeAt(t.id.length - 1) % 5) / 10) * 10) / 10;
          const series = Math.round(800 + t.usage.vcpu * 38 + t.usage.storageGb / 12);
          const cpuShare = t.quota.vcpu ? Math.round((t.usage.vcpu / t.quota.vcpu) * 100) : 0;
          return { t, api7, logsGb, series, cpuShare };
        })
        .sort((a, b) => b.logsGb - a.logsGb),
    [tenants],
  );

  function ack(id: string) {
    setAlerts((as) => as.map((a) => (a.id === id ? { ...a, state: 'acknowledged', ackBy: op?.name } : a)));
  }

  return (
    <>
      <PageSection>
        <Title headingLevel="h1" size="2xl">
          Monitoring and logs
        </Title>
        <Content component="p" className="muted">
          Health of the platform itself: hypervisors, OpenStack and CMP services, storage, network fabric and security events, kept for 180 days.
        </Content>
      </PageSection>
      <PageSection className="tight-top">
        <Alert variant="info" isInline customIcon={<LockIcon />} className="stack-gap" title="Platform telemetry only">
          Tenant workload logs and in-guest metrics are not visible here. Each organisation's telemetry lives in its own tenant plane (DPDP Act). For tenants you see aggregates: usage, API
          volume and log ingestion.
        </Alert>

        <div className="obs-kpis">
          <div className="obs-kpi">
            <span className="obs-kpi__label">Platform SLA, this month</span>
            <span className="obs-kpi__value">99.97%</span>
            <span className="obs-kpi__note">Target 99.95%</span>
          </div>
          <div className={`obs-kpi ${firing.some((a) => a.severity === 'critical') ? 'obs-kpi--bad' : firing.length ? 'obs-kpi--warn' : ''}`}>
            <span className="obs-kpi__label">Platform alerts firing</span>
            <span className="obs-kpi__value">{firing.length}</span>
            <span className="obs-kpi__note">{firing.filter((a) => a.severity === 'critical').length} critical</span>
          </div>
          <div className="obs-kpi">
            <span className="obs-kpi__label">Log ingestion, today</span>
            <span className="obs-kpi__value">212 GB</span>
            <span className="obs-kpi__note">Platform 148 GB · tenant planes 64 GB</span>
          </div>
          <div className="obs-kpi">
            <span className="obs-kpi__label">Active metric series</span>
            <span className="obs-kpi__value">1.84 M</span>
            <span className="obs-kpi__note">VictoriaMetrics cluster at 41% of capacity</span>
          </div>
        </div>

        <Tabs activeKey={tab} onSelect={(_e, k) => setTab(k)} aria-label="Monitoring sections" className="stack-gap">
          <Tab eventKey="metrics" title={<TabTitleText>Platform metrics</TabTitleText>} />
          <Tab eventKey="logs" title={<TabTitleText>Platform and security logs</TabTitleText>} />
          <Tab eventKey="alerts" title={<TabTitleText>Alerts {firing.length > 0 && <Label color="red" isCompact>{firing.length}</Label>}</TabTitleText>} />
          <Tab eventKey="tenants" title={<TabTitleText>Tenant telemetry usage</TabTitleText>} />
        </Tabs>

        {tab === 'metrics' && (
          <>
            <div className="obs-toolbar">
              <ToggleGroup aria-label="Region" isCompact>
                {(['in-west', 'in-south'] as RegionId[]).map((r) => (
                  <ToggleGroupItem key={r} text={REGION_LABEL[r]} buttonId={`reg-${r}`} isSelected={region === r} onChange={() => setRegion(r)} />
                ))}
              </ToggleGroup>
              <span className="obs-toolbar__spacer" />
              <RangePicker value={range} onChange={setRange} />
            </div>
            <div className="obs-grid-2">
              {charts.map((c) => (
                <LineChart key={`${region}-${c.title}`} title={c.title} series={c.series} unit={c.unit} range={range} threshold={c.threshold} max={c.max} />
              ))}
            </div>
          </>
        )}

        {tab === 'logs' && (
          <>
            <div className="obs-toolbar">
              <span className="muted">OpenStack, RHOCP, CMP services, storage arrays, switches and the firewall. Security events also go to the SIEM.</span>
              <span className="obs-toolbar__spacer" />
              <RangePicker value={range} onChange={setRange} />
            </div>
            <LogViewer lines={lines} range={range} sources={sources} tail={{ seed: 'platform', templates: PLATFORM_TEMPLATES, subjects }} />
          </>
        )}

        {tab === 'alerts' && (
          <Card>
            <Table aria-label="Platform alerts" variant="compact">
              <Thead>
                <Tr>
                  <Th>Severity</Th>
                  <Th>Alert</Th>
                  <Th>Where</Th>
                  <Th>Detail</Th>
                  <Th>Since</Th>
                  <Th>State</Th>
                  <Th screenReaderText="Actions" />
                </Tr>
              </Thead>
              <Tbody>
                {alerts.map((a) => (
                  <Tr key={a.id}>
                    <Td dataLabel="Severity">
                      <AlertSev severity={a.severity} />
                    </Td>
                    <Td dataLabel="Alert">{a.name}</Td>
                    <Td dataLabel="Where">
                      {a.region === 'control' ? 'Control plane' : REGION_LABEL[a.region]} · <span className="mono">{a.component}</span>
                    </Td>
                    <Td dataLabel="Detail">{a.detail}</Td>
                    <Td dataLabel="Since">
                      <span title={fmtStamp(a.since)}>{ago(a.since)}</span>
                    </Td>
                    <Td dataLabel="State">
                      {a.state === 'firing' ? (
                        <Label color="red" isCompact>
                          Firing
                        </Label>
                      ) : a.state === 'acknowledged' ? (
                        <Label color="blue" isCompact>
                          Acknowledged{a.ackBy ? ` by ${a.ackBy}` : ''}
                        </Label>
                      ) : (
                        <Label color="green" isCompact>
                          Resolved
                        </Label>
                      )}
                    </Td>
                    <Td dataLabel="Actions" isActionCell>
                      {a.state === 'firing' && access.canRetry && (
                        <Button variant="secondary" size="sm" onClick={() => ack(a.id)}>
                          Acknowledge
                        </Button>
                      )}
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </Card>
        )}

        {tab === 'tenants' && (
          <>
            <Content component="p" className="muted small stack-gap">
              Volume of telemetry each organisation generates, for capacity planning and fair use. Counts and sizes only; the content stays in the tenant plane.
            </Content>
            <Card>
              <Table aria-label="Tenant telemetry usage" variant="compact">
                <Thead>
                  <Tr>
                    <Th>Organisation</Th>
                    <Th>API calls, 7 d</Th>
                    <Th>Peak rate</Th>
                    <Th>Logs / day</Th>
                    <Th>Log storage</Th>
                    <Th>Series</Th>
                    <Th>vCPU quota</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {usage.map(({ t, api7, logsGb, series, cpuShare }) => (
                    <Tr key={t.id}>
                      <Td dataLabel="Organisation">
                        <Link to={`/tenants/${t.id}`}>{t.name}</Link>
                      </Td>
                      <Td dataLabel="API calls, 7 days">
                        <Sparkline values={api7} />
                      </Td>
                      <Td dataLabel="Peak API rate">{Math.round(Math.max(...api7) * 10)} req/s</Td>
                      <Td dataLabel="Log ingestion / day">
                        {logsGb} GB {logsGb > 4 && <Label color="orange" isCompact>Above fair use</Label>}
                      </Td>
                      <Td dataLabel="Log storage (30 d)">{Math.round(logsGb * 30)} GB</Td>
                      <Td dataLabel="Metric series">{series.toLocaleString('en-IN')}</Td>
                      <Td dataLabel="vCPU quota used">{cpuShare}%</Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </Card>
          </>
        )}
      </PageSection>
    </>
  );
}
