import { Alert, Card, Content, PageSection, SearchInput, Title } from '@patternfly/react-core';
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import { useState } from 'react';
import { verifyChain } from '@/mocks/operatorApi';
import { fmtTime } from '../components/OpsComponents';
import { useOps, useOpsLive } from '../session';

export function Audit() {
  const { api } = useOps();
  const log = useOpsLive(() => api.audit());
  const [q, setQ] = useState('');
  if (!log) return null;
  const ok = verifyChain(log);
  const rows = log.filter((e) => !q || `${e.actor} ${e.action} ${e.target} ${e.detail}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <PageSection>
        <Title headingLevel="h1" size="2xl">
          Audit log
        </Title>
        <Content component="p" className="muted">
          Append-only record of every operator action. Each entry carries the hash of the one before it; in production the chain is signed in the HSM, so any edit or deletion is detectable.
        </Content>
      </PageSection>
      <PageSection className="tight-top">
        <Alert
          variant={ok ? 'success' : 'danger'}
          isInline
          className="stack-gap"
          title={ok ? `Chain verified: ${log.length} entries, no gaps or edits.` : 'Chain verification failed — investigate immediately.'}
        />
        <SearchInput className="stack-gap filter-search-wide" placeholder="Filter by operator, action, tenant or detail" aria-label="Filter audit log" value={q} onChange={(_e, v) => setQ(v)} onClear={() => setQ('')} />
        <Card className="table-card">
          <Table aria-label="Audit log" variant="compact">
            <Thead>
              <Tr>
                <Th>#</Th>
                <Th>Time</Th>
                <Th>Operator</Th>
                <Th>Action</Th>
                <Th>Target</Th>
                <Th>Detail</Th>
                <Th>Hash</Th>
              </Tr>
            </Thead>
            <Tbody>
              {rows.map((e) => (
                <Tr key={e.seq}>
                  <Td dataLabel="#">{e.seq}</Td>
                  <Td dataLabel="Time" className="nowrap">
                    {fmtTime(e.at)}
                  </Td>
                  <Td dataLabel="Operator">{e.actor}</Td>
                  <Td dataLabel="Action">
                    <strong>{e.action}</strong>
                  </Td>
                  <Td dataLabel="Target">{e.target}</Td>
                  <Td dataLabel="Detail">{e.detail}</Td>
                  <Td dataLabel="Hash">
                    <code className="id-chip" title={`${e.hash} (previous ${e.prevHash})`}>
                      {e.hash.slice(0, 10)}…
                    </code>
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
