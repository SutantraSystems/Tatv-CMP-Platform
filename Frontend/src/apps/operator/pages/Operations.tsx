import { Alert, AlertActionCloseButton, Button, Card, CardBody, CardTitle, Content, Label, PageSection, Title } from '@patternfly/react-core';
import { RedoIcon } from '@patternfly/react-icons';
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ProblemError, type Problem } from '@/shared/api/types';
import { HealthDot, fmtTime } from '../components/OpsComponents';
import { useOps, useOpsLive } from '../session';

const WF_COLOUR = { failed: 'red', stuck: 'orange', retrying: 'blue', resolved: 'green' } as const;

export function Operations() {
  const { api, op, access } = useOps();
  const health = useOpsLive(() => api.health());
  const workflows = useOpsLive(() => api.listFailedWorkflows());
  const tenants = useOpsLive(() => api.listTenants());
  const [problem, setProblem] = useState<Problem>();
  const groups = ['Control plane', 'India-West', 'India-South'] as const;
  const idOf = (name: string) => tenants?.find((t) => t.name === name)?.id;

  async function retry(id: string) {
    setProblem(undefined);
    try {
      await api.retryWorkflow(op!, id);
    } catch (e) {
      if (e instanceof ProblemError) setProblem(e.problem);
      else throw e;
    }
  }

  return (
    <>
      <PageSection>
        <Title headingLevel="h1" size="2xl">
          Operations
        </Title>
        <Content component="p" className="muted">
          Service health by region and requests that need an engineer. SLA this month: <strong>99.97%</strong> measured (target 99.95%).
        </Content>
      </PageSection>
      <PageSection className="tight-top">
        <div className="dash-grid">
          {groups.map((g) => (
            <Card key={g}>
              <CardTitle>{g}</CardTitle>
              <CardBody>
                <ul className="plain-list">
                  {health
                    ?.filter((h) => h.group === g)
                    .map((h) => (
                      <li key={h.name}>
                        <div>
                          {h.name}
                          {h.note && <div className="muted small">{h.note}</div>}
                        </div>
                        <HealthDot status={h.status} />
                      </li>
                    ))}
                </ul>
              </CardBody>
            </Card>
          ))}
        </div>
      </PageSection>
      <PageSection className="tight-top">
        {problem && (
          <Alert variant="danger" isInline title={problem.title} className="stack-gap" actionClose={<AlertActionCloseButton onClose={() => setProblem(undefined)} />}>
            {problem.detail}
          </Alert>
        )}
        <Card>
          <CardTitle>Failed and stuck workflows</CardTitle>
          <Table aria-label="Failed and stuck workflows">
            <Thead>
              <Tr>
                <Th>Started</Th>
                <Th>Tenant</Th>
                <Th>Request</Th>
                <Th>Error</Th>
                <Th>Attempts</Th>
                <Th>Status</Th>
                <Th screenReaderText="Action" />
              </Tr>
            </Thead>
            <Tbody>
              {workflows?.map((w) => (
                <Tr key={w.id}>
                  <Td dataLabel="Started">{fmtTime(w.startedAt)}</Td>
                  <Td dataLabel="Tenant">{idOf(w.tenantName) ? <Link to={`/tenants/${idOf(w.tenantName)}`}>{w.tenantName}</Link> : w.tenantName}</Td>
                  <Td dataLabel="Request">
                    {w.action}
                    <div className="muted small mono">{w.resource}</div>
                  </Td>
                  <Td dataLabel="Error">{w.error}</Td>
                  <Td dataLabel="Attempts">{w.attempts}</Td>
                  <Td dataLabel="Status">
                    <Label color={WF_COLOUR[w.status]}>{w.status.charAt(0).toUpperCase() + w.status.slice(1)}</Label>
                  </Td>
                  <Td dataLabel="Action">
                    {access.canRetry && (w.status === 'failed' || w.status === 'stuck') && (
                      <Button size="sm" variant="secondary" icon={<RedoIcon />} onClick={() => void retry(w.id)}>
                        Retry
                      </Button>
                    )}
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </Card>
      </PageSection>
    </>
  );
}
