import { CubesIcon, DatabaseIcon, HddIcon, MemoryIcon, MicrochipIcon, RupeeSignIcon, ServerIcon } from '@patternfly/react-icons';
import { DB_SIZES, FLAVOURS, inr } from '@/shared/catalog/catalog';
import type { Resource } from '@/shared/api/types';
import { StatCard, resourceMonthly } from '@/shared/ui/ui';

const cost = (rows: Resource[]) => rows.reduce((n, r) => n + (resourceMonthly(r) ?? 0), 0);
const costCard = (rows: Resource[]) => {
  const m = cost(rows);
  return <StatCard label="Estimated cost" value={`${inr(m)}/mo`} sub={`≈ ${inr(m / 730, true)}/hr · indicative`} icon={<RupeeSignIcon />} tone="green" />;
};

export function VmSummary({ rows }: { rows: Resource[] }) {
  const live = rows.filter((r) => r.status !== 'awaiting_approval');
  const f = (r: Resource) => FLAVOURS[String(r.spec.flavour)];
  const vcpu = live.reduce((n, r) => n + (f(r)?.vcpu ?? 0), 0);
  const ram = live.reduce((n, r) => n + (f(r)?.ramGb ?? 0), 0);
  return (
    <div className="stat-grid stat-grid--4">
      <StatCard
        label="Total instances"
        value={live.length}
        sub={`${live.filter((r) => r.status === 'active').length} running · ${live.filter((r) => r.status === 'stopped').length} shut down`}
        icon={<ServerIcon />}
      />
      <StatCard label="Total vCPUs" value={vcpu} sub="Allocated compute" icon={<MicrochipIcon />} />
      <StatCard label="Memory" value={`${ram} GB`} sub="Allocated RAM" icon={<MemoryIcon />} tone="violet" />
      {costCard(live)}
    </div>
  );
}

export function K8sSummary({ rows }: { rows: Resource[] }) {
  const live = rows.filter((r) => r.status !== 'awaiting_approval');
  const workers = live.reduce((n, r) => n + Number(r.spec.workerCount ?? 0), 0);
  const gpus = live.reduce((n, r) => n + (FLAVOURS[String(r.spec.workerFlavour)]?.gpus ?? 0) * Number(r.spec.workerCount ?? 0), 0);
  return (
    <div className="stat-grid stat-grid--4">
      <StatCard label="Clusters" value={live.length} sub={`${live.filter((r) => r.spec.controlPlane === 'dedicated').length} with dedicated control plane`} icon={<CubesIcon />} tone="teal" />
      <StatCard label="Worker nodes" value={workers} sub="Across all node pools" icon={<ServerIcon />} />
      <StatCard label="GPUs" value={gpus} sub="In GPU node pools" icon={<MicrochipIcon />} tone="violet" />
      {costCard(live)}
    </div>
  );
}

export function DbSummary({ rows }: { rows: Resource[] }) {
  const live = rows.filter((r) => r.status !== 'awaiting_approval');
  const n = (r: Resource) => (r.spec.topology === 'ha' ? 3 : 1);
  return (
    <div className="stat-grid stat-grid--4">
      <StatCard label="Databases" value={live.length} sub={`${live.filter((r) => r.spec.topology === 'ha').length} highly available`} icon={<DatabaseIcon />} tone="teal" />
      <StatCard label="Instances" value={live.reduce((s, r) => s + n(r), 0)} sub={`${live.reduce((s, r) => s + n(r) * (DB_SIZES[String(r.spec.size)]?.vcpu ?? 0), 0)} vCPUs in total`} icon={<ServerIcon />} />
      <StatCard label="Storage" value={`${live.reduce((s, r) => s + n(r) * Number(r.spec.storageGb ?? 0), 0).toLocaleString('en-IN')} GB`} sub="Including replicas" icon={<HddIcon />} tone="violet" />
      {costCard(live)}
    </div>
  );
}

export function StorageSummary({ rows }: { rows: Resource[] }) {
  const live = rows.filter((r) => r.status !== 'awaiting_approval');
  const gb = (id: string) => live.filter((r) => r.catalogItemId === id).reduce((s, r) => s + Number(r.spec.sizeGb ?? 0), 0);
  const count = (id: string) => live.filter((r) => r.catalogItemId === id).length;
  return (
    <div className="stat-grid stat-grid--4">
      <StatCard label="Block volumes" value={`${gb('block').toLocaleString('en-IN')} GB`} sub={`${count('block')} volume${count('block') === 1 ? '' : 's'}`} icon={<HddIcon />} />
      <StatCard label="File shares" value={`${gb('file').toLocaleString('en-IN')} GB`} sub={`${count('file')} share${count('file') === 1 ? '' : 's'}`} icon={<HddIcon />} tone="teal" />
      <StatCard label="Object storage" value={count('object')} sub="Buckets · billed per GB stored" icon={<HddIcon />} tone="violet" />
      {costCard(live)}
    </div>
  );
}
