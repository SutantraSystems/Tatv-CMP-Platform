import { Label } from '@patternfly/react-core';
import { useTranslation } from 'react-i18next';
import { describe } from '../api/catalog';
import { ResourceList } from '../components/ResourceList';
import { CopyEndpoint } from '../components/ui';
import { DbSummary } from './listSummaries';

export function Databases() {
  const { t } = useTranslation();
  return (
    <ResourceList
      kind="db"
      title={t('nav.databases')}
      intro="Managed PostgreSQL with automated backups and point-in-time restore. Credentials are issued as short-lived secrets, never shown twice."
      emptyText="No databases yet"
      createItemId="pg"
      createLabel="Create database"
      shutdownNote="All instances are stopped and connections are refused. Data and backups are kept. Compute billing stops; storage and backups are still billed."
      summary={(rows) => <DbSummary rows={rows} />}
      columns={[
        { title: 'Engine', render: (r) => `PostgreSQL ${String(r.spec.version)}` },
        { title: 'Size', render: (r) => describe(r.catalogItemId, r.spec) },
        { title: 'Encryption', render: (r) => (r.spec.encrypted ? <Label color="purple" isCompact>Customer key</Label> : 'Platform key') },
        { title: 'Endpoint', render: (r) => (r.endpoint ? <CopyEndpoint value={r.endpoint} /> : '—') },
      ]}
    />
  );
}
