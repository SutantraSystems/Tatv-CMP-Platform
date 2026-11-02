import {
  Alert,
  Button,
  Card,
  Content,
  Form,
  FormGroup,
  FormSelect,
  FormSelectOption,
  Label,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  PageSection,
  Switch,
  Tab,
  Tabs,
  TabTitleText,
  TextInput,
  Title,
} from '@patternfly/react-core';
import { BellIcon, ExclamationCircleIcon, ExclamationTriangleIcon, InfoCircleIcon } from '@patternfly/react-icons';
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { kindOf, regionName } from '../api/catalog';
import { StatusDot } from '../components/Status';
import { LineChart, LogViewer, RangePicker, Sparkline, fmtStamp } from '../observability/components';
import type { RangeId } from '../observability/data';
import {
  DEFAULT_RULES,
  LOG_SOURCES,
  cpuTrend,
  resourceCharts,
  seedFiring,
  templatesFor,
  tenantLogs,
  type AlertRule,
  type AlertSeverity,
  type FiringAlert,
  type LogSourceId,
} from '../observability/tenant';
import { useLive, useSession } from '../session';

const SEV_ICON: Record<AlertSeverity, JSX.Element> = {
  critical: <ExclamationCircleIcon color="#c9190b" />,
  warning: <ExclamationTriangleIcon color="#d48a00" />,
  info: <InfoCircleIcon color="#4a74d8" />,
};
const SEV_NAME: Record<AlertSeverity, string> = { critical: 'Critical', warning: 'Warning', info: 'Info' };

export function AlertSev({ severity }: { severity: AlertSeverity }) {
  return (
    <span className="obs-alert-sev">
      {SEV_ICON[severity]} {SEV_NAME[severity]}
    </span>
  );
}

const ago = (t: number) => {
  const m = Math.round((Date.now() - t) / 60_000);
  return m < 60 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};

export function Monitoring() {
  const { api, project, organisation } = useSession();
  const resources = useLive(() => (project ? api.listResources(project.id) : Promise.resolve([])), [project?.id]);
  const [tab, setTab] = useState<string | number>('metrics');
  const [range, setRange] = useState<RangeId>('24h');
  const monitored = (resources ?? []).filter((r) => r.status === 'active' || r.status === 'stopped');
  const [selected, setSelected] = useState<string>();
  const current = monitored.find((r) => r.id === selected) ?? monitored[0];
  const [sources, setSources] = useState<LogSourceId[]>(['activity', 'workload', 'kubernetes', 'database']);
  const [rules, setRules] = useState<AlertRule[]>(DEFAULT_RULES);
  const [firing, setFiring] = useState<FiringAlert[]>(() => seedFiring());
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ name: '', target: '', metric: 'CPU', op: '>', value: '80', duration: '5', severity: 'warning' as AlertSeverity, notify: '' });

  const lines = useMemo(() => tenantLogs(monitored, kindOf, sources, range), [monitored.map((r) => r.id).join(','), sources.join(','), range]);
  const active = firing.filter((f) => f.state === 'firing');
  const errors24 = useMemo(() => tenantLogs(monitored, kindOf, ['workload', 'kubernetes', 'database'], '24h'), [monitored.map((r) => r.id).join(',')]);
  const errCount = errors24.filter((l) => l.severity === 'error' || l.severity === 'critical').length;

  const kind = current ? kindOf(current.catalogItemId) : undefined;
  const charts = current && kind ? resourceCharts(current, kind, range) : [];
  const compute = monitored.filter((r) => ['vm', 'k8s', 'db'].includes(kindOf(r.catalogItemId) ?? ''));

  function addRule() {
    const id = `rule-${Date.now()}`;
    setRules((rs) => [
      ...rs,
      {
        id,
        name: draft.name || `${draft.metric} on ${draft.target}`,
        target: draft.target || monitored[0]?.name || 'Project',
        condition: `${draft.metric} ${draft.op} ${draft.value}${draft.metric.includes('CPU') || draft.metric.includes('Memory') || draft.metric.includes('Disk') ? '%' : ''} for ${draft.duration} min`,
        severity: draft.severity,
        notify: draft.notify || 'Project admins (email)',
        enabled: true,
      },
    ]);
    setCreating(false);
    setDraft({ ...draft, name: '', notify: '' });
  }

  return (
    <>
      <PageSection>
        <Title headingLevel="h1" size="2xl">
          Monitoring and logs
        </Title>
        <Content component="p" className="muted">
          Metrics, logs and alerts for <strong>{project?.name}</strong> in {organisation?.name}. Your telemetry stays inside your tenant: Tatv Cloud operators see usage totals, not
          your logs or workload metrics.
        </Content>
      </PageSection>

      <PageSection className="tight-top">
        <div className="obs-kpis">
          <div className="obs-kpi">
            <span className="obs-kpi__label">Resources monitored</span>
            <span className="obs-kpi__value">{monitored.length}</span>
            <span className="obs-kpi__note">Metrics every 60 s, kept 30 days</span>
          </div>
          <div className={`obs-kpi ${active.length ? 'obs-kpi--warn' : ''}`}>
            <span className="obs-kpi__label">Alerts firing</span>
            <span className="obs-kpi__value">{active.length}</span>
            <span className="obs-kpi__note">{rules.filter((r) => r.enabled).length} rules enabled</span>
          </div>
          <div className={`obs-kpi ${errCount > 40 ? 'obs-kpi--bad' : ''}`}>
            <span className="obs-kpi__label">Errors, last 24 h</span>
            <span className="obs-kpi__value">{errCount.toLocaleString('en-IN')}</span>
            <span className="obs-kpi__note">of {errors24.length.toLocaleString('en-IN')} workload log lines</span>
          </div>
          <div className="obs-kpi">
            <span className="obs-kpi__label">Log storage used</span>
            <span className="obs-kpi__value">3.8 GB</span>
            <span className="obs-kpi__note">30 days included; 6.2 GB free left</span>
          </div>
        </div>

        <Tabs activeKey={tab} onSelect={(_e, k) => setTab(k)} aria-label="Monitoring sections" className="stack-gap">
          <Tab eventKey="metrics" title={<TabTitleText>Metrics</TabTitleText>} />
          <Tab eventKey="logs" title={<TabTitleText>Logs</TabTitleText>} />
          <Tab eventKey="alerts" title={<TabTitleText>Alerts {active.length > 0 && <Label color="orange" isCompact>{active.length}</Label>}</TabTitleText>} />
        </Tabs>

        {tab === 'metrics' && (
          <>
            <div className="obs-toolbar">
              <FormSelect aria-label="Resource" value={current?.id ?? ''} onChange={(_e, v) => setSelected(v)}>
                {monitored.map((r) => (
                  <FormSelectOption key={r.id} value={r.id} label={`${r.name} (${regionName(r.region)})`} />
                ))}
              </FormSelect>
              {current && (
                <span className="muted">
                  <StatusDot status={current.status} /> <Link to={`/r/${current.id}`}>Open resource</Link>
                </span>
              )}
              <span className="obs-toolbar__spacer" />
              <RangePicker value={range} onChange={setRange} />
            </div>
            {current?.status === 'stopped' && (
              <Alert variant="info" isInline className="stack-gap" title={`${current.name} is stopped. The charts show its history up to when it was shut down.`} />
            )}
            {monitored.length === 0 ? (
              <p className="muted">No running resources in this project yet.</p>
            ) : (
              <div className="obs-grid-2">
                {charts.map((c) => (
                  <LineChart key={c.title} title={c.title} series={c.series} unit={c.unit} range={range} threshold={c.threshold} max={c.max} />
                ))}
              </div>
            )}

            <h2 className="obs-section-title">Compute at a glance, last 24 hours</h2>
            <Card>
              <Table aria-label="Resources by CPU" variant="compact">
                <Thead>
                  <Tr>
                    <Th>Resource</Th>
                    <Th>Region</Th>
                    <Th>CPU trend</Th>
                    <Th>Average</Th>
                    <Th>Peak</Th>
                    <Th>Alerts</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {compute
                    .map((r) => ({ r, trend: cpuTrend(r.id) }))
                    .sort((a, b) => Math.max(...b.trend) - Math.max(...a.trend))
                    .map(({ r, trend }) => {
                      const avg = Math.round(trend.reduce((s, v) => s + v, 0) / trend.length);
                      const peak = Math.round(Math.max(...trend));
                      const n = active.filter((a) => a.target === r.name).length;
                      return (
                        <Tr key={r.id}>
                          <Td dataLabel="Resource">
                            <Button variant="link" isInline onClick={() => setSelected(r.id)}>
                              {r.name}
                            </Button>
                          </Td>
                          <Td dataLabel="Region">{regionName(r.region)}</Td>
                          <Td dataLabel="CPU trend">
                            <Sparkline values={trend} colour={peak > 85 ? '#c9190b' : undefined} />
                          </Td>
                          <Td dataLabel="Average">{avg}%</Td>
                          <Td dataLabel="Peak">{peak}%</Td>
                          <Td dataLabel="Alerts">{n ? <Label color="orange" isCompact>{n} firing</Label> : <span className="muted">None</span>}</Td>
                        </Tr>
                      );
                    })}
                </Tbody>
              </Table>
            </Card>
          </>
        )}

        {tab === 'logs' && (
          <>
            <div className="obs-toolbar">
              {LOG_SOURCES.map((s) => (
                <Switch
                  key={s.id}
                  id={`src-${s.id}`}
                  label={s.label}
                  isChecked={sources.includes(s.id)}
                  onChange={(_e, c) => setSources((cur) => (c ? [...cur, s.id] : cur.filter((x) => x !== s.id)))}
                />
              ))}
              <span className="obs-toolbar__spacer" />
              <RangePicker value={range} onChange={setRange} />
            </div>
            <Content component="p" className="muted small">
              Logs are kept for 30 days at no charge; longer retention and export to your own storage bucket are billed per GB. Workload logs come from VMs with the Tatv logging agent
              installed (opt-in when you create a VM).
            </Content>
            <LogViewer
              lines={lines}
              range={range}
              sources={[...new Set(templatesFor(sources).map((t) => t.source))]}
              tail={{ seed: `tenant-${project?.id}`, templates: templatesFor(sources), subjects: monitored.map((r) => r.name) }}
            />
          </>
        )}

        {tab === 'alerts' && (
          <>
            <h2 className="obs-section-title">Alerts</h2>
            <Card className="stack-gap">
              <Table aria-label="Alerts" variant="compact">
                <Thead>
                  <Tr>
                    <Th>Severity</Th>
                    <Th>Alert</Th>
                    <Th>Resource</Th>
                    <Th>Value</Th>
                    <Th>Since</Th>
                    <Th>State</Th>
                    <Th screenReaderText="Actions" />
                  </Tr>
                </Thead>
                <Tbody>
                  {firing.map((a) => (
                    <Tr key={a.id}>
                      <Td dataLabel="Severity">
                        <AlertSev severity={a.severity} />
                      </Td>
                      <Td dataLabel="Alert">{a.name}</Td>
                      <Td dataLabel="Resource">{a.target}</Td>
                      <Td dataLabel="Value">{a.value}</Td>
                      <Td dataLabel="Since">
                        <span title={fmtStamp(a.since)}>{ago(a.since)}</span>
                      </Td>
                      <Td dataLabel="State">{a.state === 'firing' ? <Label color="orange" isCompact icon={<BellIcon />}>Firing</Label> : <Label color="green" isCompact>Resolved</Label>}</Td>
                      <Td dataLabel="Actions" isActionCell>
                        {a.state === 'firing' && (
                          <Button variant="secondary" size="sm" onClick={() => setFiring((fs) => fs.map((f) => (f.id === a.id ? { ...f, state: 'resolved' } : f)))}>
                            Mark resolved
                          </Button>
                        )}
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </Card>

            <div className="obs-toolbar">
              <h2 className="obs-section-title" style={{ margin: 0 }}>
                Alert rules
              </h2>
              <span className="obs-toolbar__spacer" />
              <Button variant="primary" onClick={() => setCreating(true)}>
                Create alert rule
              </Button>
            </div>
            <Card>
              <Table aria-label="Alert rules" variant="compact">
                <Thead>
                  <Tr>
                    <Th>Rule</Th>
                    <Th>Applies to</Th>
                    <Th>Condition</Th>
                    <Th>Severity</Th>
                    <Th>Notify</Th>
                    <Th>Enabled</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {rules.map((r) => (
                    <Tr key={r.id}>
                      <Td dataLabel="Rule">{r.name}</Td>
                      <Td dataLabel="Applies to">{r.target}</Td>
                      <Td dataLabel="Condition">{r.condition}</Td>
                      <Td dataLabel="Severity">
                        <AlertSev severity={r.severity} />
                      </Td>
                      <Td dataLabel="Notify">{r.notify}</Td>
                      <Td dataLabel="Enabled">
                        <Switch
                          id={`en-${r.id}`}
                          aria-label={`Enable ${r.name}`}
                          isChecked={r.enabled}
                          onChange={(_e, c) => setRules((rs) => rs.map((x) => (x.id === r.id ? { ...x, enabled: c } : x)))}
                        />
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </Card>
            <Content component="p" className="muted small stack-gap">
              Notifications go by email, SMS or a webhook to your chat tool. Alert history is kept with your logs for 30 days.
            </Content>
          </>
        )}
      </PageSection>

      <Modal isOpen={creating} onClose={() => setCreating(false)} variant="small" aria-labelledby="new-rule">
        <ModalHeader title="Create alert rule" labelId="new-rule" />
        <ModalBody>
          <Form onSubmit={(e) => e.preventDefault()}>
            <FormGroup label="Rule name" fieldId="rule-name">
              <TextInput id="rule-name" value={draft.name} onChange={(_e, v) => setDraft({ ...draft, name: v })} placeholder="e.g. High memory on app servers" />
            </FormGroup>
            <FormGroup label="Resource" fieldId="rule-target">
              <FormSelect id="rule-target" value={draft.target} onChange={(_e, v) => setDraft({ ...draft, target: v })}>
                <FormSelectOption value="" label="Choose a resource" isPlaceholder />
                {monitored.map((r) => (
                  <FormSelectOption key={r.id} value={r.name} label={r.name} />
                ))}
              </FormSelect>
            </FormGroup>
            <div className="form-row-3">
              <FormGroup label="Metric" fieldId="rule-metric">
                <FormSelect id="rule-metric" value={draft.metric} onChange={(_e, v) => setDraft({ ...draft, metric: v })}>
                  {['CPU', 'Memory', 'Disk used', 'Network in', 'Connections', 'Error log lines'].map((m) => (
                    <FormSelectOption key={m} value={m} label={m} />
                  ))}
                </FormSelect>
              </FormGroup>
              <FormGroup label="Threshold" fieldId="rule-value">
                <TextInput id="rule-value" type="number" value={draft.value} onChange={(_e, v) => setDraft({ ...draft, value: v })} />
              </FormGroup>
              <FormGroup label="For (minutes)" fieldId="rule-dur">
                <TextInput id="rule-dur" type="number" value={draft.duration} onChange={(_e, v) => setDraft({ ...draft, duration: v })} />
              </FormGroup>
            </div>
            <FormGroup label="Severity" fieldId="rule-sev">
              <FormSelect id="rule-sev" value={draft.severity} onChange={(_e, v) => setDraft({ ...draft, severity: v as AlertSeverity })}>
                <FormSelectOption value="critical" label="Critical" />
                <FormSelectOption value="warning" label="Warning" />
                <FormSelectOption value="info" label="Info" />
              </FormSelect>
            </FormGroup>
            <FormGroup label="Notify" fieldId="rule-notify">
              <TextInput id="rule-notify" value={draft.notify} onChange={(_e, v) => setDraft({ ...draft, notify: v })} placeholder="Email addresses or a webhook" />
            </FormGroup>
          </Form>
        </ModalBody>
        <ModalFooter>
          <Button variant="primary" onClick={addRule} isDisabled={!draft.target}>
            Create rule
          </Button>
          <Button variant="link" onClick={() => setCreating(false)}>
            Cancel
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
}
