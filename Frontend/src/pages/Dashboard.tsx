import {
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Content,
  PageSection,
  Title,
  ToggleGroup,
  ToggleGroupItem,
} from '@patternfly/react-core';
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import {
  CubesIcon,
  DatabaseIcon,
  FolderOpenIcon,
  HddIcon,
  HistoryIcon,
  MicrochipIcon,
  PlusCircleIcon,
  RupeeSignIcon,
  ServerIcon,
  UsersIcon,
} from '@patternfly/react-icons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { CATEGORIES, FLAVOURS, inr, kindOf, regionName } from '../api/catalog';
import type { Operation, Quota, Resource } from '../api/types';
import { StatusLabel } from '../components/Status';
import { StatCard, resourceMonthly } from '../components/ui';
import { useLive, useSession } from '../session';

const QUOTA_LABELS: Record<keyof Quota, [string, string]> = {
  vcpu: ['vCPUs', ''],
  ramGb: ['Memory', 'GB'],
  volumeGb: ['Block and file storage', 'GB'],
  gpus: ['GPUs', ''],
  publicIps: ['Public IPs', ''],
};

const ACTION_TEXT: Record<string, string> = { create: 'Create', decommission: 'Decommission', purge: 'Delete permanently', stop: 'Shut down', start: 'Start', reboot: 'Restart', restore: 'Restore' };

function stats(rs: Resource[]) {
  const live = rs.filter((r) => !['rejected', 'deleted'].includes(r.status));
  const of = (k: string) => live.filter((r) => kindOf(r.catalogItemId) === k);
  const vms = of('vm');
  const storage = of('storage');
  const gpuOf = (r: Resource) =>
    kindOf(r.catalogItemId) === 'vm'
      ? FLAVOURS[String(r.spec.flavour)]?.gpus ?? 0
      : kindOf(r.catalogItemId) === 'k8s'
        ? (FLAVOURS[String(r.spec.workerFlavour)]?.gpus ?? 0) * Number(r.spec.workerCount)
        : 0;
  const gpus = live.filter((r) => r.status === 'active').reduce((n, r) => n + gpuOf(r), 0);
  const gpusPending = live.filter((r) => r.status === 'awaiting_approval').reduce((n, r) => n + gpuOf(r), 0);
  return {
    vms: vms.length,
    running: vms.filter((r) => r.status === 'active').length,
    stopped: vms.filter((r) => r.status === 'stopped').length,
    clusters: of('k8s').length,
    workers: of('k8s').reduce((n, r) => n + Number(r.spec.workerCount ?? 0), 0),
    dbs: of('db').length,
    ha: of('db').filter((r) => r.spec.topology === 'ha').length,
    storageGb: storage.filter((r) => r.catalogItemId !== 'object').reduce((n, r) => n + Number(r.spec.sizeGb ?? 0), 0),
    buckets: storage.filter((r) => r.catalogItemId === 'object').length,
    gpus,
    gpusPending,
    monthly: live.reduce((n, r) => n + (resourceMonthly(r) ?? 0), 0),
  };
}

export function Dashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { api, user, project, projects, organisation, region, isAdmin } = useSession();
  const [scope, setScope] = useState<'project' | 'tenant'>('project');
  const quota = useLive(() => (project ? api.getQuota(project.id) : Promise.resolve(undefined)), [project?.id]);
  const all = useLive(
    () => Promise.all(projects.map((p) => api.listResources(p.id))).then((lists) => lists.flat()),
    [projects.map((p) => p.id).join()],
  );
  const ops = useLive(() => (project ? api.listOperations(project.id) : Promise.resolve([] as Operation[])), [project?.id]);

  const inRegion = (all ?? []).filter((r) => r.region === region);
  const scoped = scope === 'project' ? inRegion.filter((r) => r.projectId === project?.id) : inRegion;
  const s = stats(scoped);
  const pending = (ops ?? []).filter((o) => o.status === 'awaiting_approval');
  const recent = (ops ?? []).filter((o) => o.status !== 'awaiting_approval').slice(0, 5);
  const firstName = user?.name.split(' ')[0] ?? '';

  return (
    <>
      <PageSection>
        <div className="page-head">
          <div>
            <Title headingLevel="h1" size="2xl">
              {t('common.welcome')}, {firstName}
            </Title>
            <Content component="p" className="muted">
              {scope === 'project' ? (
                <>
                  Project <strong>{project?.name}</strong> in {organisation?.name} · {regionName(region)} region
                </>
              ) : (
                <>
                  All {projects.length} projects in {organisation?.name} · {regionName(region)} region
                </>
              )}
            </Content>
          </div>
          <ToggleGroup aria-label="Dashboard scope">
            <ToggleGroupItem text="This project" isSelected={scope === 'project'} onChange={() => setScope('project')} />
            <ToggleGroupItem text="Whole tenant" isSelected={scope === 'tenant'} onChange={() => setScope('tenant')} />
          </ToggleGroup>
        </div>
      </PageSection>

      <PageSection>
        <div className="stat-grid stat-grid--3">
          <StatCard label="Virtual machines" value={s.vms} sub={`${s.running} running · ${s.stopped} shut down`} icon={<ServerIcon />} />
          <StatCard label="Kubernetes clusters" value={s.clusters} sub={`${s.workers} worker nodes`} icon={<CubesIcon />} tone="teal" />
          <StatCard label="Databases" value={s.dbs} sub={`${s.ha} highly available`} icon={<DatabaseIcon />} tone="teal" />
          <StatCard label="Block and file storage" value={`${s.storageGb.toLocaleString('en-IN')} GB`} sub={`${s.buckets} object storage bucket${s.buckets === 1 ? '' : 's'}`} icon={<HddIcon />} />
          <StatCard label="GPUs in use" value={s.gpus} sub={s.gpusPending ? `${s.gpusPending} more awaiting approval` : 'Across VMs and node pools'} icon={<MicrochipIcon />} tone="violet" />
          <StatCard label="Monthly cost estimate" value={inr(s.monthly)} sub="Indicative, excluding GST" icon={<RupeeSignIcon />} tone="green" />
        </div>
      </PageSection>

      <PageSection>
        <div className="dash-grid">
          {scope === 'project' ? (
            <Card>
              <CardHeader actions={{ actions: <Content component="small" className="muted">All regions</Content> }}>
                <CardTitle>Quota for {project?.name}</CardTitle>
              </CardHeader>
              <CardBody>
                <div className="quota-list">
                  {quota &&
                    (Object.keys(QUOTA_LABELS) as (keyof Quota)[]).map((k) => {
                      const q = quota[k];
                      const [label, unit] = QUOTA_LABELS[k];
                      const pct = q.limit ? Math.round(((q.used + q.reserved) / q.limit) * 100) : 0;
                      const w = (n: number) => `${q.limit ? Math.min(100, (n / q.limit) * 100) : 0}%`;
                      return (
                        <div key={k} className={`qbar ${pct >= 90 ? 'is-bad' : pct >= 75 ? 'is-warn' : ''}`}>
                          <div className="qbar__top">
                            <span>{label}</span>
                            <span>
                              {q.used.toLocaleString('en-IN')} used{q.reserved ? ` + ${q.reserved.toLocaleString('en-IN')} reserved` : ''} of {q.limit.toLocaleString('en-IN')} {unit}
                            </span>
                          </div>
                          <div className="qbar__track" role="meter" aria-label={`${label} quota`} aria-valuemin={0} aria-valuemax={q.limit} aria-valuenow={q.used + q.reserved}>
                            <span className="qbar__used" style={{ width: w(q.used) }} />
                            <span className="qbar__reserved" style={{ width: w(q.reserved) }} />
                          </div>
                        </div>
                      );
                    })}
                </div>
                <Content component="small" className="muted">
                  Reserved capacity is held for requests still awaiting approval or being provisioned.
                </Content>
              </CardBody>
            </Card>
          ) : (
            <Card>
              <CardTitle>Projects</CardTitle>
              <CardBody>
                <Table aria-label="Projects" variant="compact">
                  <Thead>
                    <Tr>
                      <Th>Project</Th>
                      <Th>Resources</Th>
                      <Th>Monthly estimate</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {projects.map((p) => {
                      const ps = stats(inRegion.filter((r) => r.projectId === p.id));
                      const n = inRegion.filter((r) => r.projectId === p.id && r.status !== 'rejected').length;
                      return (
                        <Tr key={p.id}>
                          <Td dataLabel="Project">{p.name}</Td>
                          <Td dataLabel="Resources">{n}</Td>
                          <Td dataLabel="Monthly estimate">{inr(ps.monthly)}</Td>
                        </Tr>
                      );
                    })}
                  </Tbody>
                </Table>
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader actions={{ actions: <Link to="/activity">View all</Link> }}>
              <CardTitle>Awaiting approval ({pending.length})</CardTitle>
            </CardHeader>
            <CardBody>
              {pending.length === 0 ? (
                <Content component="p" className="muted">
                  Nothing is waiting for approval.
                </Content>
              ) : (
                <ul className="plain-list">
                  {pending.map((o) => (
                    <li key={o.id}>
                      <div>
                        <strong>{ACTION_TEXT[o.action] ?? o.action}</strong> {o.resourceName}
                        <div className="muted small">Requested {new Date(o.requestedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</div>
                      </div>
                      {isAdmin && o.requestedBy !== user?.id ? (
                        <Button size="sm" variant="secondary" onClick={() => navigate('/activity')}>
                          Review
                        </Button>
                      ) : (
                        <StatusLabel status="awaiting_approval" />
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardTitle>Recent activity</CardTitle>
            <CardBody>
              <ul className="plain-list">
                {recent.map((o) => (
                  <li key={o.id}>
                    <div>
                      <strong>{ACTION_TEXT[o.action] ?? o.action}</strong> {o.resourceName}
                      <div className="muted small">{new Date(o.finishedAt ?? o.requestedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</div>
                    </div>
                    <StatusLabel status={o.status} />
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        </div>
      </PageSection>

      <PageSection>
        <Title headingLevel="h2" size="lg" className="section-title">
          Quick actions
        </Title>
        <div className="quick-actions">
          <Button variant="secondary" icon={<PlusCircleIcon />} onClick={() => navigate('/catalog/vm-linux/create')}>
            New virtual machine
          </Button>
          <Button variant="secondary" icon={<FolderOpenIcon />} onClick={() => navigate('/catalog/object/create')}>
            Create bucket
          </Button>
          <Button variant="secondary" icon={<DatabaseIcon />} onClick={() => navigate('/catalog/pg/create')}>
            New PostgreSQL database
          </Button>
          <Button variant="secondary" icon={<UsersIcon />} onClick={() => navigate('/iam')}>
            Manage users
          </Button>
          <Button variant="secondary" icon={<HistoryIcon />} onClick={() => navigate('/activity')}>
            View activity
          </Button>
        </div>
      </PageSection>

      <PageSection>
        <div className="page-head">
          <Title headingLevel="h2" size="lg" className="section-title">
            Explore services
          </Title>
          <Link to="/catalog">View all</Link>
        </div>
        <div className="explore-grid">
          {CATEGORIES.map((c) => (
            <Card key={c.id} isClickable isCompact>
              <CardHeader selectableActions={{ onClickAction: () => navigate(`/catalog?category=${c.id}`), selectableActionAriaLabel: `Browse ${c.name}` }}>
                <CardTitle>{c.name}</CardTitle>
              </CardHeader>
              <CardBody>
                <Content component="small">{c.summary}</Content>
              </CardBody>
            </Card>
          ))}
        </div>
      </PageSection>
    </>
  );
}

