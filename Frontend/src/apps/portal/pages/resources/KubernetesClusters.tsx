import { useTranslation } from 'react-i18next';
import { describe } from '@/shared/catalog/catalog';
import { ResourceList } from '../../components/ResourceList';
import { CopyEndpoint } from '@/shared/ui/ui';
import { K8sSummary } from './listSummaries';

export function KubernetesClusters() {
  const { t } = useTranslation();
  return (
    <ResourceList
      kind="k8s"
      title={t('nav.k8s')}
      intro="CNCF-conformant clusters in your project. Sign in to a cluster with your own identity; no static credentials are issued."
      emptyText="No Kubernetes clusters yet"
      createItemId="k8s"
      createLabel="Create cluster"
      shutdownNote="Worker nodes are scaled to zero and workloads stop running. The control plane and persistent volumes are kept, so starting it again restores the cluster as it was. Compute billing stops; storage is still billed."
      summary={(rows) => <K8sSummary rows={rows} />}
      columns={[
        { title: 'Version', render: (r) => `Kubernetes ${String(r.spec.version)}` },
        { title: 'Nodes', render: (r) => describe(r.catalogItemId, r.spec) },
        { title: 'API endpoint', render: (r) => (r.endpoint ? <CopyEndpoint value={r.endpoint} /> : '—') },
      ]}
    />
  );
}
