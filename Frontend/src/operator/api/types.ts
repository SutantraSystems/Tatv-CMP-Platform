/**
 * Operator API contract (/operator/v1). Published only on the internal gateway; never on the public one.
 * Operators see tenant metadata and usage, never the data inside tenants' workloads.
 */
import type { RegionId } from '../../api/types';

/** Draft operator roles; final split follows the agreed RACI matrix. */
export type OperatorRole = 'platform-admin' | 'platform-operator' | 'business-admin';
export type Team = 'sutantra' | 'partner';

export interface Operator {
  id: string;
  name: string;
  email: string;
  team: Team;
  role: OperatorRole;
}

export type TenantKind = 'commercial' | 'government' | 'regulated';
export type TenantStatus = 'active' | 'suspended' | 'onboarding';
export type KycStatus = 'verified' | 'pending' | 'expired';

export interface UsageLine {
  vcpu: number;
  ramGb: number;
  storageGb: number;
  gpus: number;
}

export interface ProjectUsage extends UsageLine {
  name: string;
  resources: number;
  monthly: number;
}

export interface Invoice {
  id: string;
  month: string;
  amount: number;
  status: 'paid' | 'due' | 'overdue';
}

export const SERVICES = ['Compute', 'Kubernetes', 'Databases', 'Storage', 'GPU', 'Backup', 'Marketplace'] as const;
export type Service = (typeof SERVICES)[number];

export interface Tenant {
  id: string;
  name: string;
  kind: TenantKind;
  /** Keycloak placement: shared realm (Organization) or a dedicated realm. */
  realm: 'shared' | 'dedicated';
  status: TenantStatus;
  kyc: KycStatus;
  gstin: string;
  joinedAt: string;
  primaryRegion: RegionId;
  adminEmail: string;
  users: number;
  quota: UsageLine;
  usage: UsageLine;
  objectTb: number;
  /** Current run rate, ₹ per month (indicative, excluding GST). */
  monthly: number;
  /** Spend for the last six months, oldest first. */
  history: number[];
  byService: Record<Service, number>;
  projects: ProjectUsage[];
  invoices: Invoice[];
}

export interface RegionCapacity {
  region: RegionId;
  hosts: number;
  vcpu: { allocated: number; installed: number };
  ramGb: { allocated: number; installed: number };
  blockTb: { allocated: number; installed: number };
  objectTb: { allocated: number; installed: number };
  gpus: { allocated: number; installed: number };
  /** Weekly growth in allocation, as a fraction. */
  weeklyGrowth: number;
}

export type Health = 'operational' | 'degraded' | 'outage';
export interface ServiceHealth {
  name: string;
  group: 'Control plane' | 'India-West' | 'India-South';
  status: Health;
  note?: string;
}

export interface FailedWorkflow {
  id: string;
  tenantId: string;
  tenantName: string;
  action: string;
  resource: string;
  error: string;
  startedAt: string;
  attempts: number;
  status: 'failed' | 'stuck' | 'retrying' | 'resolved';
}

export type ChangeKind = 'quota' | 'suspend' | 'reactivate' | 'onboard';
export interface ChangeRequest {
  id: string;
  kind: ChangeKind;
  tenantId?: string;
  tenantName: string;
  summary: string;
  reason: string;
  requestedBy: string;
  requestedByName: string;
  requestedAt: string;
  status: 'pending' | 'approved' | 'rejected';
  decidedBy?: string;
  decidedAt?: string;
  /** For quota changes: the new limits. */
  quota?: UsageLine;
  /** For onboarding: the tenant to create. */
  onboard?: { name: string; kind: TenantKind; gstin: string; adminEmail: string; region: RegionId; realm: 'shared' | 'dedicated' };
}

export interface AuditEntry {
  seq: number;
  at: string;
  actor: string;
  action: string;
  target: string;
  detail: string;
  /** Hash of this entry chained to the previous one (HSM-signed in production). */
  hash: string;
  prevHash: string;
}

export interface OpsApi {
  listOperators(): Promise<Operator[]>;
  signIn(id: string): Promise<Operator>;
  listTenants(): Promise<Tenant[]>;
  getTenant(id: string): Promise<Tenant | undefined>;
  capacity(): Promise<RegionCapacity[]>;
  health(): Promise<ServiceHealth[]>;
  listFailedWorkflows(): Promise<FailedWorkflow[]>;
  retryWorkflow(op: Operator, id: string): Promise<FailedWorkflow>;
  listChangeRequests(): Promise<ChangeRequest[]>;
  requestChange(op: Operator, req: Pick<ChangeRequest, 'kind' | 'tenantId' | 'reason' | 'quota' | 'onboard'>): Promise<ChangeRequest>;
  decideChange(op: Operator, id: string, approve: boolean): Promise<ChangeRequest>;
  audit(): Promise<AuditEntry[]>;
  subscribe(listener: () => void): () => void;
}

/** What each role may see and do (draft; follows the RACI once agreed). */
export const ACCESS: Record<OperatorRole, { pages: string[]; canRequest: ChangeKind[]; canApprove: boolean; canRetry: boolean; seesRevenue: boolean }> = {
  'platform-admin': {
    pages: ['overview', 'tenants', 'capacity', 'revenue', 'operations', 'monitoring', 'approvals', 'audit', 'onboard'],
    canRequest: ['quota', 'suspend', 'reactivate', 'onboard'],
    canApprove: true,
    canRetry: true,
    seesRevenue: true,
  },
  'platform-operator': {
    pages: ['overview', 'tenants', 'capacity', 'operations', 'monitoring', 'approvals', 'audit'],
    canRequest: ['quota', 'suspend', 'reactivate'],
    canApprove: false,
    canRetry: true,
    seesRevenue: false,
  },
  'business-admin': {
    pages: ['overview', 'tenants', 'revenue', 'approvals', 'onboard'],
    canRequest: ['quota', 'suspend', 'reactivate', 'onboard'],
    canApprove: false,
    canRetry: false,
    seesRevenue: true,
  },
};

export const ROLE_NAMES: Record<OperatorRole, string> = {
  'platform-admin': 'Platform admin',
  'platform-operator': 'Platform operator (L2/L3)',
  'business-admin': 'Partner business admin',
};
