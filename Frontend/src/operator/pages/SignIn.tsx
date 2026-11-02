import { ActionGroup, Alert, Button, Form, FormGroup, FormSelect, FormSelectOption, LoginPage } from '@patternfly/react-core';
import { useEffect, useState } from 'react';
import { ROLE_NAMES, type Operator } from '../api/types';
import { useOps } from '../session';

export function OpsSignIn() {
  const { api, signIn } = useOps();
  const [ops, setOps] = useState<Operator[]>([]);
  const [id, setId] = useState('op-vikram');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void api.listOperators().then(setOps);
  }, [api]);
  return (
    <LoginPage
      className="ops-login"
      loginTitle="Tatv Cloud Operations"
      loginSubtitle="Internal console. Reached only from the management network through privileged access management. Prototype: choose a demo operator."
      textContent="Operator sign-in uses a separate identity provider from the tenant portal. Every session and action is recorded."
    >
      <Form
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          void signIn(id).finally(() => setBusy(false));
        }}
      >
        <FormGroup label="Demo operator" fieldId="demo-operator">
          <FormSelect id="demo-operator" value={id} onChange={(_e, v) => setId(v)}>
            {ops.map((o) => (
              <FormSelectOption key={o.id} value={o.id} label={`${o.name} — ${ROLE_NAMES[o.role]}`} />
            ))}
          </FormSelect>
        </FormGroup>
        <Alert variant="info" isInline isPlain title="Try Priya to request a quota change, then Vikram or Anita to approve it. Rahul is the partner's business admin." />
        <ActionGroup>
          <Button type="submit" variant="primary" isBlock isLoading={busy} isDisabled={busy}>
            Sign in
          </Button>
        </ActionGroup>
      </Form>
    </LoginPage>
  );
}
