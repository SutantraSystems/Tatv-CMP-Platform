import { ActionGroup, Alert, Button, Form, FormGroup, FormSelect, FormSelectOption, LoginPage } from '@patternfly/react-core';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BRAND } from '../brand';
import type { User } from '../api/types';
import { useSession } from '../session';

export function SignIn() {
  const { t } = useTranslation();
  const { api, signIn } = useSession();
  const [users, setUsers] = useState<User[]>([]);
  const [userId, setUserId] = useState('u-ravi');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api.listUsers().then(setUsers);
  }, [api]);

  return (
    <LoginPage
      brandImgSrc=""
      loginTitle={t('signIn.title')}
      loginSubtitle={t('signIn.subtitle')}
      textContent={`${BRAND.productName} — ${BRAND.tagline}`}
    >
      <Form
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          void signIn(userId).finally(() => setBusy(false));
        }}
      >
        <FormGroup label="Demo user" fieldId="demo-user">
          <FormSelect id="demo-user" value={userId} onChange={(_e, v) => setUserId(v)}>
            {users.map((u) => (
              <FormSelectOption
                key={u.id}
                value={u.id}
                label={`${u.name} — ${Object.values(u.roles).flat().filter((r, i, a) => a.indexOf(r) === i).join(', ')}`}
              />
            ))}
          </FormSelect>
        </FormGroup>
        <Alert
          variant="info"
          isInline
          isPlain
          title="Try signing in as Ravi to order a large VM, then as Meera to approve it."
        />
        <ActionGroup>
          <Button type="submit" variant="primary" isBlock isLoading={busy} isDisabled={busy}>
            {t('signIn.button')}
          </Button>
        </ActionGroup>
      </Form>
    </LoginPage>
  );
}
