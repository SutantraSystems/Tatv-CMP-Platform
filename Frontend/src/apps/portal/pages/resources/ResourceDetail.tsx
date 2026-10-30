import {
  Alert,
  Breadcrumb,
  BreadcrumbItem,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Content,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  Dropdown,
  DropdownItem,
  DropdownList,
  Divider,
  EmptyState,
  EmptyStateBody,
  Form,
  FormGroup,
  Label,
  LabelGroup,
  MenuToggle,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  PageSection,
  Progress,
  Tab,
  Tabs,
  TabTitleText,
  TextInput,
  Title,
} from '@patternfly/react-core';
import {
  ArchiveIcon,
  ArrowLeftIcon,
  EllipsisVIcon,
  GlobeIcon,
  MicrochipIcon,
  OutlinedClockIcon,
  PlayIcon,
  PlusCircleIcon,
  PowerOffIcon,
  RedoIcon,
  TagIcon,
  TerminalIcon,
} from '@patternfly/react-icons';
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { DB_SIZES, FLAVOURS, LIST_PATH, OBJECT_RATE_PER_GB, describe, inr, itemOf, kindOf, regionName } from '@/shared/catalog/catalog';
import { ProblemError, type LifecycleAction, type Problem, type Resource } from '@/shared/api/types';
import { ACTION_LABELS, LifecycleConfirm, canDo, fmtDate, useLifecycle } from '../../components/ResourceList';
import { PendingLabel, StatusDot, StatusLabel } from '@/shared/ui/Status';
import { AreaChart, BarChart, CopyValue, avg, lastHourLabels, monthToDate, resourceMonthly, series } from '@/shared/ui/ui';
import { LineChart, LogViewer, RangePicker } from '@/shared/observability/components';
import type { RangeId } from '@/shared/observability/data';
import { resourceCharts, sourcesForKind, templatesFor, tenantLogs } from '@/shared/observability/tenant';
import { useLive, useSession } from '../../session';
import { imageName } from './VirtualMachines';

const LIST_NAME: Record<string, string> = { vm: 'Virtual machines', k8s: 'Kubernetes clusters', db: 'Databases', storage: 'Storage' };
const SHUTDOWN: Record<string, string> = {
  vm: 'The VM is powered off. Compute billing stops while it is shut down; its disks and any public IP are still billed.',
  k8s: 'Worker nodes are scaled to zero and workloads stop running. The control plane and persistent volumes are kept.',
  db: 'All instances are stopped and connections are refused. Data and backups are kept.',
  storage: '',
};

function ago(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400_000);
  return d <= 0 ? 'today' : d === 1 ? '1 day ago' : `${d} days ago`;
}
function uptime(iso: string) {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000));
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  return `${d}d ${h}h ${mins % 60}m`;
}

function Facts({ items }: { items: [string, ReactNode][] }) {
  return (
    <DescriptionList isHorizontal isCompact className="facts">
      {items.map(([k, v]) => (
        <DescriptionListGroup key={k}>
          <DescriptionListTerm>{k}</DescriptionListTerm>
          <DescriptionListDescription>{v}</DescriptionListDescription>
        </DescriptionListGroup>
      ))}
    </DescriptionList>
  );
}

function configFacts(r: Resource): [string, ReactNode][] {
  const s = r.spec;
  switch (kindOf(r.catalogItemId)) {
    case 'vm': {
      const f = FLAVOURS[String(s.flavour)];
      return [
        ['Size', <code key="s">{String(s.flavour)}</code>],
        ['vCPU and memory', `${f?.vcpu} vCPU · ${f?.ramGb} GB RAM${f?.gpus ? ` · ${f.gpus} GPU` : ''}`],
        ['Image', imageName(s.image)],
        ['Boot volume', `${s.volumeGb} GB · ${String(s.volumeType)}`],
      ];
    }
    case 'k8s':
      return [
        ['Version', `Kubernetes ${String(s.version)}`],
        ['Control plane', s.controlPlane === 'dedicated' ? 'Dedicated, three nodes' : 'Hosted by the platform'],
        ['Workers', `${s.workerCount} × ${String(s.workerFlavour)}`],
        ['API access', s.publicApi ? 'Public endpoint' : 'Private to your VPC'],
      ];
    case 'db': {
      const d = DB_SIZES[String(s.size)];
      return [
        ['Engine', `PostgreSQL ${String(s.version)}`],
        ['Size', `${String(s.size)} · ${d?.vcpu} vCPU · ${d?.ramGb} GB`],
        ['Availability', s.topology === 'ha' ? 'Primary and two replicas' : 'Single instance'],
        ['Storage', `${s.storageGb} GB per instance`],
      ];
    }
    default:
      return [
        ['Type', itemOf(r.catalogItemId)?.name ?? ''],
        ['Settings', describe(r.catalogItemId, r.spec)],
        ...(r.catalogItemId === 'object' ? ([['Object Lock', s.objectLock ? `On, ${s.retentionDays} days` : 'Off']] as [string, ReactNode][]) : []),
      ];
  }
}

export function ResourceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { api, user, project } = useSession();
  const { run, messages } = useLifecycle();
  const [tab, setTab] = useState<string | number>('overview');
  const [range, setRange] = useState<RangeId>('1h');
  const [menu, setMenu] = useState(false);
  const [confirm, setConfirm] = useState<{ action: LifecycleAction; targets: Resource[] }>();
  const [connect, setConnect] = useState(false);
  const [tagForm, setTagForm] = useState<{ key: string; value: string }>();
  const [tagProblem, setTagProblem] = useState<Problem>();
  const resources = useLive(() => (project ? api.listResources(project.id) : Promise.resolve([])), [project?.id]);
  const ops = useLive(() => (project ? api.listOperations(project.id) : Promise.resolve([])), [project?.id]);
  const r = resources?.find((x) => x.id === id);

  if (!resources) return null;
  if (!r)
    return (
      <PageSection>
        <EmptyState titleText="Resource not found" headingLevel="h1">
          <EmptyStateBody>It may have been permanently deleted, or it belongs to another project.</EmptyStateBody>
          <Button variant="primary" onClick={() => navigate('/')}>
            Go to the dashboard
          </Button>
        </EmptyState>
      </PageSection>
    );

  const kind = kindOf(r.catalogItemId)!;
  const item = itemOf(r.catalogItemId)!;
  const history = (ops ?? []).filter((o) => o.resourceId === r.id);
  const monthly = resourceMonthly(r);
  const mtd = monthToDate(r);
  const monthPct = Math.round((new Date().getDate() / new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate()) * 100);
  const labels = lastHourLabels(7);
  const cpu = series(r.id, 7, kind === 'db' ? 35 : 30, 40);
  const netIn = series(`${r.id}-in`, 24, 30, 30).map((v) => v / 10);
  const netOut = series(`${r.id}-out`, 24, 15, 20).map((v) => v / 10);
  const live = r.status === 'active';
  const ask = (a: LifecycleAction) => (a === 'start' || a === 'restore' ? void run([r], a) : setConfirm({ action: a, targets: [r] }));
  const kebab = [
    ...item.day2.filter((a) => a !== 'reboot'),
    ...(['restore', 'purge'] as LifecycleAction[]),
  ];
  const login = String(r.spec.image).startsWith('windows') ? 'Administrator' : String(r.spec.image).startsWith('ubuntu') ? 'ubuntu' : 'cloud-user';

  async function saveTags(tags: Record<string, string>) {
    setTagProblem(undefined);
    try {
      await api.updateTags(user!, r!.id, tags);
      setTagForm(undefined);
    } catch (e) {
      if (e instanceof ProblemError) setTagProblem(e.problem);
      else throw e;
    }
  }

  return (
    <>
      <PageSection>
        <Breadcrumb>
          <BreadcrumbItem>
            <Link to={LIST_PATH[kind]}>{LIST_NAME[kind]}</Link>
          </BreadcrumbItem>
          <BreadcrumbItem isActive>{r.name}</BreadcrumbItem>
        </Breadcrumb>
        <div className="detail-head">
          <div className="title-row">
            <Button variant="secondary" icon={<ArrowLeftIcon />} aria-label="Back" onClick={() => navigate(LIST_PATH[kind])} />
            <Title headingLevel="h1" size="2xl">
              {r.name}
            </Title>
            <StatusLabel status={r.status} />
            <PendingLabel r={r} />
          </div>
          <div className="detail-actions">
            {kind === 'vm' && (
              <Button variant="primary" icon={<TerminalIcon />} isDisabled={!live} onClick={() => setConnect(true)}>
                Connect
              </Button>
            )}
            {item.day2.includes('reboot') && (
              <Button variant="secondary" icon={<RedoIcon />} isDisabled={!live || !!r.pending} onClick={() => void run([r], 'reboot')}>
                Restart
              </Button>
            )}
            {item.powerControl !== false &&
              (r.status === 'stopped' ? (
                <Button variant="secondary" icon={<PlayIcon />} isDisabled={!canDo(r, 'start')} onClick={() => ask('start')}>
                  Start
                </Button>
              ) : (
                <Button variant="secondary" icon={<PowerOffIcon />} isDisabled={!canDo(r, 'stop')} onClick={() => ask('stop')}>
                  Shut down
                </Button>
              ))}
            <Button variant="secondary" isDanger icon={<ArchiveIcon />} isDisabled={!canDo(r, 'decommission')} onClick={() => ask('decommission')}>
              Decommission
            </Button>
            <Dropdown
              isOpen={menu}
              onOpenChange={setMenu}
              popperProps={{ position: 'right' }}
              toggle={(ref) => (
                <MenuToggle ref={ref} variant="plain" aria-label="More actions" onClick={() => setMenu((m) => !m)} isExpanded={menu}>
                  <EllipsisVIcon />
                </MenuToggle>
              )}
            >
              <DropdownList>
                {kebab.map((a) =>
                  a === 'restore' || a === 'purge' ? (
                    <DropdownItem key={a} isDanger={a === 'purge'} isDisabled={!canDo(r, a)} onClick={() => (setMenu(false), ask(a))}>
                      {ACTION_LABELS[a]}
                    </DropdownItem>
                  ) : (
                    <DropdownItem key={a} isDisabled={!['active', 'stopped'].includes(r.status)} onClick={() => (setMenu(false), void run([r], a))}>
                      {ACTION_LABELS[a]}
                    </DropdownItem>
                  ),
                )}
              </DropdownList>
            </Dropdown>
          </div>
        </div>
        <div className="meta-row">
          <CopyValue value={r.id} label="ID" />
          <span>
            <OutlinedClockIcon /> Created {fmtDate(r.createdAt)} · {ago(r.createdAt)} by {r.createdBy}
          </span>
          <span>
            <GlobeIcon /> Region: {regionName(r.region)} · zone placed automatically
          </span>
          <span>
            <MicrochipIcon /> {item.name}
          </span>
        </div>
        {r.description && <Content component="p" className="muted">{r.description}</Content>}
        {r.retentionUntil && (
          <Alert variant="custom" isInline className="stack-gap" title={`Decommissioned. Restorable until ${fmtDate(r.retentionUntil)}, then permanently deleted.`} />
        )}
        {r.pending && (
          <Alert variant="warning" isInline className="stack-gap" title={`${r.pending.action === 'purge' ? 'Permanent deletion' : 'Decommission'} requested by ${r.pending.requestedBy}`}>
            Waiting for an organisation admin other than the requester to approve under <Link to="/activity">Activity and approvals</Link>.
          </Alert>
        )}
        {messages}
      </PageSection>

      <PageSection className="tight-top" padding={{ default: 'noPadding' }}>
        <Tabs activeKey={tab} onSelect={(_e, k) => setTab(k)} aria-label="Resource sections" className="detail-tabs" inset={{ default: 'insetMd' }}>
          <Tab eventKey="overview" title={<TabTitleText>Overview</TabTitleText>} />
          <Tab eventKey="metrics" title={<TabTitleText>Metrics</TabTitleText>} />
          {kind === 'vm' && <Tab eventKey="storage" title={<TabTitleText>Storage and disks</TabTitleText>} />}
          <Tab eventKey="logs" title={<TabTitleText>Logs</TabTitleText>} />
          <Tab eventKey="network" title={<TabTitleText>Networking</TabTitleText>} />
          <Tab eventKey="history" title={<TabTitleText>Actions and history ({history.length})</TabTitleText>} />
        </Tabs>
      </PageSection>

      <PageSection>
        {tab === 'overview' && (
          <>
            <div className="stat-grid stat-grid--4">
              <Card isFullHeight>
                <CardTitle className="eyebrow">Status and uptime</CardTitle>
                <CardBody>
                  <Facts
                    items={[
                      ['State', <StatusDot key="s" status={r.status} />],
                      ['Uptime', live ? <span className="mono">{uptime(r.createdAt)}</span> : '—'],
                      ['Created by', r.createdBy],
                    ]}
                  />
                </CardBody>
              </Card>
              <Card isFullHeight>
                <CardTitle className="eyebrow">Configuration</CardTitle>
                <CardBody>
                  <Facts items={configFacts(r)} />
                </CardBody>
              </Card>
              <Card isFullHeight>
                <CardTitle className="eyebrow">Networking</CardTitle>
                <CardBody>
                  <Facts
                    items={
                      kind === 'vm'
                        ? [
                            ['Public IPv4', r.addresses?.public ? <CopyValue value={r.addresses.public} label="public IP" /> : 'None'],
                            ['Private IPv4', r.addresses ? <CopyValue value={r.addresses.private} label="private IP" /> : '—'],
                            ['VPC network', 'default-vpc'],
                          ]
                        : [
                            ['Endpoint', r.endpoint ? <CopyValue value={r.endpoint} label="endpoint" /> : 'Not attached'],
                            ['VPC network', 'default-vpc'],
                          ]
                    }
                  />
                </CardBody>
              </Card>
              <Card isFullHeight>
                <CardTitle className="eyebrow">Cost estimate</CardTitle>
                <CardBody>
                  {monthly === undefined ? (
                    <>
                      <div className="big-number">Pay per use</div>
                      <Content component="small" className="muted">
                        {inr(OBJECT_RATE_PER_GB, true)} per GB stored per month, plus requests. Indicative, excluding GST.
                      </Content>
                    </>
                  ) : (
                    <>
                      <div className="big-number">
                        {inr(mtd ?? 0)} <span className="muted small">month to date</span>
                      </div>
                      <Progress value={monthPct} aria-label="Month elapsed" size="sm" measureLocation="none" />
                      <Content component="small" className="muted">
                        Rate {inr(monthly / 730, true)}/hr · about {inr(monthly)}/month. Indicative, excluding GST.
                      </Content>
                    </>
                  )}
                </CardBody>
              </Card>
            </div>

            {kind !== 'storage' && (
              <Card className="stack-gap-lg">
                <CardHeader actions={{ actions: <Label variant="outline">Last hour</Label> }}>
                  <CardTitle>Metrics summary</CardTitle>
                  <Content component="small" className="muted">
                    Live utilisation from the tenant observability plane
                  </Content>
                </CardHeader>
                <CardBody>
                  {live ? (
                    <div className="chart-grid">
                      <div className="chart-card">
                        <div className="chart-title">
                          <strong>CPU utilisation</strong>
                          <span>
                            <Label isCompact color="blue">
                              Avg {avg(cpu)}%
                            </Label>{' '}
                            <Label isCompact variant="outline">
                              Peak {Math.max(...cpu)}%
                            </Label>
                          </span>
                        </div>
                        <BarChart values={cpu} labels={labels} label="CPU utilisation" />
                      </div>
                      <div className="chart-card">
                        <div className="chart-title">
                          <strong>Network in and out</strong>
                          <span className="legend">
                            <span className="legend-dot legend-dot--a" /> In {avg(netIn)} MB/s <span className="legend-dot legend-dot--b" /> Out {avg(netOut)} MB/s
                          </span>
                        </div>
                        <AreaChart a={netIn} b={netOut} labels={lastHourLabels(24)} label="Network in and out" />
                      </div>
                    </div>
                  ) : (
                    <Content component="p" className="muted">
                      No live metrics while the workload is {r.status.replace(/_/g, ' ')}.
                    </Content>
                  )}
                </CardBody>
              </Card>
            )}

            <Card className="stack-gap-lg">
              <CardHeader
                actions={{
                  actions: (
                    <Button variant="secondary" icon={<PlusCircleIcon />} onClick={() => setTagForm({ key: '', value: '' })}>
                      Add tag
                    </Button>
                  ),
                }}
              >
                <CardTitle>
                  <TagIcon /> Resource tags
                </CardTitle>
                <Content component="small" className="muted">
                  Tags are used for governance, cost attribution on invoices, and automation filters.
                </Content>
              </CardHeader>
              <CardBody>
                {tagProblem && <Alert variant="danger" isInline title={tagProblem.title} className="stack-gap">{tagProblem.detail}</Alert>}
                {Object.keys(r.tags).length === 0 ? (
                  <Content component="p" className="muted">
                    No tags yet.
                  </Content>
                ) : (
                  <LabelGroup numLabels={12}>
                    {Object.entries(r.tags).map(([k, v]) => (
                      <Label
                        key={k}
                        variant="outline"
                        onClose={() => {
                          const next = { ...r.tags };
                          delete next[k];
                          void saveTags(next);
                        }}
                        closeBtnAriaLabel={`Remove tag ${k}`}
                      >
                        {k}: <strong>&nbsp;{v}</strong>
                      </Label>
                    ))}
                  </LabelGroup>
                )}
              </CardBody>
            </Card>
          </>
        )}

        {tab === 'metrics' && (
          <>
            <div className="obs-toolbar">
              <span className="muted">{live ? 'Collected every 60 seconds; kept 30 days.' : 'This resource is not running; the charts show its last recorded history.'}</span>
              <span className="obs-toolbar__spacer" />
              <RangePicker value={range} onChange={setRange} />
            </div>
            <div className="obs-grid-2">
              {resourceCharts(r, kind, range).map((c) => (
                <LineChart key={c.title} title={c.title} series={c.series} unit={c.unit} range={range} threshold={c.threshold} max={c.max} />
              ))}
            </div>
            <Content component="p" className="muted small stack-gap-lg">
              Set thresholds and notifications under <Link to="/monitoring">Monitoring and logs</Link>.
            </Content>
          </>
        )}

        {tab === 'logs' && (
          <>
            <div className="obs-toolbar">
              <span className="muted">
                {kind === 'vm' ? 'System and application logs from the Tatv logging agent, plus every action taken on this resource.' : kind === 'k8s' ? 'Kubernetes events from this cluster, plus every action taken on it.' : kind === 'db' ? 'Engine logs and slow queries, plus every action taken on this database.' : 'Every action taken on this resource.'}
              </span>
              <span className="obs-toolbar__spacer" />
              <RangePicker value={range} onChange={setRange} />
            </div>
            <LogViewer
              lines={tenantLogs([r], kindOf, sourcesForKind(kind), range)}
              range={range}
              showSubject={false}
              sources={[...new Set(templatesFor(sourcesForKind(kind)).map((t) => t.source))]}
              tail={live ? { seed: r.id, templates: templatesFor(sourcesForKind(kind)), subjects: [r.name] } : undefined}
            />
          </>
        )}

        {tab === 'storage' && kind === 'vm' && (
          <Card>
            <Table aria-label="Disks" variant="compact">
              <Thead>
                <Tr>
                  <Th>Disk</Th>
                  <Th>Size</Th>
                  <Th>Type</Th>
                  <Th>Backups</Th>
                  <Th>Encryption</Th>
                </Tr>
              </Thead>
              <Tbody>
                <Tr>
                  <Td dataLabel="Disk">
                    {r.name}-boot <Label isCompact>Boot</Label>
                  </Td>
                  <Td dataLabel="Size">{String(r.spec.volumeGb)} GB</Td>
                  <Td dataLabel="Type">{String(r.spec.volumeType)}</Td>
                  <Td dataLabel="Backups">{r.spec.backupPolicy === 'none' ? 'None' : r.spec.backupPolicy === 'daily-7' ? 'Daily, keep 7 days' : 'Daily, keep 30 days (immutable)'}</Td>
                  <Td dataLabel="Encryption">{r.spec.volumeType === 'encrypted' ? 'Customer-managed key' : 'Platform key'}</Td>
                </Tr>
              </Tbody>
            </Table>
            <CardBody>
              <Content component="small" className="muted">
                Attach more disks by creating a block volume in the same region.
              </Content>
            </CardBody>
          </Card>
        )}

        {tab === 'network' && (
          <Card>
            <CardBody>
              <Facts
                items={[
                  ['Region', regionName(r.region)],
                  ['VPC network', 'default-vpc (10.20.0.0/16)'],
                  ['Subnet', 'app-subnet (10.20.0.0/20)'],
                  ['Security group', 'default — inbound from the VPC only'],
                  ...(kind === 'vm'
                    ? ([
                        ['Private IPv4', r.addresses?.private ?? '—'],
                        ['Public IPv4', r.addresses?.public ?? 'None'],
                      ] as [string, ReactNode][])
                    : ([['Endpoint', r.endpoint ?? '—']] as [string, ReactNode][])),
                ]}
              />
            </CardBody>
          </Card>
        )}

        {tab === 'history' && (
          <Card>
            <Table aria-label="Actions and history" variant="compact">
              <Thead>
                <Tr>
                  <Th>When</Th>
                  <Th>Action</Th>
                  <Th>Status</Th>
                  <Th>Detail</Th>
                </Tr>
              </Thead>
              <Tbody>
                {history.map((o) => (
                  <Tr key={o.id}>
                    <Td dataLabel="When">{new Date(o.requestedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</Td>
                    <Td dataLabel="Action">{o.action === 'create' ? 'Create' : ACTION_LABELS[o.action]}</Td>
                    <Td dataLabel="Status">
                      <StatusLabel status={o.status} />
                    </Td>
                    <Td dataLabel="Detail">
                      {o.message}
                      {o.approvedBy && o.status !== 'rejected' ? ` Approved by ${o.approvedBy}.` : ''}
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </Card>
        )}
      </PageSection>

      <LifecycleConfirm
        confirm={confirm}
        shutdownNote={SHUTDOWN[kind] ?? ''}
        onClose={() => setConfirm(undefined)}
        onConfirm={(c) => {
          void run(c.targets, c.action);
          setConfirm(undefined);
        }}
      />

      <Modal isOpen={connect} onClose={() => setConnect(false)} variant="small" aria-labelledby="connect-title">
        <ModalHeader title={`Connect to ${r.name}`} labelId="connect-title" />
        <ModalBody>
          {String(r.spec.image).startsWith('windows') ? (
            <>
              <p>Connect with Remote Desktop to:</p>
              <CopyValue value={r.addresses?.public ?? r.addresses?.private ?? ''} label="address" />
              <p className="para-gap">
                Sign in as <code>{login}</code>. Retrieve the password from the platform secrets store; it is shown once.
              </p>
            </>
          ) : (
            <>
              <p>Connect with SSH using the key pair chosen at creation:</p>
              <CopyValue value={`ssh ${login}@${r.addresses?.public ?? r.addresses?.private ?? ''}`} label="SSH command" />
            </>
          )}
          {!r.addresses?.public && <Alert variant="info" isInline isPlain className="para-gap" title="This VM has no public IP; connect from inside your VPC or over the site-to-site VPN." />}
          <Divider className="para-gap" />
          <p className="para-gap muted">A browser console that runs through the portal, with no public IP needed, is coming soon.</p>
        </ModalBody>
        <ModalFooter>
          <Button variant="primary" onClick={() => setConnect(false)}>
            Done
          </Button>
        </ModalFooter>
      </Modal>

      <Modal isOpen={!!tagForm} onClose={() => setTagForm(undefined)} variant="small" aria-labelledby="tag-title">
        <ModalHeader title="Add tag" labelId="tag-title" />
        <ModalBody>
          {tagForm && (
            <Form
              id="tag-form"
              onSubmit={(e) => {
                e.preventDefault();
                void saveTags({ ...r.tags, [tagForm.key.trim()]: tagForm.value.trim() });
              }}
            >
              <FormGroup label="Key" fieldId="tag-key" isRequired>
                <TextInput id="tag-key" value={tagForm.key} onChange={(_e, v) => setTagForm({ ...tagForm, key: v })} placeholder="cost-centre" />
              </FormGroup>
              <FormGroup label="Value" fieldId="tag-value">
                <TextInput id="tag-value" value={tagForm.value} onChange={(_e, v) => setTagForm({ ...tagForm, value: v })} placeholder="cc-1042" />
              </FormGroup>
            </Form>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="primary" type="submit" form="tag-form" isDisabled={!tagForm?.key.trim()}>
            Add tag
          </Button>
          <Button variant="link" onClick={() => setTagForm(undefined)}>
            Cancel
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
}
