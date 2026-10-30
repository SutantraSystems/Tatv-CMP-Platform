import { Button, Card, CardBody, Content, FormSelect, FormSelectOption, PageSection, SearchInput, Title } from '@patternfly/react-core';
import { PlusCircleIcon } from '@patternfly/react-icons';
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { regionName } from '@/shared/catalog/catalog';
import { KindLabel, KycLabel, TenantStatusLabel, fmtDate, inrShort, num } from '../components/OpsComponents';
import { useOps, useOpsLive } from '../session';

type Sort = 'spend' | 'vcpu' | 'name' | 'joined';

export function Tenants() {
  const { api, access } = useOps();
  const navigate = useNavigate();
  const tenants = useOpsLive(() => api.listTenants());
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('all');
  const [status, setStatus] = useState('all');
  const [region, setRegion] = useState('all');
  const [sort, setSort] = useState<Sort>(access.seesRevenue ? 'spend' : 'vcpu');

  const rows = (tenants ?? [])
    .filter((t) => !q || `${t.name} ${t.gstin} ${t.adminEmail} ${t.id}`.toLowerCase().includes(q.toLowerCase()))
    .filter((t) => kind === 'all' || t.kind === kind)
    .filter((t) => status === 'all' || t.status === status || (status === 'kyc' && t.kyc !== 'verified'))
    .filter((t) => region === 'all' || t.primaryRegion === region)
    .sort((a, b) =>
      sort === 'spend' ? b.monthly - a.monthly : sort === 'vcpu' ? b.usage.vcpu - a.usage.vcpu : sort === 'name' ? a.name.localeCompare(b.name) : b.joinedAt.localeCompare(a.joinedAt),
    );

  return (
    <>
      <PageSection>
        <div className="page-head">
          <div>
            <Title headingLevel="h1" size="2xl">
              Tenants
            </Title>
            <Content component="p" className="muted">
              Every enrolled organisation, its usage against quota{access.seesRevenue ? ' and spend' : ''}.
            </Content>
          </div>
          {access.pages.includes('onboard') && (
            <Button variant="primary" icon={<PlusCircleIcon />} onClick={() => navigate('/onboard')}>
              Onboard tenant
            </Button>
          )}
        </div>
      </PageSection>
      <PageSection className="tight-top">
        <Card className="filter-card">
          <CardBody>
            <div className="filter-row">
              <SearchInput className="filter-search" placeholder="Search by name, GSTIN, admin email or ID" aria-label="Search tenants" value={q} onChange={(_e, v) => setQ(v)} onClear={() => setQ('')} />
              <FormSelect aria-label="Type" value={kind} onChange={(_e, v) => setKind(v)}>
                <FormSelectOption value="all" label="All types" />
                <FormSelectOption value="commercial" label="Commercial" />
                <FormSelectOption value="government" label="Government" />
                <FormSelectOption value="regulated" label="Regulated" />
              </FormSelect>
              <FormSelect aria-label="Status" value={status} onChange={(_e, v) => setStatus(v)}>
                <FormSelectOption value="all" label="All statuses" />
                <FormSelectOption value="active" label="Active" />
                <FormSelectOption value="suspended" label="Suspended" />
                <FormSelectOption value="onboarding" label="Onboarding" />
                <FormSelectOption value="kyc" label="KYC needs attention" />
              </FormSelect>
              <FormSelect aria-label="Region" value={region} onChange={(_e, v) => setRegion(v)}>
                <FormSelectOption value="all" label="All regions" />
                <FormSelectOption value="in-west" label="India-West" />
                <FormSelectOption value="in-south" label="India-South" />
              </FormSelect>
              <FormSelect aria-label="Sort" value={sort} onChange={(_e, v) => setSort(v as Sort)}>
                {access.seesRevenue && <FormSelectOption value="spend" label="Sort: highest spend" />}
                <FormSelectOption value="vcpu" label="Sort: most vCPUs" />
                <FormSelectOption value="name" label="Sort: name" />
                <FormSelectOption value="joined" label="Sort: newest" />
              </FormSelect>
            </div>
          </CardBody>
        </Card>
        <Card className="table-card">
          <Table aria-label="Tenants">
            <Thead>
              <Tr>
                <Th>Tenant</Th>
                <Th>Type</Th>
                <Th>Status</Th>
                <Th>Region</Th>
                <Th>Users</Th>
                <Th>vCPU used of quota</Th>
                <Th>GPUs</Th>
                {access.seesRevenue && <Th>Monthly run rate</Th>}
                <Th>Joined</Th>
              </Tr>
            </Thead>
            <Tbody>
              {rows.map((t) => {
                const pct = t.quota.vcpu ? Math.round((t.usage.vcpu / t.quota.vcpu) * 100) : 0;
                return (
                  <Tr key={t.id}>
                    <Td dataLabel="Tenant">
                      <Link to={`/tenants/${t.id}`} className="row-name">
                        {t.name}
                      </Link>
                      <div className="muted small mono">{t.gstin}</div>
                    </Td>
                    <Td dataLabel="Type">
                      <KindLabel kind={t.kind} />
                    </Td>
                    <Td dataLabel="Status">
                      <div className="stack-labels">
                        <TenantStatusLabel status={t.status} />
                        {t.kyc !== 'verified' && <KycLabel kyc={t.kyc} />}
                      </div>
                    </Td>
                    <Td dataLabel="Region">{regionName(t.primaryRegion)}</Td>
                    <Td dataLabel="Users">{t.users}</Td>
                    <Td dataLabel="vCPU used of quota">
                      <div className={`mini-meter ${pct >= 85 ? 'is-bad' : pct >= 70 ? 'is-warn' : ''}`}>
                        <span>
                          {num(t.usage.vcpu)} / {num(t.quota.vcpu)}
                        </span>
                        <span className="mini-meter__track">
                          <span style={{ width: `${Math.min(100, pct)}%` }} />
                        </span>
                      </div>
                    </Td>
                    <Td dataLabel="GPUs">{t.usage.gpus ? `${t.usage.gpus} / ${t.quota.gpus}` : '—'}</Td>
                    {access.seesRevenue && <Td dataLabel="Monthly run rate">{t.monthly ? inrShort(t.monthly) : '—'}</Td>}
                    <Td dataLabel="Joined">{fmtDate(t.joinedAt)}</Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>
          <div className="table-foot muted small">
            Showing {rows.length} of {tenants?.length ?? 0} tenants
          </div>
        </Card>
      </PageSection>
    </>
  );
}
