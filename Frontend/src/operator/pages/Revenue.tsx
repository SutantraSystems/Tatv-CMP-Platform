import { Card, CardBody, CardTitle, Content, Label, PageSection, Title } from '@patternfly/react-core';
import { RupeeSignIcon } from '@patternfly/react-icons';
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import { Link } from 'react-router-dom';
import { StatCard } from '../../components/ui';
import { SERVICES } from '../api/types';
import { ShareBars, TrendBars, inrShort, lastMonths } from '../components';
import { useOps, useOpsLive } from '../session';

export function Revenue() {
  const { api } = useOps();
  const tenants = useOpsLive(() => api.listTenants());
  if (!tenants) return null;
  const runRate = tenants.reduce((s, t) => s + t.monthly, 0);
  const day = new Date().getDate();
  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  const mtd = (runRate * day) / daysInMonth;
  const invoices = tenants.flatMap((t) => t.invoices.map((i) => ({ ...i, tenant: t })));
  const overdue = invoices.filter((i) => i.status === 'overdue');
  const due = invoices.filter((i) => i.status === 'due');
  const history = [0, 1, 2, 3, 4, 5].map((i) => tenants.reduce((s, t) => s + (t.history[i] ?? 0), 0));
  const byService = SERVICES.map((s) => [s, tenants.reduce((sum, t) => sum + t.byService[s], 0)] as [string, number]);
  const byKind = (['commercial', 'government', 'regulated'] as const).map((k) => [k.charAt(0).toUpperCase() + k.slice(1), tenants.filter((t) => t.kind === k).reduce((s, t) => s + t.monthly, 0)] as [string, number]);
  const top = [...tenants].sort((a, b) => b.monthly - a.monthly).slice(0, 8);

  return (
    <>
      <PageSection>
        <Title headingLevel="h1" size="2xl">
          Revenue and billing
        </Title>
        <Content component="p" className="muted">
          Indicative figures excluding GST, from metered usage. In production, Kill Bill is the source of truth and the partner is the merchant of record.
        </Content>
      </PageSection>
      <PageSection className="tight-top">
        <div className="stat-grid stat-grid--4">
          <StatCard label="Monthly run rate" value={inrShort(runRate)} sub={`≈ ${inrShort(runRate * 12)} a year`} icon={<RupeeSignIcon />} tone="green" />
          <StatCard label="Month to date" value={inrShort(mtd)} sub={`Day ${day} of ${daysInMonth}`} icon={<RupeeSignIcon />} />
          <StatCard label="Invoices due" value={inrShort(due.reduce((s, i) => s + i.amount, 0))} sub={`${due.length} invoices, within terms`} icon={<RupeeSignIcon />} tone="teal" />
          <StatCard label="Overdue" value={inrShort(overdue.reduce((s, i) => s + i.amount, 0))} sub={`${overdue.length} invoices`} icon={<RupeeSignIcon />} tone={overdue.length ? 'red' : 'green'} />
        </div>
      </PageSection>
      <PageSection className="tight-top">
        <div className="dash-grid">
          <Card>
            <CardTitle>Billing, last six months</CardTitle>
            <CardBody>
              <TrendBars values={history} labels={lastMonths(6)} format={inrShort} label="Billing per month" />
            </CardBody>
          </Card>
          <Card>
            <CardTitle>Run rate by service</CardTitle>
            <CardBody>
              <ShareBars rows={byService} format={inrShort} />
            </CardBody>
          </Card>
          <Card>
            <CardTitle>Run rate by tenant type</CardTitle>
            <CardBody>
              <ShareBars rows={byKind} format={inrShort} />
            </CardBody>
          </Card>
        </div>
      </PageSection>
      <PageSection className="tight-top">
        <div className="stat-grid stat-grid--2">
          <Card>
            <CardTitle>Top tenants</CardTitle>
            <Table aria-label="Top tenants" variant="compact">
              <Thead>
                <Tr>
                  <Th>Tenant</Th>
                  <Th>Run rate</Th>
                  <Th>Share</Th>
                </Tr>
              </Thead>
              <Tbody>
                {top.map((t) => (
                  <Tr key={t.id}>
                    <Td dataLabel="Tenant">
                      <Link to={`/tenants/${t.id}`}>{t.name}</Link>
                    </Td>
                    <Td dataLabel="Run rate">{inrShort(t.monthly)}</Td>
                    <Td dataLabel="Share">{Math.round((t.monthly / runRate) * 100)}%</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </Card>
          <Card>
            <CardTitle>Overdue invoices</CardTitle>
            {overdue.length === 0 ? (
              <CardBody>
                <Content component="p" className="muted">
                  Nothing overdue.
                </Content>
              </CardBody>
            ) : (
              <Table aria-label="Overdue invoices" variant="compact">
                <Thead>
                  <Tr>
                    <Th>Tenant</Th>
                    <Th>Invoice</Th>
                    <Th>Amount</Th>
                    <Th>Tenant status</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {overdue.map((i) => (
                    <Tr key={i.id}>
                      <Td dataLabel="Tenant">
                        <Link to={`/tenants/${i.tenant.id}`}>{i.tenant.name}</Link>
                      </Td>
                      <Td dataLabel="Invoice" className="mono">
                        {i.id}
                        <div className="muted small">{i.month}</div>
                      </Td>
                      <Td dataLabel="Amount">{inrShort(i.amount)}</Td>
                      <Td dataLabel="Tenant status">
                        <Label isCompact color={i.tenant.status === 'suspended' ? 'red' : 'green'}>
                          {i.tenant.status}
                        </Label>
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            )}
          </Card>
        </div>
      </PageSection>
    </>
  );
}
