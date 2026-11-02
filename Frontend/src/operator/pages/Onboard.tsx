import { ActionGroup, Alert, Button, Card, CardBody, CardTitle, Content, Form, FormGroup, FormHelperText, HelperText, HelperTextItem, PageSection, TextArea, TextInput, Title } from '@patternfly/react-core';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { REGIONS } from '../../api/catalog';
import { ProblemError, type Problem, type RegionId } from '../../api/types';
import { ChoiceCards } from '../../components/SchemaForm';
import type { TenantKind } from '../api/types';
import { useOps } from '../session';

export function Onboard() {
  const { api, op } = useOps();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<TenantKind>('commercial');
  const [realm, setRealm] = useState<'shared' | 'dedicated'>('shared');
  const [gstin, setGstin] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [region, setRegion] = useState<RegionId>('in-west');
  const [reason, setReason] = useState('');
  const [problem, setProblem] = useState<Problem>();
  const [busy, setBusy] = useState(false);
  const gstinOk = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin);

  async function submit() {
    setProblem(undefined);
    setBusy(true);
    try {
      await api.requestChange(op!, { kind: 'onboard', reason, onboard: { name: name.trim(), kind, realm, gstin, adminEmail: adminEmail.trim(), region } });
      navigate('/approvals');
    } catch (e) {
      if (e instanceof ProblemError) setProblem(e.problem);
      else throw e;
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageSection>
        <Title headingLevel="h1" size="2xl">
          Onboard a tenant
        </Title>
        <Content component="p" className="muted">
          Assisted onboarding for organisations that sign a contract. Once a platform admin approves, the tenant is created, the tenant admin is invited and KYC starts. Self-service sign-up for commercial customers runs separately in the tenant portal.
        </Content>
      </PageSection>
      <PageSection className="tight-top">
        <Card className="onboard-card">
          <CardTitle>Tenant details</CardTitle>
          <CardBody>
            <Form
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              {problem && (
                <Alert variant="danger" isInline title={problem.title}>
                  {problem.detail}
                </Alert>
              )}
              <FormGroup label="Legal name" fieldId="ob-name" isRequired>
                <TextInput id="ob-name" value={name} onChange={(_e, v) => setName(v)} placeholder="As on the GST registration" />
              </FormGroup>
              <FormGroup label="Type" fieldId="ob-kind" role="radiogroup">
                <ChoiceCards
                  name="Tenant type"
                  value={kind}
                  onChange={(v) => {
                    setKind(v as TenantKind);
                    setRealm(v === 'commercial' ? 'shared' : 'dedicated');
                  }}
                  options={[
                    { value: 'commercial', title: 'Commercial', hint: 'Companies and start-ups' },
                    { value: 'government', title: 'Government', hint: 'Ministries, departments, PSUs' },
                    { value: 'regulated', title: 'Regulated', hint: 'Banks, insurers, healthcare' },
                  ]}
                />
              </FormGroup>
              <FormGroup label="Identity" fieldId="ob-realm" role="radiogroup">
                <ChoiceCards
                  name="Identity realm"
                  value={realm}
                  onChange={(v) => setRealm(v as 'shared' | 'dedicated')}
                  options={[
                    { value: 'shared', title: 'Shared realm', hint: 'Keycloak Organization; standard for commercial' },
                    { value: 'dedicated', title: 'Dedicated realm', hint: 'Hard boundary; standard for government and regulated' },
                  ]}
                />
              </FormGroup>
              <div className="two-col">
                <FormGroup label="GSTIN" fieldId="ob-gstin" isRequired>
                  <TextInput id="ob-gstin" value={gstin} onChange={(_e, v) => setGstin(v.toUpperCase().trim())} validated={gstin && !gstinOk ? 'error' : 'default'} placeholder="27ABCDE1234F1Z5" />
                  <FormHelperText>
                    <HelperText>
                      <HelperTextItem variant={gstin && !gstinOk ? 'error' : 'default'}>{gstin && !gstinOk ? 'A GSTIN has 15 characters, for example 27ABCDE1234F1Z5.' : 'Used for invoices issued by the partner.'}</HelperTextItem>
                    </HelperText>
                  </FormHelperText>
                </FormGroup>
                <FormGroup label="Tenant admin email" fieldId="ob-email" isRequired>
                  <TextInput id="ob-email" type="email" value={adminEmail} onChange={(_e, v) => setAdminEmail(v)} placeholder="cloud-admin@organisation.in" />
                  <FormHelperText>
                    <HelperText>
                      <HelperTextItem>Receives the invitation and becomes the tenant owner.</HelperTextItem>
                    </HelperText>
                  </FormHelperText>
                </FormGroup>
              </div>
              <FormGroup label="Primary region" fieldId="ob-region" role="radiogroup">
                <ChoiceCards name="Primary region" value={region} onChange={(v) => setRegion(v as RegionId)} options={REGIONS.map((r) => ({ value: r.id, title: r.name, hint: r.description }))} />
              </FormGroup>
              <FormGroup label="Reason and reference" fieldId="ob-reason" isRequired>
                <TextArea id="ob-reason" value={reason} onChange={(_e, v) => setReason(v)} rows={3} placeholder="Contract or work-order reference; recorded in the audit log" />
              </FormGroup>
              <ActionGroup>
                <Button type="submit" variant="primary" isLoading={busy} isDisabled={busy || !name.trim() || !gstinOk || !adminEmail.trim() || !reason.trim()}>
                  Submit for approval
                </Button>
                <Button variant="link" onClick={() => navigate('/tenants')}>
                  Cancel
                </Button>
              </ActionGroup>
            </Form>
          </CardBody>
        </Card>
      </PageSection>
    </>
  );
}
