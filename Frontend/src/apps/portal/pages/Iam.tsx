import {
  Alert,
  Button,
  Card,
  CardBody,
  Content,
  Form,
  FormGroup,
  FormSelect,
  FormSelectOption,
  Label,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  PageSection,
  Tab,
  Tabs,
  TabTitleText,
  TextInput,
  Title,
} from '@patternfly/react-core';
import { CheckCircleIcon, ExclamationTriangleIcon, MinusIcon, PlusCircleIcon } from '@patternfly/react-icons';
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import { useState } from 'react';
import { ProblemError, type Problem, type Role } from '@/shared/api/types';
import { roleName } from '../layout/AppLayout';
import { initials } from '@/shared/lib/format';
import { useLive, useSession } from '../session';

const ROLES: { id: Role; scope: string; summary: string; can: boolean[] }[] = [
  { id: 'org-owner', scope: 'Tenant', summary: 'Full control, including the contract and closing the tenant.', can: [true, true, true, true, true, true, true] },
  { id: 'org-admin', scope: 'Tenant', summary: 'Manages users, projects and quotas; approves requests made by others.', can: [true, true, true, true, true, false, true] },
  { id: 'billing-admin', scope: 'Tenant', summary: 'Invoices, payment methods, budgets and cost reports.', can: [true, false, false, false, false, true, false] },
  { id: 'auditor', scope: 'Tenant', summary: 'Read-only access to everything, including the audit log.', can: [true, false, false, false, false, true, true] },
  { id: 'project-admin', scope: 'Project', summary: 'Manages resources and members of the projects assigned.', can: [true, true, false, true, false, false, false] },
  { id: 'project-operator', scope: 'Project', summary: 'Creates and operates resources; requests decommissioning.', can: [true, true, false, true, false, false, false] },
  { id: 'project-reader', scope: 'Project', summary: 'Views resources and metrics; changes nothing.', can: [true, false, false, false, false, false, false] },
];
const PERMS = ['View resources', 'Create and change', 'Approve requests', 'Request decommission or deletion', 'Manage users', 'Billing', 'Audit log'];

const fmt = (iso?: string) => (iso ? new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'Never');

export function Iam() {
  const { api, user, organisation, projects, isAdmin } = useSession();
  const [tab, setTab] = useState<string | number>('users');
  const [invite, setInvite] = useState<{ name: string; email: string; role: Role }>();
  const [problem, setProblem] = useState<Problem>();
  const members = useLive(() => (organisation ? api.listMembers(organisation.id) : Promise.resolve([])), [organisation?.id]);
  const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? id;

  async function send() {
    setProblem(undefined);
    try {
      await api.inviteMember(user!, organisation!.id, invite!);
      setInvite(undefined);
    } catch (e) {
      if (e instanceof ProblemError) setProblem(e.problem);
      else throw e;
    }
  }

  return (
    <>
      <PageSection>
        <div className="page-head">
          <div>
            <Title headingLevel="h1" size="2xl">
              Identity and access
            </Title>
            <Content component="p" className="muted">
              Users and roles for {organisation?.name}. People from your organisation’s identity provider sign in with single sign-on; others use a platform account with multi-factor authentication.
            </Content>
          </div>
          {isAdmin && (
            <Button variant="primary" icon={<PlusCircleIcon />} onClick={() => setInvite({ name: '', email: '', role: 'project-reader' })}>
              Invite user
            </Button>
          )}
        </div>
      </PageSection>
      <PageSection className="tight-top">
        <Tabs activeKey={tab} onSelect={(_e, k) => setTab(k)} aria-label="IAM sections">
          <Tab eventKey="users" title={<TabTitleText>Users ({members?.length ?? 0})</TabTitleText>}>
            <Card className="stack-gap-lg">
              <Table aria-label="Users">
                <Thead>
                  <Tr>
                    <Th>User</Th>
                    <Th>Roles</Th>
                    <Th>Applies to</Th>
                    <Th>Sign-in</Th>
                    <Th>MFA</Th>
                    <Th>Last sign-in</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {members?.map((m) => (
                    <Tr key={m.userId}>
                      <Td dataLabel="User">
                        <div className="user-cell">
                          <span className="initials-avatar initials-avatar--sm" aria-hidden="true">
                            {initials(m.name)}
                          </span>
                          <div>
                            <div>
                              <strong>{m.name}</strong> {m.status === 'invited' && <Label isCompact color="orange">Invited</Label>}
                            </div>
                            <div className="muted small">{m.email}</div>
                          </div>
                        </div>
                      </Td>
                      <Td dataLabel="Roles">
                        {m.roles.map((r) => (
                          <Label key={r} isCompact color={r.startsWith('org') ? 'blue' : r === 'auditor' || r === 'billing-admin' ? 'purple' : 'teal'} className="label-gap">
                            {roleName(r)}
                          </Label>
                        ))}
                      </Td>
                      <Td dataLabel="Applies to">{m.projects.length ? m.projects.map(projectName).join(', ') : 'All projects'}</Td>
                      <Td dataLabel="Sign-in">{m.source === 'federated' ? 'Single sign-on' : 'Platform account'}</Td>
                      <Td dataLabel="MFA">
                        {m.mfa ? (
                          <span className="status-dot status-dot--green">
                            <CheckCircleIcon /> Enabled
                          </span>
                        ) : m.status === 'invited' ? (
                          <span className="muted">
                            <MinusIcon /> Pending
                          </span>
                        ) : (
                          <span className="status-dot status-dot--orange">
                            <ExclamationTriangleIcon /> Not enrolled
                          </span>
                        )}
                      </Td>
                      <Td dataLabel="Last sign-in">{fmt(m.lastSignIn)}</Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </Card>
          </Tab>
          <Tab eventKey="roles" title={<TabTitleText>Roles ({ROLES.length})</TabTitleText>}>
            <Card className="stack-gap-lg">
              <div className="table-scroll">
                <Table aria-label="Roles and permissions" variant="compact">
                  <Thead>
                    <Tr>
                      <Th>Role</Th>
                      <Th>Scope</Th>
                      {PERMS.map((p) => (
                        <Th key={p} textCenter modifier="wrap">
                          {p}
                        </Th>
                      ))}
                    </Tr>
                  </Thead>
                  <Tbody>
                    {ROLES.map((r) => (
                      <Tr key={r.id}>
                        <Td dataLabel="Role">
                          <strong>{roleName(r.id)}</strong>
                          <div className="muted small">{r.summary}</div>
                        </Td>
                        <Td dataLabel="Scope">{r.scope}</Td>
                        {r.can.map((c, i) => (
                          <Td key={i} dataLabel={PERMS[i]} textCenter>
                            {c ? <CheckCircleIcon className="perm-yes" aria-label="Yes" /> : <MinusIcon className="perm-no" aria-label="No" />}
                          </Td>
                        ))}
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </div>
              <CardBody>
                <Content component="small" className="muted">
                  Separation of duties: nobody can approve their own request. Decommissioning and permanent deletion always need approval from a tenant admin other than the requester.
                </Content>
              </CardBody>
            </Card>
          </Tab>
        </Tabs>
      </PageSection>

      <Modal isOpen={!!invite} onClose={() => setInvite(undefined)} variant="small" aria-labelledby="invite-title">
        <ModalHeader title="Invite user" labelId="invite-title" description="They receive an email to set up their account and multi-factor authentication." />
        <ModalBody>
          {problem && (
            <Alert variant="danger" isInline title={problem.title} className="stack-gap">
              {problem.detail}
            </Alert>
          )}
          {invite && (
            <Form
              id="invite-form"
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
            >
              <FormGroup label="Full name" fieldId="inv-name" isRequired>
                <TextInput id="inv-name" value={invite.name} onChange={(_e, v) => setInvite({ ...invite, name: v })} />
              </FormGroup>
              <FormGroup label="Email" fieldId="inv-email" isRequired>
                <TextInput id="inv-email" type="email" value={invite.email} onChange={(_e, v) => setInvite({ ...invite, email: v })} />
              </FormGroup>
              <FormGroup label="Role" fieldId="inv-role">
                <FormSelect id="inv-role" value={invite.role} onChange={(_e, v) => setInvite({ ...invite, role: v as Role })}>
                  {ROLES.filter((r) => r.id !== 'org-owner').map((r) => (
                    <FormSelectOption key={r.id} value={r.id} label={`${roleName(r.id)} — ${r.scope.toLowerCase()}`} />
                  ))}
                </FormSelect>
              </FormGroup>
            </Form>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="primary" type="submit" form="invite-form" isDisabled={!invite?.name.trim() || !/^\S+@\S+\.\S+$/.test(invite?.email ?? '')}>
            Send invitation
          </Button>
          <Button variant="link" onClick={() => setInvite(undefined)}>
            Cancel
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
}
