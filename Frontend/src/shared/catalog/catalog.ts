import type { CatalogItem, FieldSchema, Quota, Region, ResourceKind, ServiceCategory } from '../api/types';

export const REGIONS: Region[] = [
  { id: 'in-west', name: 'India-West', description: 'Primary data centre' },
  { id: 'in-south', name: 'India-South', description: 'Second data centre' },
];
export const regionName = (id: string) => REGIONS.find((r) => r.id === id)?.name ?? id;

export const FLAVOURS: Record<string, { vcpu: number; ramGb: number; gpus: number; label: string }> = {
  's.small': { vcpu: 2, ramGb: 8, gpus: 0, label: 's.small — 2 vCPU, 8 GB' },
  'm.medium': { vcpu: 4, ramGb: 16, gpus: 0, label: 'm.medium — 4 vCPU, 16 GB' },
  'l.large': { vcpu: 8, ramGb: 32, gpus: 0, label: 'l.large — 8 vCPU, 32 GB' },
  'g.gpu1': { vcpu: 8, ramGb: 64, gpus: 1, label: 'g.gpu1 — 8 vCPU, 64 GB, 1 GPU' },
};

export const DB_SIZES: Record<string, { vcpu: number; ramGb: number; label: string }> = {
  'db.small': { vcpu: 2, ramGb: 8, label: 'db.small — 2 vCPU, 8 GB' },
  'db.medium': { vcpu: 4, ramGb: 16, label: 'db.medium — 4 vCPU, 16 GB' },
  'db.large': { vcpu: 8, ramGb: 32, label: 'db.large — 8 vCPU, 32 GB' },
};

export const CATEGORIES: { id: ServiceCategory; name: string; summary: string }[] = [
  { id: 'network', name: 'VPC', summary: 'Network and security: private networks, security groups, load balancers, VPN and keys.' },
  { id: 'compute', name: 'Compute', summary: 'Virtual machines and managed Kubernetes clusters.' },
  { id: 'storage', name: 'Storage', summary: 'Block volumes, file shares and object storage buckets.' },
  { id: 'databases', name: 'Databases', summary: 'Managed SQL and NoSQL databases.' },
  { id: 'ai', name: 'AI and GPU', summary: 'GPU virtual machines, GPU containers and a sovereign inference API.' },
  { id: 'protection', name: 'Backup', summary: 'Backup as a Service: scheduled, immutable backups restored from the portal.' },
];

/** Dedicated Kubernetes control plane: three small nodes. */
const CONTROL_PLANE = { nodes: 3, vcpu: 2, ramGb: 8, diskGb: 50 };
const NODE_DISK_GB = 100;

const flavourIds = Object.keys(FLAVOURS);
const sizeCards = (section: string): Partial<FieldSchema> => ({
  enum: flavourIds,
  'x-enumLabels': flavourIds,
  'x-enumHints': flavourIds.map((f) => {
    const x = FLAVOURS[f]!;
    return `${x.vcpu} vCPU · ${x.ramGb} GB RAM${x.gpus ? ` · ${x.gpus} GPU` : ''}`;
  }),
  'x-widget': 'cards',
  'x-section': section,
});

const nameField = (title: string, section = 'Identification'): FieldSchema => ({
  type: 'string', title, description: 'Lowercase letters, digits and hyphens; 3–40 characters. Unique in the project.',
  pattern: '^[a-z][a-z0-9-]{2,39}$', 'x-section': section,
});

const backupField: FieldSchema = {
  type: 'string', title: 'Backup policy', enum: ['none', 'daily-7', 'daily-30-immutable'],
  'x-enumLabels': ['No backups', 'Daily, keep 7 days', 'Daily, keep 30 days'],
  'x-enumHints': ['Not recommended for production', 'Restore from the portal', 'Immutable copies, protected from deletion'],
  'x-widget': 'cards', default: 'daily-7', 'x-section': 'Protection',
};

const vmSchema = (images: string[], imageLabels: string[], imageHints: string[], badges: (string | null)[]) => ({
  type: 'object' as const,
  required: ['name', 'image', 'flavour', 'volumeGb'],
  properties: {
    name: nameField('Instance name'),
    image: {
      type: 'string' as const, title: 'Image', enum: images, 'x-enumLabels': imageLabels, 'x-enumHints': imageHints, 'x-enumBadges': badges,
      'x-widget': 'cards' as const, default: images[0], 'x-section': 'Operating system image',
    },
    flavour: { type: 'string' as const, title: 'Size', ...sizeCards('Size'), 'x-enumBadges': [null, null, 'Needs approval', 'Needs approval'], default: 's.small' },
    volumeGb: { type: 'integer' as const, title: 'Boot volume (GB)', minimum: 20, maximum: 2000, default: 50, 'x-section': 'Storage and network' },
    volumeType: {
      type: 'string' as const, title: 'Volume type', enum: ['standard', 'premium', 'db-optimised', 'encrypted'],
      'x-enumLabels': ['Standard', 'Premium', 'Database-optimised', 'Encrypted (customer-managed key)'], default: 'standard', 'x-section': 'Storage and network',
    },
    publicIp: { type: 'boolean' as const, title: 'Assign a public IP', default: false, 'x-section': 'Storage and network', description: 'Off: reachable only inside your VPC.' },
    backupPolicy: backupField,
  },
});

const k8sSchema = {
  type: 'object' as const,
  required: ['name', 'version', 'controlPlane', 'workerFlavour', 'workerCount'],
  properties: {
    name: nameField('Cluster name'),
    version: {
      type: 'string' as const, title: 'Kubernetes version', enum: ['1.33', '1.32'], 'x-enumLabels': ['1.33', '1.32'],
      'x-enumHints': ['Latest', 'Previous'], 'x-widget': 'cards' as const, default: '1.33', 'x-section': 'Cluster',
    },
    controlPlane: {
      type: 'string' as const, title: 'Control plane', enum: ['dedicated', 'hosted'], 'x-enumLabels': ['Dedicated', 'Hosted'],
      'x-enumHints': ['Three nodes in your project; for regulated workloads', 'Run by the platform; lower cost'],
      'x-widget': 'cards' as const, default: 'dedicated', 'x-section': 'Cluster',
    },
    workerFlavour: {
      type: 'string' as const, title: 'Worker node size', ...sizeCards('Worker nodes'), 'x-enumBadges': [null, null, null, 'Needs approval'], default: 'm.medium',
      description: 'g.gpu1 creates a GPU node pool; the GPU operator is installed automatically.',
    },
    workerCount: { type: 'integer' as const, title: 'Worker nodes', minimum: 1, maximum: 20, default: 3, 'x-section': 'Worker nodes', description: 'More than six workers needs approval.' },
    publicApi: { type: 'boolean' as const, title: 'Public API endpoint', default: false, 'x-section': 'Network', description: 'Off: the cluster API is reachable only from your VPC.' },
  },
};

const pgSchema = {
  type: 'object' as const,
  required: ['name', 'version', 'size', 'topology', 'storageGb', 'backupDays'],
  properties: {
    name: nameField('Database name'),
    version: {
      type: 'string' as const, title: 'PostgreSQL version', enum: ['17', '16'], 'x-enumLabels': ['PostgreSQL 17', 'PostgreSQL 16'],
      'x-enumHints': ['Latest', 'Previous'], 'x-widget': 'cards' as const, default: '17', 'x-section': 'Engine',
    },
    size: {
      type: 'string' as const, title: 'Instance size', enum: Object.keys(DB_SIZES), 'x-enumLabels': Object.keys(DB_SIZES),
      'x-enumHints': Object.values(DB_SIZES).map((d) => `${d.vcpu} vCPU · ${d.ramGb} GB RAM`), 'x-enumBadges': [null, null, 'Needs approval'],
      'x-widget': 'cards' as const, default: 'db.small', 'x-section': 'Size and availability',
    },
    topology: {
      type: 'string' as const, title: 'Availability', enum: ['single', 'ha'], 'x-enumLabels': ['Single instance', 'High availability'],
      'x-enumHints': ['For development and test', 'Primary and two replicas, automatic failover'], 'x-widget': 'cards' as const, default: 'ha', 'x-section': 'Size and availability',
    },
    storageGb: { type: 'integer' as const, title: 'Storage per instance (GB)', minimum: 20, maximum: 4000, default: 100, 'x-section': 'Size and availability' },
    encrypted: { type: 'boolean' as const, title: 'Encrypt with a customer-managed key', default: false, 'x-section': 'Protection' },
    backupDays: { type: 'integer' as const, title: 'Backup retention (days)', minimum: 1, maximum: 35, default: 7, description: 'Point-in-time restore is available within this window.', 'x-section': 'Protection' },
  },
};

const blockSchema = {
  type: 'object' as const,
  required: ['name', 'sizeGb', 'volumeType'],
  properties: {
    name: nameField('Volume name'),
    sizeGb: { type: 'integer' as const, title: 'Size (GB)', minimum: 10, maximum: 16000, default: 100, 'x-section': 'Volume', description: 'More than 4,000 GB needs approval.' },
    volumeType: {
      type: 'string' as const, title: 'Volume type', enum: ['standard', 'premium', 'encrypted'], 'x-enumLabels': ['Standard', 'Premium', 'Encrypted'],
      'x-enumHints': ['General purpose', 'Low latency for databases', 'Customer-managed key'], 'x-widget': 'cards' as const, default: 'standard', 'x-section': 'Volume',
    },
    backupPolicy: backupField,
  },
};

const fileSchema = {
  type: 'object' as const,
  required: ['name', 'sizeGb', 'protocol'],
  properties: {
    name: nameField('Share name'),
    protocol: {
      type: 'string' as const, title: 'Protocol', enum: ['nfs', 'smb'], 'x-enumLabels': ['NFS v4.1', 'SMB 3'],
      'x-enumHints': ['For Linux clients and Kubernetes', 'For Windows clients'], 'x-widget': 'cards' as const, default: 'nfs', 'x-section': 'Share',
    },
    sizeGb: { type: 'integer' as const, title: 'Capacity (GB)', minimum: 100, maximum: 64000, default: 500, 'x-section': 'Share', description: 'More than 4,000 GB needs approval.' },
    snapshots: { type: 'boolean' as const, title: 'Daily snapshots, keep 7 days', default: true, 'x-section': 'Protection' },
  },
};

const objectSchema = {
  type: 'object' as const,
  required: ['name'],
  properties: {
    name: { ...nameField('Bucket name'), description: 'Lowercase letters, digits and hyphens; 3–40 characters. Becomes part of the bucket URL.' },
    versioning: { type: 'boolean' as const, title: 'Keep previous versions of objects', default: true, 'x-section': 'Bucket' },
    objectLock: { type: 'boolean' as const, title: 'Object Lock (write once, read many)', default: false, 'x-section': 'Protection', description: 'Objects cannot be changed or deleted until their retention ends. Cannot be turned off later.' },
    retentionDays: { type: 'integer' as const, title: 'Default retention with Object Lock (days)', minimum: 1, maximum: 3650, default: 30, 'x-section': 'Protection' },
  },
};

const vmDay2: CatalogItem['day2'] = ['reboot', 'snapshot', 'backup'];
const vmApproval = 'Large and GPU sizes need approval from an organisation admin.';

export const CATALOG: CatalogItem[] = [
  // VPC: network and security
  { id: 'vpc', name: 'VPC network', category: 'network', group: 'Network', description: 'Private network with subnets and routing, isolated per project.', publisher: 'Platform', available: false, day2: [] },
  { id: 'security-group', name: 'Security group', category: 'network', group: 'Security', description: 'Stateful firewall rules for VMs and clusters.', publisher: 'Platform', available: false, day2: [] },
  { id: 'load-balancer', name: 'Load balancer', category: 'network', group: 'Network', description: 'Layer 4 and layer 7 load balancing with managed certificates.', publisher: 'Platform', available: false, day2: [] },
  { id: 'vpn', name: 'Site-to-site VPN', category: 'network', group: 'Network', description: 'IPsec tunnel from your office or data centre into your VPC.', publisher: 'Platform', available: false, day2: [] },
  { id: 'kms', name: 'Customer-managed key', category: 'network', group: 'Security', description: 'Encryption keys held in the platform HSM and controlled by you.', publisher: 'Platform', available: false, day2: [] },

  // Compute
  {
    id: 'vm-linux', name: 'Linux virtual machine', category: 'compute', group: 'Virtual machines', kind: 'vm', powerControl: true,
    description: 'Ubuntu, Red Hat Enterprise Linux or Rocky Linux with block storage.', publisher: 'Platform', available: true,
    schema: vmSchema(
      ['ubuntu-24.04', 'rhel-9.6', 'rocky-9.6'],
      ['Ubuntu Linux', 'Red Hat Enterprise Linux', 'Rocky Linux'],
      ['24.04 LTS', '9.6 · subscription included', '9.6'],
      ['Popular', null, null],
    ),
    day2: vmDay2, approvalRule: vmApproval,
  },
  {
    id: 'vm-windows', name: 'Windows Server virtual machine', category: 'compute', group: 'Virtual machines', kind: 'vm', powerControl: true,
    description: 'Windows Server 2025 or 2022; licence billed as a separate line.', publisher: 'Platform', available: true,
    schema: vmSchema(['windows-2025', 'windows-2022'], ['Windows Server', 'Windows Server'], ['2025 Datacenter', '2022 Datacenter'], ['Licence included', 'Licence included']),
    day2: vmDay2, approvalRule: vmApproval,
  },
  {
    id: 'k8s', name: 'Managed Kubernetes', category: 'compute', group: 'Kubernetes', kind: 'k8s', powerControl: true,
    description: 'CNCF-conformant clusters in your project, with GPU node pools.', publisher: 'Platform', available: true,
    schema: k8sSchema, day2: ['upgrade', 'backup'],
    approvalRule: 'Clusters with more than six workers or GPU workers need approval from an organisation admin.',
  },

  // Storage
  {
    id: 'block', name: 'Block volume', category: 'storage', group: 'Block', kind: 'storage', powerControl: false,
    description: 'Persistent disks for VMs, with snapshots and backups.', publisher: 'Platform', available: true,
    schema: blockSchema, day2: ['snapshot', 'backup'], approvalRule: 'Volumes larger than 4,000 GB need approval from an organisation admin.',
  },
  {
    id: 'file', name: 'File share', category: 'storage', group: 'File', kind: 'storage', powerControl: false,
    description: 'Shared NFS or SMB file systems for VMs and Kubernetes.', publisher: 'Platform', available: true,
    schema: fileSchema, day2: ['snapshot'], approvalRule: 'Shares larger than 4,000 GB need approval from an organisation admin.',
  },
  {
    id: 'object', name: 'Object storage bucket', category: 'storage', group: 'Object', kind: 'storage', powerControl: false,
    description: 'S3-compatible buckets with versioning and Object Lock; pay for what you store.', publisher: 'Platform', available: true,
    schema: objectSchema, day2: [],
  },

  // Databases
  {
    id: 'pg', name: 'Managed PostgreSQL', category: 'databases', group: 'SQL', kind: 'db', powerControl: true,
    description: 'Highly available PostgreSQL with point-in-time restore.', publisher: 'Platform', available: true,
    schema: pgSchema, day2: ['reboot', 'failover', 'backup'], approvalRule: 'The db.large size needs approval from an organisation admin.',
  },
  { id: 'nosql-doc', name: 'Document database', category: 'databases', group: 'NoSQL', description: 'Managed JSON document store with replicas and backups.', publisher: 'Platform', available: false, day2: [] },
  { id: 'nosql-kv', name: 'In-memory key-value store', category: 'databases', group: 'NoSQL', description: 'Managed cache for sessions, queues and leaderboards.', publisher: 'Platform', available: false, day2: [] },

  // AI and GPU
  {
    id: 'ai-gpu-vm', name: 'GPU virtual machine', category: 'ai', group: 'GPU compute', description: 'A VM with a dedicated data-centre GPU and drivers ready.', publisher: 'Platform', available: true, day2: [],
    preset: { itemId: 'vm-linux', values: { flavour: 'g.gpu1', image: 'ubuntu-24.04', volumeGb: 200, volumeType: 'premium' } },
  },
  {
    id: 'ai-gpu-k8s', name: 'GPU containers', category: 'ai', group: 'GPU compute', description: 'A Kubernetes cluster with a GPU node pool for training and serving.', publisher: 'Platform', available: true, day2: [],
    preset: { itemId: 'k8s', values: { workerFlavour: 'g.gpu1', workerCount: 1, controlPlane: 'dedicated' } },
  },
  { id: 'inference', name: 'Sovereign inference', category: 'ai', group: 'Inference', description: 'OpenAI-compatible API for open-weight and Indian models; billed per token. Data stays in India.', publisher: 'Platform', available: false, day2: [] },

  // Backup
  { id: 'baas', name: 'Backup as a Service', category: 'protection', group: 'Backup', description: 'Application-consistent backups of VMs, volumes and Kubernetes workloads; immutable copies; restore from the portal.', publisher: 'Platform', available: false, day2: [] },

  // Marketplace
  { id: 'mp-firewall', name: 'Next-generation firewall appliance', category: 'network', group: 'Security', description: 'Virtual firewall; bring your own licence.', publisher: 'Example Security Ltd', available: false, day2: [] },
  { id: 'mp-erp', name: 'ERP suite for SMEs', category: 'compute', group: 'Applications', description: 'Pay-as-you-go hourly, billed on your invoice.', publisher: 'Example Software Pvt Ltd', available: false, day2: [] },
];

export type Spec = Record<string, string | number | boolean>;
export type Demand = Record<keyof Quota, number>;

/** Part of a workload's demand released while it is decommissioned: compute and IPs go, storage stays for restore. */
export const computeOnly = (d: Demand): Demand => ({ ...d, volumeGb: 0 });
export const storageOnly = (d: Demand): Demand => ({ vcpu: 0, ramGb: 0, gpus: 0, publicIps: 0, volumeGb: d.volumeGb });

export const itemOf = (itemId: string) => CATALOG.find((c) => c.id === itemId);
export const kindOf = (itemId: string): ResourceKind | undefined => itemOf(itemId)?.kind;
const zero: Demand = { vcpu: 0, ramGb: 0, volumeGb: 0, gpus: 0, publicIps: 0 };

/** Capacity a request consumes; the same rules run in the UI summary and in the API's quota check. */
export function demandFor(itemId: string, spec: Spec): Demand {
  switch (kindOf(itemId)) {
    case 'vm': {
      const f = FLAVOURS[String(spec.flavour)] ?? { vcpu: 0, ramGb: 0, gpus: 0 };
      return { vcpu: f.vcpu, ramGb: f.ramGb, volumeGb: Number(spec.volumeGb ?? 0), gpus: f.gpus, publicIps: spec.publicIp ? 1 : 0 };
    }
    case 'k8s': {
      const f = FLAVOURS[String(spec.workerFlavour)] ?? { vcpu: 0, ramGb: 0, gpus: 0 };
      const n = Number(spec.workerCount ?? 0);
      const cp = spec.controlPlane === 'dedicated' ? CONTROL_PLANE : { nodes: 0, vcpu: 0, ramGb: 0, diskGb: 0 };
      return {
        vcpu: n * f.vcpu + cp.nodes * cp.vcpu,
        ramGb: n * f.ramGb + cp.nodes * cp.ramGb,
        volumeGb: n * NODE_DISK_GB + cp.nodes * cp.diskGb,
        gpus: n * f.gpus,
        publicIps: spec.publicApi ? 1 : 0,
      };
    }
    case 'db': {
      const d = DB_SIZES[String(spec.size)] ?? { vcpu: 0, ramGb: 0 };
      const n = spec.topology === 'ha' ? 3 : 1;
      return { vcpu: n * d.vcpu, ramGb: n * d.ramGb, volumeGb: n * Number(spec.storageGb ?? 0), gpus: 0, publicIps: 0 };
    }
    case 'storage':
      // Object storage is billed on usage and has no fixed reservation.
      return itemId === 'object' ? { ...zero } : { ...zero, volumeGb: Number(spec.sizeGb ?? 0) };
    default:
      return { ...zero };
  }
}

/** Approval policy (in production: the CMP policy engine, configurable per organisation). */
export function needsApproval(itemId: string, spec: Spec): boolean {
  switch (kindOf(itemId)) {
    case 'vm':
      return spec.flavour === 'l.large' || spec.flavour === 'g.gpu1';
    case 'k8s':
      return Number(spec.workerCount ?? 0) > 6 || spec.workerFlavour === 'g.gpu1';
    case 'db':
      return spec.size === 'db.large';
    case 'storage':
      return Number(spec.sizeGb ?? 0) > 4000;
    default:
      return false;
  }
}

/** One-line description of a resource's size, for summaries and tables. */
export function describe(itemId: string, spec: Spec): string {
  switch (kindOf(itemId)) {
    case 'vm': {
      const f = FLAVOURS[String(spec.flavour)];
      return f ? `${String(spec.flavour)} · ${f.vcpu} vCPU · ${f.ramGb} GB${f.gpus ? ` · ${f.gpus} GPU` : ''}` : '';
    }
    case 'k8s': {
      const f = FLAVOURS[String(spec.workerFlavour)];
      return `${spec.workerCount} × ${String(spec.workerFlavour)}${f?.gpus ? ' (GPU)' : ''} · ${spec.controlPlane} control plane`;
    }
    case 'db':
      return `${String(spec.size)} · ${spec.topology === 'ha' ? 'HA, 3 instances' : 'single instance'} · ${spec.storageGb} GB each`;
    case 'storage':
      if (itemId === 'object') return `Versioning ${spec.versioning ? 'on' : 'off'}${spec.objectLock ? ` · Object Lock ${spec.retentionDays} days` : ''}`;
      if (itemId === 'file') return `${Number(spec.sizeGb).toLocaleString('en-IN')} GB · ${spec.protocol === 'smb' ? 'SMB 3' : 'NFS v4.1'}`;
      return `${Number(spec.sizeGb).toLocaleString('en-IN')} GB · ${String(spec.volumeType)}`;
    default:
      return '';
  }
}

export const LIST_PATH: Record<ResourceKind, string> = { vm: '/vms', k8s: '/kubernetes', db: '/databases', storage: '/storage' };

/* ---------- Indicative pricing (INR, per month of 730 hours, excluding GST) ---------- */

const RATE = {
  vcpu: 700,
  ramGb: 130,
  gpu: 120000,
  publicIp: 350,
  hostedControlPlane: 5000,
  windowsPerVcpu: 600,
  disk: { standard: 6, premium: 10, 'db-optimised': 12, encrypted: 8 } as Record<string, number>,
  file: 9,
  backup: { none: 0, 'daily-7': 1.5, 'daily-30-immutable': 4 } as Record<string, number>,
  managedDbFactor: 1.25,
  objectPerGb: 1.9,
};
export const OBJECT_RATE_PER_GB = RATE.objectPerGb;

/**
 * Indicative monthly price; undefined for usage-based services such as object storage.
 * With `computeOff` (a shut-down or decommissioned workload) only storage, IPs and fixed fees are counted.
 */
export function monthlyPrice(itemId: string, spec: Spec, computeOff = false): number | undefined {
  const compute = (vcpu: number, ram: number, gpus = 0) => (computeOff ? 0 : vcpu * RATE.vcpu + ram * RATE.ramGb + gpus * RATE.gpu);
  switch (kindOf(itemId)) {
    case 'vm': {
      const f = FLAVOURS[String(spec.flavour)];
      if (!f) return 0;
      const gb = Number(spec.volumeGb ?? 0);
      return (
        compute(f.vcpu, f.ramGb, f.gpus) +
        gb * (RATE.disk[String(spec.volumeType)] ?? RATE.disk.standard!) +
        (spec.publicIp ? RATE.publicIp : 0) +
        (itemId === 'vm-windows' && !computeOff ? f.vcpu * RATE.windowsPerVcpu : 0) +
        gb * (RATE.backup[String(spec.backupPolicy)] ?? 0)
      );
    }
    case 'k8s': {
      const f = FLAVOURS[String(spec.workerFlavour)];
      if (!f) return 0;
      const n = Number(spec.workerCount ?? 0);
      const workers = n * (compute(f.vcpu, f.ramGb, f.gpus) + NODE_DISK_GB * RATE.disk.standard!);
      const cp = spec.controlPlane === 'dedicated'
        ? CONTROL_PLANE.nodes * (compute(CONTROL_PLANE.vcpu, CONTROL_PLANE.ramGb) + CONTROL_PLANE.diskGb * RATE.disk.standard!)
        : RATE.hostedControlPlane;
      return workers + cp + (spec.publicApi ? RATE.publicIp : 0);
    }
    case 'db': {
      const d = DB_SIZES[String(spec.size)];
      if (!d) return 0;
      const n = spec.topology === 'ha' ? 3 : 1;
      return n * (compute(d.vcpu, d.ramGb) * RATE.managedDbFactor + Number(spec.storageGb ?? 0) * RATE.disk['db-optimised']!);
    }
    case 'storage': {
      const gb = Number(spec.sizeGb ?? 0);
      if (itemId === 'object') return undefined;
      if (itemId === 'file') return gb * RATE.file;
      return gb * (RATE.disk[String(spec.volumeType)] ?? RATE.disk.standard!) + gb * (RATE.backup[String(spec.backupPolicy)] ?? 0);
    }
    default:
      return undefined;
  }
}

const inrFormat = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const inrFormat2 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** ₹ with Indian digit grouping (₹1,20,000). */
export const inr = (n: number, paise = false) => (paise ? inrFormat2 : inrFormat).format(n);
