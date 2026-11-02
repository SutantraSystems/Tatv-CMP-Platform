/**
 * In-browser mock of the CMP API.
 *
 * It reproduces the behaviours the real control plane guarantees, so the UI is built against them
 * from day one:
 *  - writes return 202 with an Operation; work completes asynchronously (Temporal in production);
 *  - quota is reserved at request time and released on rejection or deletion;
 *  - policy can require approval, and a requester can never approve their own request;
 *  - decommissioning and permanent deletion always need approval from another organisation admin;
 *  - the same Idempotency-Key never creates a second resource;
 *  - errors are RFC 9457 problem details.
 */
import { CATALOG, MAX_READ_REPLICAS, READ_REPLICA_APPROVAL_ABOVE, REGIONS, computeOnly, dbInstances, dbTopologyText, demandFor, itemOf, kindOf, needsApproval, storageOnly, type Demand, type Spec } from './catalog';
import {
  APPROVAL_ACTIONS,
  PENDING_NAME,
  ProblemError,
  RETENTION_DAYS,
  type Accepted,
  type Action,
  type CmpApi,
  type LifecycleAction,
  type Member,
  type Operation,
  type Organisation,
  type Project,
  type Quota,
  type RegionId,
  type Resource,
  type Role,
  type User,
} from './types';

const USERS: User[] = [
  { id: 'u-asha', name: 'Asha Rao', email: 'asha.rao@example.in', roles: { 'org-1': ['org-owner', 'org-admin'], 'org-2': ['org-admin'] } },
  { id: 'u-meera', name: 'Meera Iyer', email: 'meera.iyer@example.in', roles: { 'org-1': ['org-admin'] } },
  { id: 'u-ravi', name: 'Ravi Kumar', email: 'ravi.kumar@example.in', roles: { 'org-1': ['project-operator'] } },
];

const ORGS: Organisation[] = [
  { id: 'org-1', name: 'Sutantra Systems Private Limited', kind: 'commercial', verified: true },
  { id: 'org-2', name: 'Department of Example Services', kind: 'government', verified: true },
];

const PROJECTS: Project[] = [
  { id: 'prj-1', organisationId: 'org-1', name: 'payments-prod' },
  { id: 'prj-2', organisationId: 'org-1', name: 'analytics-dev' },
  { id: 'prj-3', organisationId: 'org-2', name: 'citizen-portal' },
];

const DEFAULT_LIMITS: Record<keyof Quota, number> = { vcpu: 32, ramGb: 128, volumeGb: 4000, gpus: 2, publicIps: 4 };

const WRITE_ROLES = ['org-owner', 'org-admin', 'project-admin', 'project-operator'];
const ADMIN_ROLES = ['org-owner', 'org-admin'];

const demandOf = (r: Pick<Resource, 'catalogItemId' | 'spec'>): Demand => demandFor(r.catalogItemId, r.spec);

const problem = (status: number, title: string, detail: string, slug: string): ProblemError =>
  new ProblemError({ type: `https://api.cloud.example.in/problems/${slug}`, title, status, detail });

const ID_PREFIX: Record<string, string> = { 'vm-linux': 'vm', 'vm-windows': 'vm', k8s: 'k8s', pg: 'db', block: 'vol', file: 'fs', object: 'bkt' };

export interface MockOptions {
  /** Base delay for asynchronous work, in milliseconds. */
  delayMs?: number;
  /** Network latency added to every call. */
  latencyMs?: number;
  /** Quota limits per project. */
  limits?: Partial<Record<keyof Quota, number>>;
  /** Start with demo resources, operations and approvals. */
  seed?: boolean;
}

export function createMockApi(opts: MockOptions = {}): CmpApi {
  const delay = opts.delayMs ?? 2500;
  const latency = opts.latencyMs ?? 150;
  const limits = { ...DEFAULT_LIMITS, ...opts.limits };
  const resources: Resource[] = [];
  const operations: Operation[] = [];
  const quotas = new Map<string, Quota>();
  const idempotency = new Map<string, Accepted | Operation>();
  const listeners = new Set<() => void>();
  const members = new Map<string, Member[]>();
  let seq = 0;

  const hex = () => (((++seq * 2654435761) >>> 0) % 0xfffffff).toString(16).padStart(7, '0');
  const now = () => new Date().toISOString();
  const emit = () => listeners.forEach((l) => l());
  const later = <T>(value: T) => new Promise<T>((r) => setTimeout(() => r(structuredClone(value)), latency));
  const quotaFor = (projectId: string): Quota => {
    let q = quotas.get(projectId);
    if (!q) {
      q = Object.fromEntries(Object.entries(limits).map(([k, limit]) => [k, { used: 0, reserved: 0, limit }])) as unknown as Quota;
      quotas.set(projectId, q);
    }
    return q;
  };
  const adjust = (projectId: string, d: Demand, field: 'used' | 'reserved', sign: 1 | -1) => {
    const q = quotaFor(projectId);
    (Object.keys(d) as (keyof Quota)[]).forEach((k) => {
      q[k][field] = Math.max(0, q[k][field] + sign * d[k]);
    });
  };
  const overQuota = (projectId: string, d: Demand) => {
    const q = quotaFor(projectId);
    return (Object.keys(d) as (keyof Quota)[]).filter((k) => d[k] > 0 && q[k].used + q[k].reserved + d[k] > q[k].limit);
  };
  const orgOfProject = (projectId: string) => PROJECTS.find((p) => p.id === projectId)?.organisationId ?? '';
  const can = (user: User, projectId: string, roles: string[]) => (user.roles[orgOfProject(projectId)] ?? []).some((r) => roles.includes(r));
  let ipSeq = 3;
  const nextIp = () => `10.20.${Math.floor(ipSeq / 250)}.${(ipSeq++ % 250) + 4}`;
  const userName = (id: string) => USERS.find((u) => u.id === id)?.name ?? id;

  function finish(op: Operation, status: Operation['status'], message?: string) {
    op.status = status;
    op.finishedAt = now();
    if (message) op.message = message;
  }

  /** Addresses and endpoints assigned when a workload comes up. */
  function assignEndpoints(res: Resource): string {
    const host = `${res.region}.tatvcloud.example.in`;
    switch (kindOf(res.catalogItemId)) {
      case 'vm':
        res.addresses = { private: nextIp(), ...(res.spec.publicIp ? { public: `203.0.113.${(seq % 200) + 10}` } : {}) };
        return 'Network port, boot volume and server created; inventory updated.';
      case 'k8s':
        res.endpoint = res.spec.publicApi ? `https://${res.name}.k8s.${host}:6443` : `https://${nextIp()}:6443`;
        return `Cluster ${res.spec.version} ready with ${res.spec.workerCount} workers; kubeconfig available through single sign-on.`;
      case 'db':
        res.endpoint = `${res.name}.db.internal:5432`;
        setReadEndpoint(res);
        return `${dbTopologyText(res.spec)} running; backups scheduled.`;
      case 'storage':
        if (res.catalogItemId === 'object') {
          res.endpoint = `https://${res.name}.objects.${host}`;
          return 'Bucket created; access keys are issued from IAM.';
        }
        if (res.catalogItemId === 'file') {
          res.endpoint = res.spec.protocol === 'smb' ? `\\\\files.${res.region}.internal\\${res.name}` : `files.${res.region}.internal:/${res.name}`;
          return 'File share created and exported to your VPC.';
        }
        return 'Volume created; attach it from a virtual machine.';
      default:
        return 'Created.';
    }
  }

  /** The read-only endpoint exists while there is any copy to read from. */
  function setReadEndpoint(res: Resource) {
    if (dbInstances(res.spec).total > 1) res.readEndpoint = `${res.name}-ro.db.internal:5432`;
    else delete res.readEndpoint;
  }

  /** Quota for N more (or fewer) database instances of this size. */
  function perInstance(res: Resource, n: number): Demand {
    const one = demandFor(res.catalogItemId, { ...res.spec, topology: 'single', readReplicas: 0 });
    return { vcpu: one.vcpu * n, ramGb: one.ramGb * n, volumeGb: one.volumeGb * n, gpus: 0, publicIps: 0 };
  }

  function provision(res: Resource, op: Operation) {
    res.status = 'provisioning';
    op.status = 'running';
    emit();
    const kind = kindOf(res.catalogItemId);
    setTimeout(() => {
      const d = demandOf(res);
      adjust(res.projectId, d, 'reserved', -1);
      adjust(res.projectId, d, 'used', 1);
      res.status = 'active';
      finish(op, 'succeeded', assignEndpoints(res));
      emit();
    }, kind === 'vm' || kind === 'storage' ? delay : delay * 1.6);
  }

  const ALLOWED_FROM: Record<Action, Resource['status'][]> = {
    stop: ['active'], start: ['stopped'], reboot: ['active'], snapshot: ['active', 'stopped'], backup: ['active', 'stopped'],
    upgrade: ['active'], failover: ['active'], 'scale-replicas': ['active'], decommission: ['active', 'stopped', 'error'], restore: ['decommissioned'], purge: ['decommissioned'],
  };

  function checkState(res: Resource, action: Action) {
    if (!ALLOWED_FROM[action].includes(res.status)) {
      const hint = action === 'purge' ? ' Decommission it first; permanent deletion only applies to decommissioned workloads.' : '';
      throw problem(409, 'Action not possible now', `Cannot ${action} while the resource is ${res.status.replace(/_/g, ' ')}.${hint}`, 'invalid-state');
    }
  }

  /** Carries out an action that has been allowed (and approved, where approval is needed). */
  function execute(res: Resource, op: Operation, action: Action) {
    const d = demandOf(res);
    if (action === 'restore') adjust(res.projectId, computeOnly(d), 'reserved', 1);
    op.status = 'running';
    const transient: Partial<Record<Action, Resource['status']>> = {
      stop: 'stopping', start: 'starting', upgrade: 'upgrading', failover: 'failing_over', 'scale-replicas': 'scaling', decommission: 'decommissioning', restore: 'restoring', purge: 'purging',
    };
    const before = res.status;
    if (transient[action]) res.status = transient[action]!;
    emit();
    setTimeout(() => {
      let message: string;
      switch (action) {
        case 'stop':
          res.status = 'stopped';
          message = 'Shut down. Compute billing has stopped; storage and public IPs are still billed.';
          break;
        case 'start':
          res.status = 'active';
          message = 'Started.';
          break;
        case 'upgrade':
          res.spec.version = '1.33';
          res.status = 'active';
          message = 'Control plane and workers upgraded to 1.33, one node at a time.';
          break;
        case 'failover':
          res.status = 'active';
          message = 'A standby was promoted to primary; the endpoint is unchanged.';
          break;
        case 'scale-replicas': {
          const { from, to } = op.replicas!;
          if (to > from) {
            adjust(res.projectId, perInstance(res, to - from), 'reserved', -1);
            adjust(res.projectId, perInstance(res, to - from), 'used', 1);
          } else adjust(res.projectId, perInstance(res, from - to), 'used', -1);
          res.spec.readReplicas = to;
          setReadEndpoint(res);
          res.status = 'active';
          message =
            to > from
              ? `${to - from} read replica${to - from > 1 ? 's' : ''} added and in sync; the read-only endpoint now spreads reads across ${dbInstances(res.spec).total - 1} copies.`
              : `${from - to} read replica${from - to > 1 ? 's' : ''} removed after draining connections; quota released.`;
          break;
        }
        case 'decommission':
          adjust(res.projectId, computeOnly(d), 'used', -1);
          res.status = 'decommissioned';
          res.retentionUntil = new Date(Date.now() + RETENTION_DAYS * 86400_000).toISOString();
          message = `Decommissioned: taken out of service, compute and IP quota released. Restorable for ${RETENTION_DAYS} days, then permanently deleted.`;
          break;
        case 'restore':
          adjust(res.projectId, computeOnly(d), 'reserved', -1);
          adjust(res.projectId, computeOnly(d), 'used', 1);
          res.status = itemOf(res.catalogItemId)?.powerControl === false ? 'active' : 'stopped';
          delete res.retentionUntil;
          message = res.status === 'stopped' ? 'Restored from the retention hold; it is shut down until you start it.' : 'Restored from the retention hold.';
          break;
        case 'purge':
          adjust(res.projectId, storageOnly(d), 'used', -1);
          res.status = 'deleted';
          message = `Permanently deleted: encryption keys destroyed and data crypto-erased. Certificate of sanitisation SAN-${res.id.toUpperCase()} issued.`;
          break;
        default:
          res.status = before;
          message = action === 'snapshot' ? 'Snapshot created.' : action === 'backup' ? 'Backup completed and replicated.' : 'Restarted.';
      }
      finish(op, 'succeeded', message);
      emit();
    }, action === 'reboot' ? delay / 2 : delay);
  }

  /* ---------- Demo data ---------- */

  function seed() {
    const day = 86400_000;
    const ago = (days: number) => new Date(Date.now() - days * day).toISOString();
    const add = (projectId: string, itemId: string, spec: Spec, o: { region: RegionId; days: number; by: string; status?: Resource['status']; tags?: Record<string, string>; description?: string }) => {
      const res: Resource = {
        id: `${ID_PREFIX[itemId]}-${hex()}`, projectId, catalogItemId: itemId, name: String(spec.name), status: 'active', spec,
        region: o.region, tags: o.tags ?? {}, description: o.description, createdAt: ago(o.days), createdBy: userName(o.by),
      };
      assignEndpoints(res);
      adjust(projectId, demandOf(res), 'used', 1);
      if (o.status) res.status = o.status;
      resources.push(res);
      operations.push({
        id: `op-${hex()}`, projectId, resourceId: res.id, resourceName: res.name, action: 'create', status: 'succeeded',
        requestedBy: o.by, requestedAt: res.createdAt, finishedAt: res.createdAt, message: 'Created.',
      });
      return res;
    };
    const vm = (name: string, flavour: string, extra: Spec = {}) => ({ name, image: 'ubuntu-24.04', flavour, volumeGb: 50, volumeType: 'standard', publicIp: false, backupPolicy: 'daily-7', ...extra });
    const prod = { environment: 'production', project: 'payments' };
    add('prj-1', 'vm-linux', vm('web-prod-01', 's.small', { publicIp: true }), { region: 'in-west', days: 14, by: 'u-meera', tags: { ...prod, tier: 'frontend' }, description: 'Customer portal frontend' });
    add('prj-1', 'vm-linux', vm('app-worker-01', 'm.medium', { image: 'rhel-9.6', volumeGb: 100 }), { region: 'in-west', days: 12, by: 'u-ravi', tags: { ...prod, tier: 'backend' } });
    add('prj-1', 'vm-linux', vm('batch-runner', 'm.medium', { volumeGb: 200 }), { region: 'in-west', days: 9, by: 'u-ravi', status: 'stopped', tags: { environment: 'production', tier: 'batch' } });
    add('prj-1', 'vm-windows', vm('reporting-win', 's.small', { image: 'windows-2022', volumeGb: 100 }), { region: 'in-west', days: 6, by: 'u-meera', tags: { environment: 'production', tier: 'reporting' } });
    add('prj-1', 'vm-linux', vm('dr-standby-01', 's.small'), { region: 'in-south', days: 20, by: 'u-meera', tags: { environment: 'dr', tier: 'frontend' } });
    add('prj-1', 'k8s', { name: 'apps-cluster', version: '1.32', controlPlane: 'hosted', workerFlavour: 'm.medium', workerCount: 3, publicApi: false }, { region: 'in-west', days: 18, by: 'u-meera', tags: prod });
    add('prj-1', 'pg', { name: 'orders-db', version: '17', size: 'db.small', topology: 'ha', readReplicas: 2, storageGb: 100, encrypted: true, backupDays: 14 }, { region: 'in-west', days: 18, by: 'u-meera', tags: prod });
    add('prj-1', 'block', { name: 'data-vol-01', sizeGb: 500, volumeType: 'premium', backupPolicy: 'daily-7' }, { region: 'in-west', days: 10, by: 'u-ravi', tags: prod });
    add('prj-1', 'file', { name: 'shared-files', protocol: 'nfs', sizeGb: 1000, snapshots: true }, { region: 'in-west', days: 10, by: 'u-ravi', tags: prod });
    add('prj-1', 'object', { name: 'app-assets', versioning: true, objectLock: false, retentionDays: 30 }, { region: 'in-west', days: 16, by: 'u-meera', tags: prod });
    add('prj-2', 'vm-linux', vm('notebook-01', 'm.medium'), { region: 'in-west', days: 4, by: 'u-ravi', tags: { environment: 'development' } });

    // A GPU request waiting for approval, so the approval flow is visible straight away.
    const gpuSpec = vm('llm-finetune-01', 'g.gpu1', { volumeGb: 200, volumeType: 'premium' });
    const gpu: Resource = {
      id: `vm-${hex()}`, projectId: 'prj-1', catalogItemId: 'vm-linux', name: 'llm-finetune-01', status: 'awaiting_approval', spec: gpuSpec,
      region: 'in-west', tags: { environment: 'production', team: 'data-science' }, createdAt: ago(0.1), createdBy: 'Ravi Kumar',
    };
    resources.push(gpu);
    adjust('prj-1', demandOf(gpu), 'reserved', 1);
    operations.push({
      id: `op-${hex()}`, projectId: 'prj-1', resourceId: gpu.id, resourceName: gpu.name, action: 'create', status: 'awaiting_approval',
      requestedBy: 'u-ravi', requestedAt: gpu.createdAt, message: 'Waiting for an organisation admin to approve.',
    });
    operations.sort((a, b) => a.requestedAt.localeCompare(b.requestedAt));
  }

  members.set('org-1', [
    { userId: 'u-asha', name: 'Asha Rao', email: 'asha.rao@example.in', roles: ['org-owner', 'org-admin'], projects: [], status: 'active', mfa: true, source: 'federated', lastSignIn: new Date(Date.now() - 3600_000).toISOString() },
    { userId: 'u-meera', name: 'Meera Iyer', email: 'meera.iyer@example.in', roles: ['org-admin'], projects: [], status: 'active', mfa: true, source: 'federated', lastSignIn: new Date(Date.now() - 7200_000).toISOString() },
    { userId: 'u-ravi', name: 'Ravi Kumar', email: 'ravi.kumar@example.in', roles: ['project-operator'], projects: ['prj-1', 'prj-2'], status: 'active', mfa: true, source: 'federated', lastSignIn: new Date(Date.now() - 1800_000).toISOString() },
    { userId: 'u-neha', name: 'Neha Sharma', email: 'neha.sharma@example.in', roles: ['billing-admin'], projects: [], status: 'active', mfa: true, source: 'local', lastSignIn: new Date(Date.now() - 3 * 86400_000).toISOString() },
    { userId: 'u-arjun', name: 'Arjun Mehta', email: 'arjun.mehta@example.in', roles: ['auditor'], projects: [], status: 'active', mfa: false, source: 'local', lastSignIn: new Date(Date.now() - 9 * 86400_000).toISOString() },
    { userId: 'u-kavya', name: 'Kavya Nair', email: 'kavya.nair@example.in', roles: ['project-reader'], projects: ['prj-2'], status: 'invited', mfa: false, source: 'local' },
  ]);
  members.set('org-2', [
    { userId: 'u-asha', name: 'Asha Rao', email: 'asha.rao@example.in', roles: ['org-admin'], projects: [], status: 'active', mfa: true, source: 'federated', lastSignIn: new Date(Date.now() - 86400_000).toISOString() },
  ]);

  if (opts.seed) seed();

  return {
    async signIn(userId) {
      const u = USERS.find((x) => x.id === userId);
      if (!u) throw problem(401, 'Sign-in failed', 'Unknown user.', 'unauthenticated');
      return later(u);
    },
    listUsers: () => later(USERS),
    listOrganisations: (user) => later(ORGS.filter((o) => user.roles[o.id])),
    listProjects: (orgId) => later(PROJECTS.filter((p) => p.organisationId === orgId)),
    listRegions: () => later(REGIONS),
    getCatalog: () => later(CATALOG),
    getQuota: (projectId) => later(quotaFor(projectId)),
    listResources: (projectId) => later(resources.filter((r) => r.projectId === projectId && r.status !== 'deleted')),
    listOperations: (projectId) => later([...operations].filter((o) => o.projectId === projectId).reverse()),

    listMembers: (orgId) => later(members.get(orgId) ?? []),
    async inviteMember(user, orgId, invite) {
      if (!(user.roles[orgId] ?? []).some((r) => ADMIN_ROLES.includes(r)))
        throw problem(403, 'Not permitted', 'Only an organisation admin can invite users.', 'forbidden');
      const list = members.get(orgId) ?? [];
      if (list.some((m) => m.email.toLowerCase() === invite.email.toLowerCase()))
        throw problem(409, 'Already a member', `${invite.email} is already in this organisation.`, 'conflict');
      const m: Member = { userId: `u-${hex()}`, name: invite.name, email: invite.email, roles: [invite.role as Role], projects: [], status: 'invited', mfa: false, source: 'local' };
      list.push(m);
      members.set(orgId, list);
      emit();
      return later(m);
    },

    async createResource(user, projectId, catalogItemId, params, key, meta) {
      const seen = idempotency.get(key);
      if (seen && 'resource' in seen) return later(seen);
      if (!can(user, projectId, WRITE_ROLES)) throw problem(403, 'Not permitted', 'Your role in this project cannot create resources.', 'forbidden');
      const item = itemOf(catalogItemId);
      if (!item?.available || !item.kind) throw problem(404, 'Unknown catalog item', `Catalog item ${catalogItemId} is not available.`, 'not-found');
      if (resources.some((r) => r.projectId === projectId && r.name === params.name && r.status !== 'deleted'))
        throw problem(409, 'Name already in use', `A resource named "${params.name}" already exists in this project.`, 'conflict');

      const d = demandFor(catalogItemId, params);
      const over = overQuota(projectId, d);
      if (over.length) throw problem(422, 'Quota exceeded', `This request would exceed the project quota for: ${over.join(', ')}.`, 'quota-exceeded');
      adjust(projectId, d, 'reserved', 1); // reserved in the same step as the request is recorded

      const res: Resource = {
        id: `${ID_PREFIX[catalogItemId] ?? 'res'}-${hex()}`, projectId, catalogItemId, name: String(params.name), status: 'awaiting_approval', spec: { ...params },
        region: meta?.region ?? 'in-west', description: meta?.description || undefined, tags: { ...(meta?.tags ?? {}) }, createdAt: now(), createdBy: user.name,
      };
      const op: Operation = { id: `op-${hex()}`, projectId, resourceId: res.id, resourceName: res.name, action: 'create', status: 'awaiting_approval', requestedBy: user.id, requestedAt: now() };
      resources.push(res);
      operations.push(op);
      if (needsApproval(catalogItemId, params)) op.message = 'Waiting for an organisation admin to approve.';
      else provision(res, op);
      const accepted = { resource: res, operation: op };
      idempotency.set(key, accepted);
      emit();
      return later(accepted);
    },

    async runAction(user, resourceId, action, key) {
      const seen = idempotency.get(key);
      if (seen && !('resource' in seen)) return later(seen);
      const res = resources.find((r) => r.id === resourceId);
      if (!res || res.status === 'deleted') throw problem(404, 'Not found', 'Resource not found.', 'not-found');
      if (!can(user, res.projectId, WRITE_ROLES)) throw problem(403, 'Not permitted', 'Your role in this project cannot change resources.', 'forbidden');
      const lifecycle: LifecycleAction[] = ['stop', 'start', 'decommission', 'restore', 'purge'];
      const item = CATALOG.find((c) => c.id === res.catalogItemId);
      const offered = lifecycle.includes(action as LifecycleAction)
        ? !((action === 'stop' || action === 'start') && item?.powerControl === false)
        : item?.day2.includes(action as never);
      if (!offered) throw problem(400, 'Action not offered', `${item?.name ?? 'This service'} does not offer "${action}".`, 'unsupported-action');
      if (action === 'failover' && res.spec.topology !== 'ha')
        throw problem(409, 'No replica to fail over to', 'Failover needs the high-availability topology.', 'invalid-state');
      if (action === 'upgrade' && res.spec.version === '1.33')
        throw problem(409, 'Already on the latest version', 'This cluster already runs Kubernetes 1.33.', 'invalid-state');
      if (res.pending)
        throw problem(409, 'Request already pending', `A ${(PENDING_NAME[res.pending.action] ?? res.pending.action).toLowerCase()} request for ${res.name} is waiting for approval.`, 'invalid-state');
      checkState(res, action);
      if (action === 'restore') {
        const over = overQuota(res.projectId, computeOnly(demandOf(res)));
        if (over.length) throw problem(422, 'Quota exceeded', `Restoring would exceed the project quota for: ${over.join(', ')}.`, 'quota-exceeded');
      }

      const op: Operation = { id: `op-${hex()}`, projectId: res.projectId, resourceId: res.id, resourceName: res.name, action, status: 'running', requestedBy: user.id, requestedAt: now() };
      operations.push(op);
      idempotency.set(key, op);
      if (APPROVAL_ACTIONS.includes(action)) {
        op.status = 'awaiting_approval';
        op.message = `Waiting for an organisation admin other than ${user.name} to approve.`;
        res.pending = { action, operationId: op.id, requestedBy: user.name };
        emit();
        return later(op);
      }
      execute(res, op, action);
      return later(op);
    },

    async updateTags(user, resourceId, tags) {
      const res = resources.find((r) => r.id === resourceId);
      if (!res || res.status === 'deleted') throw problem(404, 'Not found', 'Resource not found.', 'not-found');
      if (!can(user, res.projectId, WRITE_ROLES)) throw problem(403, 'Not permitted', 'Your role in this project cannot change tags.', 'forbidden');
      const bad = Object.keys(tags).find((k) => !/^[a-z][a-z0-9._-]{0,62}$/.test(k));
      if (bad) throw problem(400, 'Invalid tag key', `"${bad}" is not a valid tag key: lowercase letters, digits, dots, hyphens and underscores.`, 'validation');
      res.tags = { ...tags };
      emit();
      return later(res);
    },

    async setReadReplicas(user, resourceId, count, key) {
      const seen = idempotency.get(key);
      if (seen && !('resource' in seen)) return later(seen);
      const res = resources.find((r) => r.id === resourceId);
      if (!res || res.status === 'deleted') throw problem(404, 'Not found', 'Resource not found.', 'not-found');
      if (kindOf(res.catalogItemId) !== 'db') throw problem(400, 'Action not offered', 'Read replicas apply to managed databases only.', 'unsupported-action');
      if (!can(user, res.projectId, WRITE_ROLES)) throw problem(403, 'Not permitted', 'Your role in this project cannot change resources.', 'forbidden');
      if (!Number.isInteger(count) || count < 0 || count > MAX_READ_REPLICAS)
        throw problem(400, 'Invalid number of read replicas', `Choose between 0 and ${MAX_READ_REPLICAS} read replicas.`, 'validation');
      const from = dbInstances(res.spec).readReplicas;
      if (count === from) throw problem(409, 'Nothing to change', `${res.name} already has ${from} read replica${from === 1 ? '' : 's'}.`, 'invalid-state');
      if (res.pending)
        throw problem(409, 'Request already pending', `A ${(PENDING_NAME[res.pending.action] ?? res.pending.action).toLowerCase()} request for ${res.name} is waiting for approval.`, 'invalid-state');
      checkState(res, 'scale-replicas');
      if (count > from) {
        const over = overQuota(res.projectId, perInstance(res, count - from));
        if (over.length) throw problem(422, 'Quota exceeded', `Adding ${count - from} read replica${count - from > 1 ? 's' : ''} would exceed the project quota for: ${over.join(', ')}.`, 'quota-exceeded');
        adjust(res.projectId, perInstance(res, count - from), 'reserved', 1);
      }
      const op: Operation = {
        id: `op-${hex()}`, projectId: res.projectId, resourceId: res.id, resourceName: res.name, action: 'scale-replicas', status: 'running',
        requestedBy: user.id, requestedAt: now(), replicas: { from, to: count },
      };
      operations.push(op);
      idempotency.set(key, op);
      if (count > READ_REPLICA_APPROVAL_ABOVE && count > from) {
        op.status = 'awaiting_approval';
        op.message = `${from} → ${count} read replicas. More than ${READ_REPLICA_APPROVAL_ABOVE} needs an organisation admin other than ${user.name} to approve; quota is reserved meanwhile.`;
        res.pending = { action: 'scale-replicas', operationId: op.id, requestedBy: user.name };
        emit();
        return later(op);
      }
      execute(res, op, 'scale-replicas');
      return later(op);
    },

    async decide(user, operationId, approve) {
      const op = operations.find((o) => o.id === operationId);
      if (!op || op.status !== 'awaiting_approval') throw problem(409, 'Nothing to decide', 'This request is not awaiting approval.', 'invalid-state');
      if (!can(user, op.projectId, ADMIN_ROLES)) throw problem(403, 'Not an approver', 'Only an organisation admin can approve this request.', 'forbidden');
      if (op.requestedBy === user.id) throw problem(403, 'Separation of duties', 'You cannot approve a request you made yourself.', 'separation-of-duties');
      const res = resources.find((r) => r.id === op.resourceId)!;
      op.approvedBy = user.name;
      if (op.action === 'create') {
        if (approve) provision(res, op);
        else {
          adjust(res.projectId, demandOf(res), 'reserved', -1);
          res.status = 'rejected';
          finish(op, 'rejected', `Rejected by ${user.name}; quota released.`);
        }
      } else {
        delete res.pending;
        if (!approve) {
          if (op.action === 'scale-replicas' && op.replicas && op.replicas.to > op.replicas.from)
            adjust(res.projectId, perInstance(res, op.replicas.to - op.replicas.from), 'reserved', -1);
          finish(op, 'rejected', `Rejected by ${user.name}; ${res.name} is unchanged.`);
        }
        else {
          try {
            checkState(res, op.action);
          } catch (e) {
            finish(op, 'failed', e instanceof ProblemError ? e.problem.detail : 'Could not run the action.');
            emit();
            throw e;
          }
          execute(res, op, op.action);
        }
      }
      emit();
      return later(op);
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** The portal's instance: demo data and a larger quota so the screens are populated. */
export const api = createMockApi({ seed: true, limits: { vcpu: 96, ramGb: 384, volumeGb: 12000, gpus: 4, publicIps: 8 } });
