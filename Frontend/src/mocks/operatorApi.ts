/**
 * In-browser mock of the operator API (/operator/v1).
 *
 * Guarantees the console is built against:
 *  - operators see tenant metadata and usage only, never workload data;
 *  - every change (quota, suspend, reactivate, onboard) is a request that a second, authorised operator
 *    approves — nobody approves their own request (four-eyes);
 *  - every request, decision and retry is written to an append-only, hash-chained audit log;
 *  - errors are RFC 9457 problem details.
 */
import { ProblemError, type RegionId } from '@/shared/api/types';
import {
  ACCESS,
  SERVICES,
  type AuditEntry,
  type ChangeRequest,
  type FailedWorkflow,
  type Operator,
  type OpsApi,
  type ProjectUsage,
  type RegionCapacity,
  type Service,
  type ServiceHealth,
  type Tenant,
  type TenantKind,
  type UsageLine,
} from '@/shared/api/operatorTypes';

const OPERATORS: Operator[] = [
  { id: 'op-vikram', name: 'Vikram Singh', email: 'vikram.singh@sutantra.example.in', team: 'sutantra', role: 'platform-admin' },
  { id: 'op-anita', name: 'Anita Desai', email: 'anita.desai@sutantra.example.in', team: 'sutantra', role: 'platform-admin' },
  { id: 'op-priya', name: 'Priya Menon', email: 'priya.menon@sutantra.example.in', team: 'sutantra', role: 'platform-operator' },
  { id: 'op-rahul', name: 'Rahul Verma', email: 'rahul.verma@partner.example.in', team: 'partner', role: 'business-admin' },
];

/** Indicative unit rates, ₹ per month (the same rates the tenant portal shows). */
const RATE = { vcpu: 700, ramGb: 130, storageGb: 6, gpu: 120000, objectGb: 1.9 };

interface Seed {
  name: string;
  kind: TenantKind;
  realm: 'shared' | 'dedicated';
  status: Tenant['status'];
  kyc: Tenant['kyc'];
  region: RegionId;
  monthsAgo: number;
  vcpu: number;
  gpus: number;
  users: number;
  projects: string[];
  state: string;
}

const SEEDS: Seed[] = [
  { name: 'Sutantra Systems Private Limited', kind: 'commercial', realm: 'shared', status: 'active', kyc: 'verified', region: 'in-west', monthsAgo: 5, vcpu: 64, gpus: 0, users: 6, projects: ['payments-prod', 'analytics-dev'], state: '27' },
  { name: 'Department of Example Services', kind: 'government', realm: 'dedicated', status: 'active', kyc: 'verified', region: 'in-west', monthsAgo: 5, vcpu: 320, gpus: 0, users: 24, projects: ['citizen-portal', 'records-archive', 'grievance-app'], state: '07' },
  { name: 'Arthik Ledger Fintech Pvt Ltd', kind: 'commercial', realm: 'shared', status: 'active', kyc: 'verified', region: 'in-west', monthsAgo: 5, vcpu: 440, gpus: 2, users: 18, projects: ['core-ledger', 'fraud-scoring', 'uat'], state: '27' },
  { name: 'Example State Revenue Department', kind: 'government', realm: 'dedicated', status: 'active', kyc: 'verified', region: 'in-south', monthsAgo: 4, vcpu: 256, gpus: 0, users: 31, projects: ['land-records', 'tax-portal'], state: '33' },
  { name: 'Swasthya Health Network (Example)', kind: 'regulated', realm: 'dedicated', status: 'active', kyc: 'verified', region: 'in-west', monthsAgo: 4, vcpu: 192, gpus: 0, users: 12, projects: ['emr-prod', 'emr-dr'], state: '29' },
  { name: 'Indus AI Research Lab', kind: 'commercial', realm: 'shared', status: 'active', kyc: 'verified', region: 'in-west', monthsAgo: 3, vcpu: 160, gpus: 8, users: 7, projects: ['training', 'inference'], state: '29' },
  { name: 'Sahyog Cooperative Bank (Example)', kind: 'regulated', realm: 'dedicated', status: 'active', kyc: 'verified', region: 'in-west', monthsAgo: 3, vcpu: 144, gpus: 0, users: 10, projects: ['cbs-prod', 'cbs-dr'], state: '27' },
  { name: 'Vidya Learning Pvt Ltd', kind: 'commercial', realm: 'shared', status: 'active', kyc: 'verified', region: 'in-south', monthsAgo: 3, vcpu: 96, gpus: 0, users: 9, projects: ['lms-prod', 'lms-staging'], state: '33' },
  { name: 'Kaveri Logistics Pvt Ltd', kind: 'commercial', realm: 'shared', status: 'active', kyc: 'verified', region: 'in-south', monthsAgo: 2, vcpu: 80, gpus: 0, users: 6, projects: ['tracking', 'erp'], state: '29' },
  { name: 'Meghdoot Analytics Pvt Ltd', kind: 'commercial', realm: 'shared', status: 'suspended', kyc: 'verified', region: 'in-west', monthsAgo: 4, vcpu: 48, gpus: 0, users: 4, projects: ['bi'], state: '24' },
  { name: 'Prakash Media Labs', kind: 'commercial', realm: 'shared', status: 'active', kyc: 'expired', region: 'in-south', monthsAgo: 1, vcpu: 32, gpus: 1, users: 3, projects: ['render'], state: '36' },
  { name: 'Example Municipal Corporation', kind: 'government', realm: 'dedicated', status: 'onboarding', kyc: 'pending', region: 'in-south', monthsAgo: 0, vcpu: 0, gpus: 0, users: 2, projects: [], state: '33' },
];

const INSTALLED: Record<RegionId, Omit<RegionCapacity, 'region' | 'weeklyGrowth'>> = {
  'in-west': {
    hosts: 48,
    vcpu: { allocated: 0, installed: 6144 },
    ramGb: { allocated: 0, installed: 24576 },
    blockTb: { allocated: 0, installed: 600 },
    objectTb: { allocated: 0, installed: 2000 },
    gpus: { allocated: 0, installed: 32 },
  },
  'in-south': {
    hosts: 24,
    vcpu: { allocated: 0, installed: 3072 },
    ramGb: { allocated: 0, installed: 12288 },
    blockTb: { allocated: 0, installed: 300 },
    objectTb: { allocated: 0, installed: 1000 },
    gpus: { allocated: 0, installed: 8 },
  },
};

const problem = (status: number, title: string, detail: string, slug: string): ProblemError =>
  new ProblemError({ type: `https://ops-api.tatvcloud.internal/problems/${slug}`, title, status, detail });

/** FNV-1a, standing in for the HSM-signed hash chain of the production audit service. */
function fnv(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  let g = h ^ 0x5bd1e995;
  for (let i = text.length - 1; i >= 0; i--) {
    g ^= text.charCodeAt(i);
    g = Math.imul(g, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0') + g.toString(16).padStart(8, '0');
}

const monthCode = (offset: number) => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - offset);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const monthLabel = (offset: number) => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - offset);
  return d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
};

function usageOf(vcpu: number, gpus: number): UsageLine & { objectTb: number } {
  return { vcpu, ramGb: vcpu * 4, storageGb: vcpu * 40, gpus, objectTb: Math.round((vcpu / 16) * 10) / 10 };
}

function priceOf(u: UsageLine & { objectTb: number }, computeOff = false) {
  const compute = computeOff ? 0 : u.vcpu * RATE.vcpu + u.ramGb * RATE.ramGb;
  const gpu = computeOff ? 0 : u.gpus * RATE.gpu;
  const storage = u.storageGb * RATE.storageGb + u.objectTb * 1000 * RATE.objectGb;
  const backup = Math.round((compute + storage) * 0.06);
  const market = Math.round(compute * 0.02);
  const byService: Record<Service, number> = {
    Compute: Math.round(compute * 0.6),
    Kubernetes: Math.round(compute * 0.25),
    Databases: Math.round(compute * 0.15),
    Storage: Math.round(storage),
    GPU: gpu,
    Backup: backup,
    Marketplace: market,
  };
  return { monthly: SERVICES.reduce((s, k) => s + byService[k], 0), byService };
}

function buildTenant(s: Seed, i: number): Tenant {
  const u = usageOf(s.vcpu, s.gpus);
  const { monthly, byService } = priceOf(u, s.status === 'suspended');
  const full = priceOf(u).monthly;
  const history = Array.from({ length: 6 }, (_, k) => {
    const monthsBack = 5 - k;
    if (monthsBack >= s.monthsAgo) return 0;
    const ramp = 0.55 + 0.45 * ((s.monthsAgo - monthsBack) / Math.max(1, s.monthsAgo));
    return Math.round((s.status === 'suspended' && monthsBack === 0 ? monthly : full * ramp) / 100) * 100;
  });
  const weights = s.projects.map((_, k) => (s.projects.length - k) / ((s.projects.length * (s.projects.length + 1)) / 2));
  const projects: ProjectUsage[] = s.projects.map((name, k) => {
    const w = weights[k]!;
    return {
      name,
      vcpu: Math.round(u.vcpu * w),
      ramGb: Math.round(u.ramGb * w),
      storageGb: Math.round(u.storageGb * w),
      gpus: k === 0 ? u.gpus : 0,
      resources: Math.max(1, Math.round((u.vcpu * w) / 6)),
      monthly: Math.round(monthly * w),
    };
  });
  const invoices = history
    .slice(-4, -1)
    .map((amount, k, arr) => {
      const offset = arr.length - k;
      const overdue = s.status === 'suspended';
      return {
        id: `INV-${monthCode(offset)}-${String(i + 1).padStart(4, '0')}`,
        month: monthLabel(offset),
        amount,
        status: (overdue ? (offset === 3 ? 'paid' : 'overdue') : offset === 1 ? 'due' : 'paid') as 'paid' | 'due' | 'overdue',
      };
    })
    .filter((inv) => inv.amount > 0);
  const pan = `AAB${'CDEFGHJKLMN'[i % 11]}T${String(1000 + i * 37).slice(-4)}${'PQRSTUVWXYZ'[i % 11]}`;
  return {
    id: `tnt-${(0x3a1f + i * 0x2b7).toString(16)}`,
    name: s.name,
    kind: s.kind,
    realm: s.realm,
    status: s.status,
    kyc: s.kyc,
    gstin: `${s.state}${pan}1Z${(i % 9) + 1}`,
    joinedAt: new Date(Date.now() - s.monthsAgo * 30 * 86400_000 - (i + 1) * 86400_000).toISOString(),
    primaryRegion: s.region,
    adminEmail: `cloud-admin@${s.name.toLowerCase().replace(/\(example\)|pvt ltd|private limited|ltd/g, '').trim().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '')}.example.in`,
    users: s.users,
    quota: { vcpu: Math.max(32, Math.ceil((u.vcpu * 1.5) / 16) * 16), ramGb: Math.max(128, Math.ceil((u.ramGb * 1.5) / 64) * 64), storageGb: Math.max(2000, Math.ceil((u.storageGb * 1.5) / 1000) * 1000), gpus: s.gpus ? s.gpus : 0 },
    usage: { vcpu: u.vcpu, ramGb: u.ramGb, storageGb: u.storageGb, gpus: u.gpus },
    objectTb: u.objectTb,
    monthly,
    history,
    byService,
    projects,
    invoices,
  };
}

export interface OpsMockOptions {
  latencyMs?: number;
  delayMs?: number;
}

export function createOpsMock(opts: OpsMockOptions = {}): OpsApi {
  const latency = opts.latencyMs ?? 120;
  const delay = opts.delayMs ?? 2000;
  const tenants: Tenant[] = SEEDS.map(buildTenant);
  const listeners = new Set<() => void>();
  const auditLog: AuditEntry[] = [];
  let seq = 0;
  const later = <T>(v: T) => new Promise<T>((r) => setTimeout(() => r(structuredClone(v)), latency));
  const emit = () => listeners.forEach((l) => l());
  const nextId = (p: string) => `${p}-${(++seq * 7919).toString(36)}`;

  function audit(actor: string, action: string, target: string, detail: string, at = new Date().toISOString()) {
    const prevHash = auditLog.at(-1)?.hash ?? '0'.repeat(16);
    const s = auditLog.length + 1;
    auditLog.push({ seq: s, at, actor, action, target, detail, prevHash, hash: fnv(`${prevHash}|${s}|${at}|${actor}|${action}|${target}|${detail}`) });
  }

  const ago = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();
  const byName = (n: string) => tenants.find((t) => t.name === n)!;

  const workflows: FailedWorkflow[] = [
    { id: 'wf-9c21', tenantId: byName('Arthik Ledger Fintech Pvt Ltd').id, tenantName: 'Arthik Ledger Fintech Pvt Ltd', action: 'Create Kubernetes cluster', resource: 'k8s · fraud-scoring', error: 'Load balancer port allocation timed out after 300 s (network adapter).', startedAt: ago(3), attempts: 3, status: 'failed' },
    { id: 'wf-4e07', tenantId: byName('Example State Revenue Department').id, tenantName: 'Example State Revenue Department', action: 'Back up volume', resource: 'vol · land-records-db', error: 'Backup target busy; job waiting in queue for 2 h 10 m.', startedAt: ago(2.2), attempts: 1, status: 'stuck' },
    { id: 'wf-7b3a', tenantId: byName('Vidya Learning Pvt Ltd').id, tenantName: 'Vidya Learning Pvt Ltd', action: 'Resize database', resource: 'db · lms-prod', error: 'Replica did not catch up within the failover window; resize rolled back.', startedAt: ago(7), attempts: 2, status: 'failed' },
    { id: 'wf-1d88', tenantId: byName('Indus AI Research Lab').id, tenantName: 'Indus AI Research Lab', action: 'Create GPU VM', resource: 'vm · train-node-04', error: 'No GPU capacity in the requested placement group.', startedAt: ago(0.6), attempts: 1, status: 'failed' },
  ];

  const changes: ChangeRequest[] = [
    {
      id: 'chg-1001', kind: 'suspend', tenantId: byName('Meghdoot Analytics Pvt Ltd').id, tenantName: 'Meghdoot Analytics Pvt Ltd',
      summary: 'Suspend tenant', reason: 'Two invoices overdue beyond 30 days; reminders sent on 3 and 10 October.',
      requestedBy: 'op-rahul', requestedByName: 'Rahul Verma', requestedAt: ago(9 * 24), status: 'approved', decidedBy: 'Vikram Singh', decidedAt: ago(9 * 24 - 2),
    },
    {
      id: 'chg-1002', kind: 'quota', tenantId: byName('Indus AI Research Lab').id, tenantName: 'Indus AI Research Lab',
      summary: 'GPUs 8 → 16, vCPUs 240 → 320', reason: 'Customer is starting a fine-tuning programme in November; committed-use order signed.',
      requestedBy: 'op-priya', requestedByName: 'Priya Menon', requestedAt: ago(5), status: 'pending',
      quota: { vcpu: 320, ramGb: byName('Indus AI Research Lab').quota.ramGb, storageGb: byName('Indus AI Research Lab').quota.storageGb, gpus: 16 },
    },
    {
      id: 'chg-1003', kind: 'onboard', tenantName: 'Example State Skills Mission',
      summary: 'Onboard government tenant (dedicated realm, India-South)', reason: 'Work order received from the state department; KYC documents uploaded.',
      requestedBy: 'op-rahul', requestedByName: 'Rahul Verma', requestedAt: ago(20), status: 'pending',
      onboard: { name: 'Example State Skills Mission', kind: 'government', gstin: '33AABCS7788K1Z2', adminEmail: 'cloud-admin@skills.example.gov.in', region: 'in-south', realm: 'dedicated' },
    },
  ];

  // Seed the audit log in time order.
  audit('Rahul Verma', 'Request suspend', 'Meghdoot Analytics Pvt Ltd', changes[0]!.reason, ago(9 * 24));
  audit('Vikram Singh', 'Approve suspend', 'Meghdoot Analytics Pvt Ltd', 'Tenant suspended; workloads shut down, data retained.', ago(9 * 24 - 2));
  audit('Anita Desai', 'Change quota', 'Arthik Ledger Fintech Pvt Ltd', 'vCPUs 512 → 672 (approved request chg-0994).', ago(6 * 24));
  audit('Rahul Verma', 'Request onboard', 'Example State Skills Mission', changes[2]!.reason, ago(20));
  audit('Priya Menon', 'Request quota', 'Indus AI Research Lab', changes[1]!.reason, ago(5));

  const health: ServiceHealth[] = [
    { name: 'Tenant API and portal', group: 'Control plane', status: 'operational' },
    { name: 'Operator API and console', group: 'Control plane', status: 'operational' },
    { name: 'Workflow engine (Temporal)', group: 'Control plane', status: 'operational' },
    { name: 'Event bus (Kafka)', group: 'Control plane', status: 'operational' },
    { name: 'Identity (Keycloak)', group: 'Control plane', status: 'operational' },
    { name: 'Metering and billing', group: 'Control plane', status: 'operational' },
    { name: 'Compute (RHOSO)', group: 'India-West', status: 'operational' },
    { name: 'Block and file storage', group: 'India-West', status: 'operational' },
    { name: 'Object storage', group: 'India-West', status: 'operational' },
    { name: 'GPU pool', group: 'India-West', status: 'degraded', note: 'Placement group pg-gpu-2 full; new GPU VMs may wait.' },
    { name: 'Compute (RHOSO)', group: 'India-South', status: 'operational' },
    { name: 'Block and file storage', group: 'India-South', status: 'operational' },
    { name: 'Object storage', group: 'India-South', status: 'degraded', note: 'One storage node rebuilding; no customer impact.' },
    { name: 'Backup (Trilio)', group: 'India-South', status: 'degraded', note: 'Backup target busy; jobs queued.' },
  ];

  const access = (op: Operator) => ACCESS[op.role];

  return {
    listOperators: () => later(OPERATORS),
    async signIn(id) {
      const o = OPERATORS.find((x) => x.id === id);
      if (!o) throw problem(401, 'Sign-in failed', 'Unknown operator.', 'unauthenticated');
      audit(o.name, 'Sign in', 'Operator console', 'Signed in through PAM session.');
      emit();
      return later(o);
    },
    listTenants: () => later(tenants),
    getTenant: (id) => later(tenants.find((t) => t.id === id)),
    capacity() {
      const regions: RegionId[] = ['in-west', 'in-south'];
      return later(
        regions.map((r) => {
          const base = structuredClone(INSTALLED[r]);
          for (const t of tenants.filter((x) => x.primaryRegion === r && x.status !== 'onboarding')) {
            const computeOn = t.status === 'active';
            base.vcpu.allocated += computeOn ? t.usage.vcpu : 0;
            base.ramGb.allocated += computeOn ? t.usage.ramGb : 0;
            base.gpus.allocated += computeOn ? t.usage.gpus : 0;
            base.blockTb.allocated += t.usage.storageGb / 1000;
            base.objectTb.allocated += t.objectTb;
          }
          base.blockTb.allocated = Math.round(base.blockTb.allocated * 10) / 10;
          base.objectTb.allocated = Math.round(base.objectTb.allocated * 10) / 10;
          return { region: r, ...base, weeklyGrowth: r === 'in-west' ? 0.025 : 0.018 };
        }),
      );
    },
    health: () => later(health),
    listFailedWorkflows: () => later(workflows),
    async retryWorkflow(op, id) {
      if (!access(op).canRetry) throw problem(403, 'Not permitted', 'Your role cannot retry platform workflows.', 'forbidden');
      const wf = workflows.find((w) => w.id === id);
      if (!wf) throw problem(404, 'Not found', 'Workflow not found.', 'not-found');
      if (wf.status === 'retrying' || wf.status === 'resolved') throw problem(409, 'Nothing to retry', `This workflow is already ${wf.status}.`, 'invalid-state');
      wf.status = 'retrying';
      wf.attempts += 1;
      audit(op.name, 'Retry workflow', wf.tenantName, `${wf.action} (${wf.resource}), attempt ${wf.attempts}.`);
      emit();
      setTimeout(() => {
        wf.status = 'resolved';
        audit('Workflow engine', 'Workflow completed', wf.tenantName, `${wf.action} (${wf.resource}) succeeded after retry.`);
        emit();
      }, delay);
      return later(wf);
    },
    listChangeRequests: () => later([...changes].reverse()),
    async requestChange(op, req) {
      if (!access(op).canRequest.includes(req.kind)) throw problem(403, 'Not permitted', `Your role cannot request "${req.kind}".`, 'forbidden');
      if (!req.reason?.trim()) throw problem(400, 'Reason required', 'Every change needs a reason for the audit log.', 'validation');
      let tenant: Tenant | undefined;
      if (req.kind !== 'onboard') {
        tenant = tenants.find((t) => t.id === req.tenantId);
        if (!tenant) throw problem(404, 'Not found', 'Tenant not found.', 'not-found');
        if (changes.some((c) => c.status === 'pending' && c.tenantId === tenant!.id && c.kind === req.kind))
          throw problem(409, 'Already requested', `A ${req.kind} request for ${tenant.name} is already waiting for approval.`, 'conflict');
      }
      let summary = '';
      if (req.kind === 'quota') {
        const q = req.quota;
        if (!q) throw problem(400, 'Quota required', 'Give the new limits.', 'validation');
        const below = (Object.keys(q) as (keyof UsageLine)[]).filter((k) => q[k] < tenant!.usage[k]);
        if (below.length) throw problem(422, 'Below current usage', `New limits are below what ${tenant!.name} already uses: ${below.join(', ')}.`, 'quota-below-usage');
        summary = (Object.keys(q) as (keyof UsageLine)[])
          .filter((k) => q[k] !== tenant!.quota[k])
          .map((k) => `${{ vcpu: 'vCPUs', ramGb: 'RAM (GB)', storageGb: 'Storage (GB)', gpus: 'GPUs' }[k]} ${tenant!.quota[k].toLocaleString('en-IN')} → ${q[k].toLocaleString('en-IN')}`)
          .join(', ');
        if (!summary) throw problem(400, 'No change', 'The new limits are the same as the current ones.', 'validation');
      } else if (req.kind === 'suspend') {
        if (tenant!.status !== 'active') throw problem(409, 'Not active', `${tenant!.name} is ${tenant!.status}.`, 'invalid-state');
        summary = 'Suspend tenant';
      } else if (req.kind === 'reactivate') {
        if (tenant!.status !== 'suspended') throw problem(409, 'Not suspended', `${tenant!.name} is ${tenant!.status}.`, 'invalid-state');
        summary = 'Reactivate tenant';
      } else {
        const o = req.onboard;
        if (!o?.name.trim() || !/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(o.gstin) || !/^\S+@\S+\.\S+$/.test(o.adminEmail))
          throw problem(400, 'Check the details', 'Give a name, a valid 15-character GSTIN and the tenant admin’s email.', 'validation');
        if (tenants.some((t) => t.name.toLowerCase() === o.name.trim().toLowerCase()))
          throw problem(409, 'Already a tenant', `${o.name} is already enrolled.`, 'conflict');
        summary = `Onboard ${o.kind} tenant (${o.realm} realm, ${o.region === 'in-west' ? 'India-West' : 'India-South'})`;
      }
      const c: ChangeRequest = {
        id: nextId('chg'), kind: req.kind, tenantId: tenant?.id, tenantName: tenant?.name ?? req.onboard!.name.trim(), summary, reason: req.reason.trim(),
        requestedBy: op.id, requestedByName: op.name, requestedAt: new Date().toISOString(), status: 'pending', quota: req.quota, onboard: req.onboard,
      };
      changes.push(c);
      audit(op.name, `Request ${req.kind}`, c.tenantName, `${summary}. Reason: ${c.reason}`);
      emit();
      return later(c);
    },
    async decideChange(op, id, approve) {
      const c = changes.find((x) => x.id === id);
      if (!c || c.status !== 'pending') throw problem(409, 'Nothing to decide', 'This request is not waiting for approval.', 'invalid-state');
      if (!access(op).canApprove) throw problem(403, 'Not an approver', 'Only a platform admin can approve changes.', 'forbidden');
      if (c.requestedBy === op.id) throw problem(403, 'Four-eyes rule', 'You cannot approve a request you made yourself.', 'separation-of-duties');
      c.status = approve ? 'approved' : 'rejected';
      c.decidedBy = op.name;
      c.decidedAt = new Date().toISOString();
      if (approve) {
        const t = tenants.find((x) => x.id === c.tenantId);
        if (c.kind === 'quota' && t && c.quota) t.quota = { ...c.quota };
        if (c.kind === 'suspend' && t) {
          t.status = 'suspended';
          t.monthly = priceOf({ ...t.usage, objectTb: t.objectTb }, true).monthly;
        }
        if (c.kind === 'reactivate' && t) {
          t.status = 'active';
          t.monthly = priceOf({ ...t.usage, objectTb: t.objectTb }).monthly;
        }
        if (c.kind === 'onboard' && c.onboard) {
          const n = tenants.length;
          const created = buildTenant(
            { name: c.onboard.name, kind: c.onboard.kind, realm: c.onboard.realm, status: 'onboarding', kyc: 'pending', region: c.onboard.region, monthsAgo: 0, vcpu: 0, gpus: 0, users: 1, projects: [], state: c.onboard.gstin.slice(0, 2) },
            n,
          );
          created.gstin = c.onboard.gstin;
          created.adminEmail = c.onboard.adminEmail;
          created.joinedAt = new Date().toISOString();
          tenants.push(created);
          c.tenantId = created.id;
        }
      }
      const effect = !approve
        ? 'No change made.'
        : c.kind === 'quota'
          ? 'New limits in force.'
          : c.kind === 'suspend'
            ? 'Tenant suspended; workloads shut down, data retained, sign-in limited to billing.'
            : c.kind === 'reactivate'
              ? 'Tenant reactivated.'
              : 'Tenant created; invitation sent to the tenant admin; KYC pending.';
      audit(op.name, `${approve ? 'Approve' : 'Reject'} ${c.kind}`, c.tenantName, `${c.summary}. ${effect}`);
      emit();
      return later(c);
    },
    audit: () => later([...auditLog].reverse()),
    subscribe(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}

/** Verifies the hash chain, as an auditor would. */
export function verifyChain(entriesNewestFirst: AuditEntry[]): boolean {
  const asc = [...entriesNewestFirst].sort((a, b) => a.seq - b.seq);
  return asc.every((e, i) => {
    const prev = i === 0 ? '0'.repeat(16) : asc[i - 1]!.hash;
    return e.prevHash === prev && e.hash === fnv(`${prev}|${e.seq}|${e.at}|${e.actor}|${e.action}|${e.target}|${e.detail}`);
  });
}

export const opsApi = createOpsMock();
