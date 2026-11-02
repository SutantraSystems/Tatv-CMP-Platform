import { useTranslation } from 'react-i18next';
import { describe, itemOf } from '../api/catalog';
import { ResourceList } from '../components/ResourceList';
import { CopyValue } from '../components/ui';
import { VmSummary } from './listSummaries';

const IMAGES: Record<string, string> = {
  'ubuntu-24.04': 'Ubuntu 24.04 LTS',
  'rhel-9.6': 'RHEL 9.6',
  'rocky-9.6': 'Rocky Linux 9.6',
  'windows-2025': 'Windows Server 2025',
  'windows-2022': 'Windows Server 2022',
};
export const imageName = (id: unknown) => IMAGES[String(id)] ?? String(id);

export function VirtualMachines() {
  const { t } = useTranslation();
  return (
    <ResourceList
      kind="vm"
      title={t('nav.vms')}
      intro="Manage and monitor your virtual machines. Status updates live as requests progress."
      emptyText="No virtual machines yet"
      createItemId="vm-linux"
      createLabel="Create VM"
      shutdownNote="The VM is powered off. Compute billing stops while it is shut down; its disks and any public IP are still billed."
      summary={(rows) => <VmSummary rows={rows} />}
      columns={[
        { title: 'Type and size', render: (r) => <span className="two-line"><span>{describe(r.catalogItemId, r.spec).split(' · ')[0]}</span><span className="muted small">{describe(r.catalogItemId, r.spec).split(' · ').slice(1).join(' · ')}</span></span> },
        { title: 'Image', render: (r) => <span className="two-line"><span>{imageName(r.spec.image)}</span><span className="muted small">{itemOf(r.catalogItemId)?.id === 'vm-windows' ? 'Licence included' : ''}</span></span> },
        {
          title: 'Public and private IP',
          render: (r) =>
            r.addresses ? (
              <span className="two-line">
                {r.addresses.public ? <CopyValue value={r.addresses.public} label="public IP" /> : <span className="muted small">No public IP</span>}
                <span className="muted small mono">{r.addresses.private} (private)</span>
              </span>
            ) : (
              '—'
            ),
        },
      ]}
    />
  );
}
