export type Role =
  | 'org-owner'
  | 'org-admin'
  | 'billing-admin'
  | 'auditor'
  | 'project-admin'
  | 'project-operator'
  | 'project-reader';

export interface User {
  id: string;
  name: string;
  email: string;
  /** Roles by organisation id. */
  roles: Record<string, Role[]>;
}

/** Regions are fixed by the platform; zone placement inside a region is automatic for now. */
export type RegionId = 'in-west' | 'in-south';
export interface Region {
  id: RegionId;
  name: string;
  description: string;
}

/** An organisation is a tenant: the customer account that owns projects, users and the bill. */
export interface Organisation {
  id: string;
  name: string;
  kind: 'commercial' | 'government';
  verified: boolean;
}

export interface Project {
  id: string;
  organisationId: string;
  name: string;
}

/** Minimal JSON Schema subset the catalog uses for its parameter forms. */
export interface FieldSchema {
  type: 'string' | 'integer' | 'boolean';
  title: string;
  description?: string;
  enum?: string[];
  /** Display labels for `enum` values (same order). */
  'x-enumLabels'?: string[];
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  default?: string | number | boolean;
  'x-section'?: string;
  'x-widget'?: 'cards' | 'stepper';
  'x-enumHints'?: string[];
  'x-enumBadges'?: (string | null)[];
}

export interface ObjectSchema {
  type: 'object';
  required?: string[];
  properties: Record<string, FieldSchema>;
}

/** Which list page and adapter a catalog item belongs to. */
export type ResourceKind = 'vm' | 'k8s' | 'db' | 'storage';

/** Top-level service catalog categories. */
export type ServiceCategory = 'network' | 'compute' | 'storage' | 'databases' | 'ai' | 'protection';

export interface CatalogItem {
  id: string;
  name: string;
  category: ServiceCategory;
  group: string;
  description: string;
  publisher: string;
  kind?: ResourceKind;
  available: boolean;
  schema?: ObjectSchema;
  day2: Day2Action[];
  approvalRule?: string;
  powerControl?: boolean;
  preset?: { itemId: string; values: Record<string, string | number | boolean> };
}

/** Actions offered by specific catalog items. */
export type Day2Action = 'reboot' | 'snapshot' | 'backup' | 'upgrade' | 'failover';

export type LifecycleAction = 'stop' | 'start' | 'decommission' | 'restore' | 'purge';

/** Changing the number of read replicas on a database (its own endpoint, since it carries a count). */
export type ScaleAction = 'scale-replicas';

export type Action = Day2Action | LifecycleAction | ScaleAction;

/** Lifecycle actions that always need approval from an organisation admin other than the requester. */
export const APPROVAL_ACTIONS: Action[] = ['decommission', 'purge'];

/** How a pending request is named in messages. */
export const PENDING_NAME: Partial<Record<Action, string>> = { decommission: 'Decommission', purge: 'Permanent deletion', 'scale-replicas': 'Read replica change' };

/** Days a decommissioned workload stays restorable before automatic permanent deletion. */
export const RETENTION_DAYS = 7;

export type ResourceStatus =
  | 'awaiting_approval'
  | 'provisioning'
  | 'active'
  | 'stopping'
  | 'stopped'
  | 'starting'
  | 'upgrading'
  | 'failing_over'
  | 'scaling'
  | 'deleting'
  | 'decommissioning'
  | 'decommissioned'
  | 'restoring'
  | 'purging'
  | 'deleted'
  | 'rejected'
  | 'error';

export interface Resource {
  id: string;
  projectId: string;
  catalogItemId: string;
  name: string;
  status: ResourceStatus;
  spec: Record<string, string | number | boolean>;
  region: RegionId;
  description?: string;
  tags: Record<string, string>;
  createdAt: string;
  createdBy: string;
  addresses?: { private: string; public?: string };
  /** Connection endpoint for clusters and databases (read-write for databases). */
  endpoint?: string;
  /** Databases: read-only endpoint spread across standbys and read replicas. */
  readEndpoint?: string;
  /** Set while decommissioned: the end of the retention hold. */
  retentionUntil?: string;
  /** A lifecycle request (decommission or permanent delete) waiting for approval. */
  pending?: { action: Action; operationId: string; requestedBy: string };
}

/** A user's membership of a tenant, as shown on the IAM page. */
export interface Member {
  userId: string;
  name: string;
  email: string;
  roles: Role[];
  /** Project ids the roles apply to; empty means every project in the tenant. */
  projects: string[];
  status: 'active' | 'invited';
  mfa: boolean;
  source: 'local' | 'federated';
  lastSignIn?: string;
}

export interface CreateMeta {
  region: RegionId;
  description?: string;
  tags?: Record<string, string>;
}

export type OperationStatus = 'awaiting_approval' | 'running' | 'succeeded' | 'failed' | 'rejected';

/** A long-running request, as returned with HTTP 202. */
export interface Operation {
  id: string;
  projectId: string;
  resourceId: string;
  resourceName: string;
  action: 'create' | Action;
  status: OperationStatus;
  requestedBy: string;
  requestedAt: string;
  finishedAt?: string;
  approvedBy?: string;
  message?: string;
  /** For scale-replicas: the change requested. */
  replicas?: { from: number; to: number };
}

export interface QuotaLine {
  used: number;
  reserved: number;
  limit: number;
}

export interface Quota {
  vcpu: QuotaLine;
  ramGb: QuotaLine;
  volumeGb: QuotaLine;
  gpus: QuotaLine;
  publicIps: QuotaLine;
}

/** RFC 9457 problem details, used for every API error including policy denials. */
export interface Problem {
  type: string;
  title: string;
  status: number;
  detail: string;
}

export class ProblemError extends Error {
  readonly problem: Problem;
  constructor(problem: Problem) {
    super(problem.detail);
    this.problem = problem;
  }
}

export interface Accepted {
  resource: Resource;
  operation: Operation;
}

/** The client surface the portal depends on; the mock and the real HTTP client both implement it. */
export interface CmpApi {
  signIn(userId: string): Promise<User>;
  listUsers(): Promise<User[]>;
  listOrganisations(user: User): Promise<Organisation[]>;
  listProjects(organisationId: string): Promise<Project[]>;
  listRegions(): Promise<Region[]>;
  listMembers(organisationId: string): Promise<Member[]>;
  inviteMember(user: User, organisationId: string, invite: { name: string; email: string; role: Role }): Promise<Member>;
  getCatalog(): Promise<CatalogItem[]>;
  getQuota(projectId: string): Promise<Quota>;
  listResources(projectId: string): Promise<Resource[]>;
  listOperations(projectId: string): Promise<Operation[]>;
  createResource(
    user: User,
    projectId: string,
    catalogItemId: string,
    params: Record<string, string | number | boolean>,
    idempotencyKey: string,
    meta?: CreateMeta,
  ): Promise<Accepted>;
  runAction(user: User, resourceId: string, action: Action, idempotencyKey: string): Promise<Operation>;
  updateTags(user: User, resourceId: string, tags: Record<string, string>): Promise<Resource>;
  /** Databases: change the number of read replicas (more than the approval limit waits for an admin). */
  setReadReplicas(user: User, resourceId: string, count: number, idempotencyKey: string): Promise<Operation>;
  decide(user: User, operationId: string, approve: boolean): Promise<Operation>;
  subscribe(listener: () => void): () => void;
}
