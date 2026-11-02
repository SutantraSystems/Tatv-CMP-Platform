import { Alert, AlertActionCloseButton, Button, Card, Content, PageSection, Switch, Title, Tooltip } from '@patternfly/react-core';
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ProblemError, type Problem } from '../api/types';
import { ACTION_LABELS } from '../components/ResourceList';
import { StatusLabel } from '../components/Status';
import { useLive, useSession } from '../session';

export function Activity() {
  const { t } = useTranslation();
  const { api, user, project, isAdmin } = useSession();
  const [problem, setProblem] = useState<Problem>();
  const [onlyPending, setOnlyPending] = useState(false);
  const ops = useLive(() => (project ? api.listOperations(project.id) : Promise.resolve([])), [project?.id]);
  const users = useLive(() => api.listUsers(), []);
  const who = (id: string) => users?.find((u) => u.id === id)?.name ?? id;
  const rows = (ops ?? []).filter((o) => !onlyPending || o.status === 'awaiting_approval');

  async function decide(id: string, approve: boolean) {
    setProblem(undefined);
    try {
      await api.decide(user!, id, approve);
    } catch (e) {
      if (e instanceof ProblemError) setProblem(e.problem);
      else throw e;
    }
  }

  return (
    <>
      <PageSection>
        <Title headingLevel="h1" size="2xl">
          {t('nav.activity')}
        </Title>
        <Content component="p" className="muted">
          Every request is an operation with its own status and audit record.{' '}
          {isAdmin
            ? 'As a tenant admin you approve requests made by others: large and GPU sizes, decommissioning and permanent deletion.'
            : 'Large and GPU sizes, decommissioning and permanent deletion wait here for a tenant admin to approve.'}
        </Content>
      </PageSection>
      <PageSection className="tight-top">
        {problem && (
          <Alert variant="danger" isInline title={problem.title} className="stack-gap" actionClose={<AlertActionCloseButton onClose={() => setProblem(undefined)} />}>
            {problem.detail}
          </Alert>
        )}
        <Switch id="only-pending" label="Only requests awaiting approval" isChecked={onlyPending} onChange={(_e, c) => setOnlyPending(c)} className="stack-gap" />
        <Card>
          <Table aria-label="Operations">
            <Thead>
              <Tr>
                <Th>Requested</Th>
                <Th>Resource</Th>
                <Th>Action</Th>
                <Th>Requested by</Th>
                <Th>Status</Th>
                <Th>Detail</Th>
                <Th screenReaderText="Decision" />
              </Tr>
            </Thead>
            <Tbody>
              {rows.map((o) => {
                const own = o.requestedBy === user?.id;
                const danger = o.action === 'purge' || o.action === 'decommission';
                return (
                  <Tr key={o.id}>
                    <Td dataLabel="Requested">{new Date(o.requestedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</Td>
                    <Td dataLabel="Resource">
                      <Link to={`/r/${o.resourceId}`}>{o.resourceName}</Link>
                    </Td>
                    <Td dataLabel="Action">
                      <span className={danger ? 'text-danger' : ''}>{o.action === 'create' ? 'Create' : ACTION_LABELS[o.action]}</span>
                    </Td>
                    <Td dataLabel="Requested by">{who(o.requestedBy)}</Td>
                    <Td dataLabel="Status">
                      <StatusLabel status={o.status} />
                    </Td>
                    <Td dataLabel="Detail">
                      {o.message ?? ''}
                      {o.approvedBy && o.status !== 'rejected' && o.status !== 'awaiting_approval' ? ` Approved by ${o.approvedBy}.` : ''}
                    </Td>
                    <Td dataLabel="Decision">
                      {o.status === 'awaiting_approval' && isAdmin && (
                        <div className="nowrap">
                          {own ? (
                            <Tooltip content="You made this request, so another admin must decide it.">
                              <Button size="sm" variant="primary" isAriaDisabled>
                                Approve
                              </Button>
                            </Tooltip>
                          ) : (
                            <Button size="sm" variant={danger ? 'danger' : 'primary'} onClick={() => void decide(o.id, true)}>
                              Approve
                            </Button>
                          )}{' '}
                          <Button size="sm" variant="secondary" isDisabled={own} onClick={() => void decide(o.id, false)}>
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
