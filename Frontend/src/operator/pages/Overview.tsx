import { Card, CardBody, CardHeader, CardTitle, Content, PageSection, Title } from '@patternfly/react-core';
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import { BuildingIcon, ClipboardCheckIcon, ExclamationTriangleIcon, MicrochipIcon, RupeeSignIcon, ServerIcon } from '@patternfly/react-icons';
import { Link } from 'react-router-dom';
import { regionName } from '../../api/catalog';
import { StatCard } from '../../components/ui';
import { HealthDot, KindLabel, Meter, TenantStatusLabel, TrendBars, inrShort, lastMonths, num } from '../components';
import { useOps, useOpsLive } from '../session';

export function Overview() {
  const { api, op, access } = useOps();
  const tenants = useOpsLive(() => api.listTenants());
  const capacity = useOpsLive(() => api.capacity());
  const health = useOpsLive(() => api.health());
  const workflows = useOpsLive(() => api.listFailedWorkflows());
  const changes = useOpsLive(() => api.listChangeRequests());
  if (!tenants) return null;

  const active = tenants.filter((t) => t.status === 'active').length;
  const suspended = tenants.filter((t) => t.status === 'suspended').length;
  const onboarding = tenants.filter((t) => t.status === 'onboarding').length;
  const newThisMonth = tenants.filter((t) => Date.now() - new Date(t.joinedAt).getTime() < 31 * 86400_000).length;
  const runRate = tenants.reduce((s, t) => s + t.monthly, 0);
  const history = [0, 1, 2, 3, 4, 5].map((i) => tenants.reduce((s, t) => s + (t.history[i] ?? 0), 0));
  const enrolled = [0, 1, 2, 3, 4, 5].map((i) => {
    const end = new Date();
    end.setDate(1);
    end.setMonth(end.getMonth() - (4 - i));
    return tenants.filter((t) => new Date(t.joinedAt) < end).length;
  });
  const gpusUsed = capacity?.reduce((s, c) => s + c.gpus.allocated, 0) ?? 0;
  const gpusTotal = capacity?.reduce((s, c) => s + c.gpus.installed, 0) ?? 0;
  const issues = (workflows?.filter((w) => w.status === 'failed' || w.status === 'stuck').length ?? 0) + (health?.filter((h) => h.status !== 'operational').length ?? 0);
  const pending = changes?.filter((c) => c.status === 'pending').length ?? 0;
  const top = [...tenants].filter((t) => t.status !== 'onboarding').sort((a, b) => (access.seesRevenue ? b.monthly - a.monthly : b.usage.vcpu - a.usage.vcpu)).slice(0, 6);

  return (
    <>
      <PageSection>
        <Title headingLevel="h1" size="2xl">
          Platform overview
        </Title>
        <Content component="p" className="muted">
          Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, {op?.name.split(' ')[0]}. All tenants across India-West and India-South.
        </Content>
      </PageSection>
      <PageSection className="tight-top">
        <div className="stat-grid stat-grid--3">
          <StatCard label="Tenants enrolled" value={tenants.length} sub={`${active} active · ${suspended} suspended · ${onboarding} onboarding`} icon={<BuildingIcon />} />
          <StatCard label="New in the last 30 days" value={newThisMonth} sub="Organisations onboarded" icon={<BuildingIcon />} tone="teal" />
          {access.seesRevenue ? (
            <StatCard label="Monthly run rate" value={inrShort(runRate)} sub="Indicative, excluding GST" icon={<RupeeSignIcon />} tone="green" />
          ) : (
            <StatCard label="vCPUs allocated" value={num(capacity?.reduce((s, c) => s + c.vcpu.allocated, 0) ?? 0)} sub={`of ${num(capacity?.reduce((s, c) => s + c.vcpu.installed, 0) ?? 0)} installed`} icon={<ServerIcon />} tone="green" />
          )}
          <StatCard label="GPUs in use" value={`${gpusUsed} of ${gpusTotal}`} sub="Across both regions" icon={<MicrochipIcon />} tone="violet" />
          <StatCard label="Open issues" value={issues} sub="Failed workflows and degraded services" icon={<ExclamationTriangleIcon />} tone={issues ? 'red' : 'green'} />
          <StatCard label="Changes awaiting approval" value={pending} sub={<Link to="/approvals">Review approvals</Link>} icon={<ClipboardCheckIcon />} />
        </div>
      </PageSection>

      <PageSection className="tight-top">
        <div className="dash-grid">
          {access.seesRevenue && (
            <Card>
              <CardTitle>Billing, last six months</CardTitle>
              <CardBody>
                <TrendBars values={history} labels={lastMonths(6)} format={inrShort} label="Billing per month" />
                <Content component="small" className="muted">
                  Current month is the run rate so far. Indicative; Kill Bill is the source of truth.
                </Content>
              </CardBody>
            </Card>
          )}
          <Card>
            <CardTitle>Tenants enrolled</CardTitle>
            <CardBody>
              <TrendBars values={enrolled} labels={lastMonths(6)} format={(n) => String(n)} label="Tenants enrolled at each month end" />
            </CardBody>
          </Card>
          {access.pages.includes('capacity') && capacity && (
            <Card>
              <CardHeader actions={{ actions: <Link to="/capacity">Details</Link> }}>
                <CardTitle>Capacity</CardTitle>
              </CardHeader>
              <CardBody className="quota-list">
                {capacity.map((c) => (
                  <div key={c.region} className="quota-list">
                    <strong>{regionName(c.region)}</strong>
                    <Meter label="vCPU" used={c.vcpu.allocated} total={c.vcpu.installed} />
                    <Meter label="GPUs" used={c.gpus.allocated} total={c.gpus.installed} />
                  </div>
                ))}
              </CardBody>
            </Card>
          )}
          {access.pages.includes('operations') && health && (
            <Card>
              <CardHeader actions={{ actions: <Link to="/operations">Details</Link> }}>
                <CardTitle>Service health</CardTitle>
              </CardHeader>
              <CardBody>
                <ul className="plain-list">
                  {health
                    .filter((h) => h.status !== 'operational')
                    .map((h) => (
                      <li key={h.group + h.name}>
                        <div>
                          <strong>{h.name}</strong> · {h.group}
                          <div className="muted small">{h.note}</div>
                        </div>
                        <HealthDot status={h.status} />
                      </li>
                    ))}
                  <li>
                    <span>{health.filter((h) => h.status === 'operational').length} other services</span>
                    <HealthDot status="operational" />
                  </li>
                </ul>
              </CardBody>
            </Card>
          )}
        </div>
      </PageSection>

      <PageSection className="tight-top">
        <Card>
          <CardHeader actions={{ actions: <Link to="/tenants">All tenants</Link> }}>
            <CardTitle>{access.seesRevenue ? 'Top tenants by spend' : 'Largest tenants by vCPU'}</CardTitle>
          </CardHeader>
          <Table aria-label="Top tenants" variant="compact">
            <Thead>
              <Tr>
                <Th>Tenant</Th>
                <Th>Type</Th>
                <Th>Status</Th>
                <Th>vCPUs</Th>
                <Th>GPUs</Th>
                {access.seesRevenue && <Th>Monthly run rate</Th>}
              </Tr>
            </Thead>
            <Tbody>
              {top.map((t) => (
                <Tr key={t.id}>
                  <Td dataLabel="Tenant">
                    <Link to={`/tenants/${t.id}`}>{t.name}</Link>
                  </Td>
                  <Td dataLabel="Type">
                    <KindLabel kind={t.kind} />
                  </Td>
                  <Td dataLabel="Status">
                    <TenantStatusLabel status={t.status} />
                  </Td>
                  <Td dataLabel="vCPUs">{num(t.usage.vcpu)}</Td>
                  <Td dataLabel="GPUs">{t.usage.gpus}</Td>
                  {access.seesRevenue && <Td dataLabel="Monthly run rate">{inrShort(t.monthly)}</Td>}
                </Tr>
              ))}
            </Tbody>
          </Table>
        </Card>
      </PageSection>
    </>
  );
}
