/** Database "Replicas" tab: endpoints, instances by role, and changing the number of read replicas. */
import {
  Alert,
  AlertActionCloseButton,
  Button,
  Card,
  CardBody,
  CardTitle,
  Content,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  Label,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  NumberInput,
} from '@patternfly/react-core';
import { PlusCircleIcon } from '@patternfly/react-icons';
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import { useState } from 'react';
import { MAX_READ_REPLICAS, READ_REPLICA_APPROVAL_ABOVE, dbInstances, dbTopologyText, inr, monthlyPrice } from '../api/catalog';
import { ProblemError, type Problem, type Resource } from '../api/types';
import { CopyValue } from '../components/ui';
import { hash, rng } from '../observability/data';
import { newIdempotencyKey, useSession } from '../session';

const ZONES = ['zone-a', 'zone-b', 'zone-c'];

export interface DbInstance {
  name: string;
  role: 'Primary' | 'Standby' | 'Read replica';
  zone: string;
  replication: string;
  lagMs?: number;
  serves: string;
}

/** Instances of a database by role (CloudNativePG-style names: <db>-1, <db>-2, ...). */
export function dbInstanceList(r: Pick<Resource, 'id' | 'name' | 'spec'>): DbInstance[] {
  const i = dbInstances(r.spec);
  const out: DbInstance[] = [{ name: `${r.name}-1`, role: 'Primary', zone: ZONES[0]!, replication: '—', serves: 'Reads and writes' }];
  for (let k = 0; k < i.standbys; k++)
    out.push({ name: `${r.name}-${out.length + 1}`, role: 'Standby', zone: ZONES[(k + 1) % 3]!, replication: 'Synchronous', lagMs: 0, serves: 'Reads; takes over on failover' });
  for (let k = 0; k < i.readReplicas; k++) {
    const rand = rng(hash(`${r.id}-rr-${k}`) ^ Math.floor(Date.now() / 60_000));
    out.push({ name: `${r.name}-${out.length + 1}`, role: 'Read replica', zone: ZONES[(k + i.standbys + 1) % 3]!, replication: 'Asynchronous', lagMs: Math.round(4 + rand() * 40), serves: 'Reads only' });
  }
  return out;
}

const ROLE_COLOUR = { Primary: 'blue', Standby: 'teal', 'Read replica': 'purple' } as const;

export function DbReplicas({ r }: { r: Resource }) {
  const { api, user } = useSession();
  const current = dbInstances(r.spec).readReplicas;
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState(current);
  const [problem, setProblem] = useState<Problem>();
  const [done, setDone] = useState<string>();
  const [busy, setBusy] = useState(false);
  const live = r.status === 'active';
  const instances = dbInstanceList(r);

  const next = { ...r.spec, readReplicas: target };
  const delta = (monthlyPrice(r.catalogItemId, next) ?? 0) - (monthlyPrice(r.catalogItemId, r.spec) ?? 0);
  const approval = target > READ_REPLICA_APPROVAL_ABOVE && target > current;
  const clamp = (n: number) => Math.min(MAX_READ_REPLICAS, Math.max(0, Math.floor(n) || 0));

  async function submit() {
    setBusy(true);
    setProblem(undefined);
    try {
      const op = await api.setReadReplicas(user!, r.id, target, newIdempotencyKey());
      setDone(op.status === 'awaiting_approval' ? `Request to go from ${current} to ${target} read replicas sent for approval.` : `Changing ${r.name} from ${current} to ${target} read replicas.`);
      setOpen(false);
    } catch (e) {
      if (e instanceof ProblemError) setProblem(e.problem);
      else throw e;
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {done && <Alert variant="info" isInline className="stack-gap" title={done} actionClose={<AlertActionCloseButton onClose={() => setDone(undefined)} />} />}
      <div className="stat-grid stat-grid--2 stack-gap">
        <Card isFullHeight>
          <CardTitle className="eyebrow">Read-write endpoint</CardTitle>
          <CardBody>
            {r.endpoint ? <CopyValue value={r.endpoint} label="read-write endpoint" /> : '—'}
            <Content component="small" className="muted para-gap">
              Always points to the primary, including after a failover. Send all writes here.
            </Content>
          </CardBody>
        </Card>
        <Card isFullHeight>
          <CardTitle className="eyebrow">Read-only endpoint</CardTitle>
          <CardBody>
            {r.readEndpoint ? <CopyValue value={r.readEndpoint} label="read-only endpoint" /> : <span className="muted">None: a standalone database has no copies to read from.</span>}
            <Content component="small" className="muted para-gap">
              {r.readEndpoint
                ? `Spreads read queries across ${instances.length - 1} cop${instances.length - 1 === 1 ? 'y' : 'ies'} (standbys and read replicas). Point reports and dashboards here.`
                : 'Add a read replica to get a read-only endpoint.'}
            </Content>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardTitle>
          <div className="card-title-row">
            <span>
              Instances <span className="muted small">· {dbTopologyText(r.spec)}</span>
            </span>
            <Button
              variant="secondary"
              icon={<PlusCircleIcon />}
              isDisabled={!live || !!r.pending}
              onClick={() => {
                setTarget(current);
                setProblem(undefined);
                setOpen(true);
              }}
            >
              Change read replicas
            </Button>
          </div>
        </CardTitle>
        <Table aria-label="Database instances" variant="compact">
          <Thead>
            <Tr>
              <Th>Instance</Th>
              <Th>Role</Th>
              <Th>Zone</Th>
              <Th>Replication</Th>
              <Th>Lag</Th>
              <Th>Serves</Th>
            </Tr>
          </Thead>
          <Tbody>
            {instances.map((i) => (
              <Tr key={i.name}>
                <Td dataLabel="Instance" className="mono">
                  {i.name}
                </Td>
                <Td dataLabel="Role">
                  <Label color={ROLE_COLOUR[i.role]} isCompact>
                    {i.role}
                  </Label>
                </Td>
                <Td dataLabel="Zone">{i.zone}</Td>
                <Td dataLabel="Replication">{i.replication}</Td>
                <Td dataLabel="Lag">{i.lagMs === undefined ? '—' : live ? `${i.lagMs} ms` : '—'}</Td>
                <Td dataLabel="Serves">{i.serves}</Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
        <CardBody>
          <Content component="small" className="muted">
            Standbys are synchronous: a committed write is on a standby before the primary confirms it, so failover loses no data. Read replicas are asynchronous and never promoted, so
            heavy reporting cannot slow down writes or failover. Up to {READ_REPLICA_APPROVAL_ABOVE} read replicas without approval, {MAX_READ_REPLICAS} at most.
          </Content>
        </CardBody>
      </Card>

      <Modal isOpen={open} onClose={() => setOpen(false)} variant="small" aria-labelledby="rr-title">
        <ModalHeader title={`Read replicas for ${r.name}`} labelId="rr-title" />
        <ModalBody>
          {problem && (
            <Alert variant="danger" isInline title={problem.title} className="stack-gap">
              {problem.detail}
            </Alert>
          )}
          <div className="rr-row">
            <NumberInput
              value={target}
              min={0}
              max={MAX_READ_REPLICAS}
              onMinus={() => setTarget((t) => clamp(t - 1))}
              onPlus={() => setTarget((t) => clamp(t + 1))}
              onChange={(e) => setTarget(clamp(Number((e.target as HTMLInputElement).value)))}
              inputName="read-replicas"
              inputAriaLabel="Read replicas"
              minusBtnAriaLabel="Fewer read replicas"
              plusBtnAriaLabel="More read replicas"
            />
            <span className="muted">currently {current}</span>
          </div>
          <DescriptionList isHorizontal isCompact className="facts para-gap">
            <DescriptionListGroup>
              <DescriptionListTerm>After the change</DescriptionListTerm>
              <DescriptionListDescription>{dbTopologyText(next)}</DescriptionListDescription>
            </DescriptionListGroup>
            <DescriptionListGroup>
              <DescriptionListTerm>Monthly estimate</DescriptionListTerm>
              <DescriptionListDescription>
                {target === current ? 'No change' : `${delta > 0 ? '+' : '−'}${inr(Math.abs(delta))} per month`}
                <span className="muted small"> · {inr(monthlyPrice(r.catalogItemId, next) ?? 0)} in total, excluding GST</span>
              </DescriptionListDescription>
            </DescriptionListGroup>
          </DescriptionList>
          {target > current && (
            <Content component="p" className="small muted para-gap">
              New replicas copy the data from the latest backup, then catch up from the primary; they join the read-only endpoint once in sync. Quota for{' '}
              {target - current} instance{target - current > 1 ? 's' : ''} is reserved now.
            </Content>
          )}
          {target < current && (
            <Content component="p" className="small muted para-gap">
              Replicas are drained of connections before removal. Clients on the read-only endpoint reconnect to the remaining copies.
            </Content>
          )}
          {approval && (
            <Alert variant="warning" isInline isPlain title="Needs approval" className="para-gap">
              More than {READ_REPLICA_APPROVAL_ABOVE} read replicas needs an organisation admin other than you to approve.
            </Alert>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="primary" onClick={submit} isDisabled={target === current || busy} isLoading={busy}>
            {approval ? 'Submit for approval' : target > current ? `Add ${target - current} read replica${target - current > 1 ? 's' : ''}` : target < current ? `Remove ${current - target}` : 'Apply'}
          </Button>
          <Button variant="link" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
}
