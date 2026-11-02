import {
  Alert,
  Breadcrumb,
  BreadcrumbItem,
  Button,
  Card,
  CardBody,
  CardTitle,
  Content,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  EmptyState,
  Form,
  FormGroup,
  Label,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  PageSection,
  TextArea,
  TextInput,
  Title,
} from '@patternfly/react-core';
import { BanIcon, CheckCircleIcon, PencilAltIcon, ShieldAltIcon } from '@patternfly/react-icons';
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { regionName } from '../../api/catalog';
import { ProblemError, type Problem } from '../../api/types';
import { CopyValue } from '../../components/ui';
import { SERVICES, type ChangeKind, type UsageLine } from '../api/types';
import { ChangeStatusLabel, KindLabel, KycLabel, Meter, ShareBars, TenantStatusLabel, TrendBars, fmtDate, fmtTime, inrShort, lastMonths, num } from '../components';
import { useOps, useOpsLive } from '../session';

const QUOTA_FIELDS: [keyof UsageLine, string][] = [
  ['vcpu', 'vCPUs'],
  ['ramGb', 'RAM (GB)'],
  ['storageGb', 'Block and file storage (GB)'],
  ['gpus', 'GPUs'],
];

export function TenantDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { api, op, access } = useOps();
  const t = useOpsLive(() => api.getTenant(id ?? ''), [id]);
  const changes = useOpsLive(() => api.listChangeRequests());
  const log = useOpsLive(() => api.audit());
  const [modal, setModal] = useState<ChangeKind>();
  const [quota, setQuota] = useState<UsageLine>();
  const [reason, setReason] = useState('');
  const [problem, setProblem] = useState<Problem>();
  const [notice, setNotice] = useState<string>();

  if (t === undefined && changes === undefined) return null;
  if (!t)
    return (
      <PageSection>
        <EmptyState titleText="Tenant not found" headingLevel="h1">
          <Button onClick={() => navigate('/tenants')}>Back to tenants</Button>
        </EmptyState>
      </PageSection>
    );

  const mine = (changes ?? []).filter((c) => c.tenantId === t.id);
  const pendingHere = mine.filter((c) => c.status === 'pending');
  const events = (log ?? []).filter((e) => e.target === t.name).slice(0, 8);

  function open(kind: ChangeKind) {
    setProblem(undefined);
    setReason('');
    setQuota({ ...t!.quota });
    setModal(kind);
  }

  async function submit() {
    setProblem(undefined);
    try {
      await api.requestChange(op!, { kind: modal!, tenantId: t!.id, reason, quota: modal === 'quota' ? quota : undefined });
      setNotice(`Request sent for approval. A platform admin other than you must approve it before anything changes.`);
      setModal(undefined);
    } catch (e) {
      if (e instanceof ProblemError) setProblem(e.problem);
      else throw e;
    }
  }

  return (
    <>
      <PageSection>
        <Breadcrumb>
          <BreadcrumbItem>
            <Link to="/tenants">Tenants</Link>
          </BreadcrumbItem>
          <BreadcrumbItem isActive>{t.name}</BreadcrumbItem>
        </Breadcrumb>
        <div className="detail-head">
          <div className="title-row">
            <Title headingLevel="h1" size="2xl">
              {t.name}
            </Title>
            <TenantStatusLabel status={t.status} />
            <KindLabel kind={t.kind} realm={t.realm} />
            <KycLabel kyc={t.kyc} />
          </div>
          <div className="detail-actions">
            {access.canRequest.includes('quota') && t.status !== 'onboarding' && (
              <Button variant="secondary" icon={<PencilAltIcon />} onClick={() => open('quota')}>
                Change quota
              </Button>
            )}
            {access.canRequest.includes('suspend') && t.status === 'active' && (
              <Button variant="secondary" isDanger icon={<BanIcon />} onClick={() => open('suspend')}>
                Suspend
              </Button>
            )}
            {access.canRequest.includes('reactivate') && t.status === 'suspended' && (
              <Button variant="secondary" icon={<CheckCircleIcon />} onClick={() => open('reactivate')}>
                Reactivate
              </Button>
            )}
          </div>
        </div>
        <div className="meta-row">
          <CopyValue value={t.id} label="tenant ID" />
          <span>Joined {fmtDate(t.joinedAt)}</span>
          <span>Primary region {regionName(t.primaryRegion)}</span>
          <span>{t.users} users</span>
        </div>
        <Alert variant="info" isInline isPlain customIcon={<ShieldAltIcon />} title="You see metadata and usage only. Looking inside a tenant's workloads needs a support case with the tenant's consent, recorded in the audit log." />
        {notice && <Alert variant="success" isInline className="para-gap" title={notice} />}
        {pendingHere.length > 0 && (
          <Alert variant="warning" isInline className="para-gap" title={`${pendingHere.length} change${pendingHere.length > 1 ? 's' : ''} awaiting approval`}>
            {pendingHere.map((c) => (
              <div key={c.id}>
                {c.summary} — requested by {c.requestedByName}. <Link to="/approvals">Approvals</Link>
              </div>
            ))}
          </Alert>
        )}
      </PageSection>

      <PageSection className="tight-top">
        <div className="stat-grid stat-grid--2">
          <Card>
            <CardTitle>Account</CardTitle>
            <CardBody>
              <DescriptionList isHorizontal isCompact className="facts">
                <DescriptionListGroup>
                  <DescriptionListTerm>GSTIN</DescriptionListTerm>
                  <DescriptionListDescription className="mono">{t.gstin}</DescriptionListDescription>
                </DescriptionListGroup>
                <DescriptionListGroup>
                  <DescriptionListTerm>Tenant admin</DescriptionListTerm>
                  <DescriptionListDescription>{t.adminEmail}</DescriptionListDescription>
                </DescriptionListGroup>
                <DescriptionListGroup>
                  <DescriptionListTerm>Identity</DescriptionListTerm>
                  <DescriptionListDescription>{t.realm === 'dedicated' ? 'Dedicated Keycloak realm' : 'Organization in the shared realm'}</DescriptionListDescription>
                </DescriptionListGroup>
                <DescriptionListGroup>
                  <DescriptionListTerm>KYC</DescriptionListTerm>
                  <DescriptionListDescription>
                    <KycLabel kyc={t.kyc} /> {t.kyc === 'expired' && <span className="muted small">Re-verification needed under CERT-In Direction (v)</span>}
                  </DescriptionListDescription>
                </DescriptionListGroup>
                <DescriptionListGroup>
                  <DescriptionListTerm>Projects</DescriptionListTerm>
                  <DescriptionListDescription>{t.projects.length}</DescriptionListDescription>
                </DescriptionListGroup>
              </DescriptionList>
            </CardBody>
          </Card>
          <Card>
            <CardTitle>Usage against quota</CardTitle>
            <CardBody className="quota-list">
              {t.status === 'onboarding' ? (
                <Content component="p" className="muted">
                  No usage yet. Quotas are set when onboarding completes.
                </Content>
              ) : (
                <>
                  <Meter label="vCPUs" used={t.usage.vcpu} total={t.quota.vcpu} />
                  <Meter label="RAM" used={t.usage.ramGb} total={t.quota.ramGb} unit="GB" />
                  <Meter label="Block and file storage" used={t.usage.storageGb} total={t.quota.storageGb} unit="GB" />
                  {t.quota.gpus > 0 && <Meter label="GPUs" used={t.usage.gpus} total={t.quota.gpus} />}
                  <div className="muted small">Object storage: {t.objectTb} TB stored (no fixed quota)</div>
                  {t.status === 'suspended' && <div className="muted small">Suspended: compute is shut down; storage is retained and billed.</div>}
                </>
              )}
            </CardBody>
          </Card>
        </div>
      </PageSection>

      {t.projects.length > 0 && (
        <PageSection className="tight-top">
          <Card>
            <CardTitle>Projects</CardTitle>
            <Table aria-label="Projects" variant="compact">
              <Thead>
                <Tr>
                  <Th>Project</Th>
                  <Th>Resources</Th>
                  <Th>vCPUs</Th>
                  <Th>RAM (GB)</Th>
                  <Th>Storage (GB)</Th>
                  <Th>GPUs</Th>
                  {access.seesRevenue && <Th>Monthly run rate</Th>}
                </Tr>
              </Thead>
              <Tbody>
                {t.projects.map((p) => (
                  <Tr key={p.name}>
                    <Td dataLabel="Project">{p.name}</Td>
                    <Td dataLabel="Resources">{p.resources}</Td>
                    <Td dataLabel="vCPUs">{num(p.vcpu)}</Td>
                    <Td dataLabel="RAM (GB)">{num(p.ramGb)}</Td>
                    <Td dataLabel="Storage (GB)">{num(p.storageGb)}</Td>
                    <Td dataLabel="GPUs">{p.gpus || '—'}</Td>
                    {access.seesRevenue && <Td dataLabel="Monthly run rate">{inrShort(p.monthly)}</Td>}
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </Card>
        </PageSection>
      )}

      {access.seesRevenue && t.status !== 'onboarding' && (
        <PageSection className="tight-top">
          <div className="stat-grid stat-grid--2">
            <Card>
              <CardTitle>Spend, last six months</CardTitle>
              <CardBody>
                <TrendBars values={t.history} labels={lastMonths(6)} format={inrShort} label="Monthly spend" />
              </CardBody>
            </Card>
            <Card>
              <CardTitle>Run rate by service</CardTitle>
              <CardBody>
                <ShareBars rows={SERVICES.map((s) => [s, t.byService[s]] as [string, number]).filter(([, v]) => v > 0)} format={inrShort} />
              </CardBody>
            </Card>
          </div>
          <Card className="stack-gap-lg">
            <CardTitle>Invoices</CardTitle>
            <Table aria-label="Invoices" variant="compact">
              <Thead>
                <Tr>
                  <Th>Invoice</Th>
                  <Th>Month</Th>
                  <Th>Amount (excl. GST)</Th>
                  <Th>Status</Th>
                </Tr>
              </Thead>
              <Tbody>
                {t.invoices.map((i) => (
                  <Tr key={i.id}>
                    <Td dataLabel="Invoice" className="mono">
                      {i.id}
                    </Td>
                    <Td dataLabel="Month">{i.month}</Td>
                    <Td dataLabel="Amount">{inrShort(i.amount)}</Td>
                    <Td dataLabel="Status">
                      <Label isCompact color={i.status === 'paid' ? 'green' : i.status === 'due' ? 'blue' : 'red'}>
                        {i.status.charAt(0).toUpperCase() + i.status.slice(1)}
                      </Label>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </Card>
        </PageSection>
      )}

      <PageSection className="tight-top">
        <div className="stat-grid stat-grid--2">
          <Card>
            <CardTitle>Change requests</CardTitle>
            <CardBody>
              {mine.length === 0 ? (
                <Content component="p" className="muted">
                  None.
                </Content>
              ) : (
                <ul className="plain-list">
                  {mine.map((c) => (
                    <li key={c.id}>
                      <div>
                        <strong>{c.summary}</strong>
                        <div className="muted small">
                          {c.requestedByName}, {fmtTime(c.requestedAt)}
                          {c.decidedBy ? ` · decided by ${c.decidedBy}` : ''}
                        </div>
                      </div>
                      <ChangeStatusLabel status={c.status} />
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
          <Card>
            <CardTitle>Recent audit events</CardTitle>
            <CardBody>
              {events.length === 0 ? (
                <Content component="p" className="muted">
                  None.
                </Content>
              ) : (
                <ul className="plain-list">
                  {events.map((e) => (
                    <li key={e.seq}>
                      <div>
                        <strong>{e.action}</strong> by {e.actor}
                        <div className="muted small">{fmtTime(e.at)}</div>
                      </div>
                      <code className="id-chip">#{e.seq}</code>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
      </PageSection>

      <Modal isOpen={!!modal} onClose={() => setModal(undefined)} variant="small" aria-labelledby="chg-title">
        <ModalHeader
          title={modal === 'quota' ? `Change quota for ${t.name}` : modal === 'suspend' ? `Suspend ${t.name}?` : `Reactivate ${t.name}?`}
          titleIconVariant={modal === 'suspend' ? 'warning' : undefined}
          labelId="chg-title"
          description="This creates a request. A platform admin other than you must approve it."
        />
        <ModalBody>
          {problem && (
            <Alert variant="danger" isInline title={problem.title} className="stack-gap">
              {problem.detail}
            </Alert>
          )}
          {modal === 'suspend' && (
            <Content component="p" className="stack-gap">
              Compute is shut down and sign-in is limited to billing. Data is retained and storage is still billed. Use for non-payment, KYC lapse or abuse.
            </Content>
          )}
          <Form
            id="chg-form"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            {modal === 'quota' &&
              quota &&
              QUOTA_FIELDS.map(([k, label]) => (
                <FormGroup key={k} label={label} fieldId={`q-${k}`}>
                  <TextInput id={`q-${k}`} type="number" value={quota[k]} onChange={(_e, v) => setQuota({ ...quota, [k]: Number(v) })} />
                  <div className="muted small">
                    In use: {num(t.usage[k])} · current limit {num(t.quota[k])}
                  </div>
                </FormGroup>
              ))}
            <FormGroup label="Reason" fieldId="chg-reason" isRequired>
              <TextArea id="chg-reason" value={reason} onChange={(_e, v) => setReason(v)} rows={3} placeholder="Recorded in the audit log" />
            </FormGroup>
          </Form>
        </ModalBody>
        <ModalFooter>
          <Button variant={modal === 'suspend' ? 'danger' : 'primary'} type="submit" form="chg-form" isDisabled={!reason.trim()}>
            Submit for approval
          </Button>
          <Button variant="link" onClick={() => setModal(undefined)}>
            Cancel
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
}
