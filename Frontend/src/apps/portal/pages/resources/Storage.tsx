import { Label } from '@patternfly/react-core';
import { useTranslation } from 'react-i18next';
import { describe } from '@/shared/catalog/catalog';
import { ResourceList } from '../../components/ResourceList';
import { CopyEndpoint } from '@/shared/ui/ui';
import { StorageSummary } from './listSummaries';

const TYPE: Record<string, [string, 'blue' | 'teal' | 'purple']> = { block: ['Block', 'blue'], file: ['File', 'teal'], object: ['Object', 'purple'] };

export function Storage() {
  const { t } = useTranslation();
  return (
    <ResourceList
      kind="storage"
      title={t('nav.storage')}
      intro="Block volumes, file shares and object storage buckets in your project."
      emptyText="No storage yet"
      createItemId="block"
      createLabel="Create storage"
      createOptions={[
        { itemId: 'block', label: 'Block volume' },
        { itemId: 'file', label: 'File share' },
        { itemId: 'object', label: 'Object storage bucket' },
      ]}
      searchHint="Filter by name, ID or endpoint; type key:value for a tag"
      shutdownNote=""
      summary={(rows) => <StorageSummary rows={rows} />}
      columns={[
        { title: 'Type', render: (r) => { const [l, c] = TYPE[r.catalogItemId] ?? ['—', 'blue']; return <Label color={c} isCompact>{l}</Label>; } },
        { title: 'Size and settings', render: (r) => describe(r.catalogItemId, r.spec) },
        { title: 'Endpoint', render: (r) => (r.endpoint ? <CopyEndpoint value={r.endpoint} /> : <span className="muted small">Not attached</span>) },
      ]}
    />
  );
}
