import { Alert, AlertActionCloseButton, Button, Card, Content, PageSection, Switch, Title, Tooltip } from '@patternfly/react-core';
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ProblemError, type Problem } from '@/shared/api/types';
import { ChangeStatusLabel, fmtTime } from '../components/OpsComponents';
import { useOps, useOpsLive } from '../session';

const KIND = { quota: 'Quota change', suspend: 'Suspend', reactivate: 'Reactivate', onboard: 'Onboard' };

export function Approvals() {
  const { api, op, access } = useOps();
  const changes = useOpsLive(() => api.listChangeRequests());
  const [problem, setProblem] = useState<Problem>();
  const [all, setAll] = useState(true);
  const rows = (changes ?? []).filter((c) => all || c.status === 'pending').sort((a, b) => Number(b.status === 'pending') - Number(a.status === 'pending'));

  async function decide(id: string, approve: boolean) {
    setProblem(undefined);
    try {
      await api.decideChange(op!, id, approve);
    } catch (e) {
      if (e instanceof ProblemError) setProblem(e.problem);
      else throw e;
    }
  }

  return (
    <>
      <PageSection>
        <Title headingLevel="h1" size="2xl">
          Approvals
        </Title>
        <Content component="p" className="muted">
          Four-eyes rule: every quota change, suspension, reactivation and onboarding is approved by a platform admin other than the requester.
          {access.canApprove ? ' You can approve requests made by others.' : ' Your requests wait here for a platform admin.'}
        </Content>
      </PageSection>
      <PageSection className="tight-top">
        {problem && (
          <Alert variant="danger" isInline title={problem.title} className="stack-gap" actionClose={<AlertActionCloseButton onClose={() => setProblem(undefined)} />}>
            {problem.detail}
          </Alert>
        )}
        <Switch id="show-decided" label="Include decided requests" isChecked={all} onChange={(_e, c) => setAll(c)} className="stack-gap" />
        <Card className="table-card">
          <Table aria-label="Change requests">
            <Thead>
              <Tr>
                <Th>Requested</Th>
                <Th>Change</Th>
                <Th>Tenant</Th>
                <Th>Detail and reason</Th>
                <Th>Requested by</Th>
                <Th>Status</Th>
                <Th screenReaderText="Decision" />
              </Tr>
            </Thead>
            <Tbody>
              {rows.map((c) => {
                const own = c.requestedBy === op?.id;
                return (
                  <Tr key={c.id}>
                    <Td dataLabel="Requested">{fmtTime(c.requestedAt)}</Td>
                    <Td dataLabel="Change">
                      <strong className={c.kind === 'suspend' ? 'text-danger' : ''}>{KIND[c.kind]}</strong>
                    </Td>
                    <Td dataLabel="Tenant">{c.tenantId ? <Link to={`/tenants/${c.tenantId}`}>{c.tenantName}</Link> : c.tenantName}</Td>
                    <Td dataLabel="Detail and reason">
                      {c.summary}
                      <div className="muted small">{c.reason}</div>
                    </Td>
                    <Td dataLabel="Requested by">{c.requestedByName}</Td>
                    <Td dataLabel="Status">
                      <ChangeStatusLabel status={c.status} />
                      {c.decidedBy && <div className="muted small">by {c.decidedBy}</div>}
                    </Td>
                    <Td dataLabel="Decision">
                      {c.status === 'pending' && access.canApprove && (
                        <div className="nowrap">
                          {own ? (
                            <Tooltip content="You made this request, so another platform admin must decide it.">
                              <Button size="sm" isAriaDisabled>
                                Approve
                              </Button>
                            </Tooltip>
                          ) : (
                            <Button size="sm" variant={c.kind === 'suspend' ? 'danger' : 'primary'} onClick={() => void decide(c.id, true)}>
                              Approve
                            </Button>
                          )}{' '}
                          <Button size="sm" variant="secondary" isDisabled={own} onClick={() => void decide(c.id, false)}>
                            Reject
                          </Button>
                        </div>
                      )}
                    </Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>
        </Card>
      </PageSection>
    </>
  );
}
