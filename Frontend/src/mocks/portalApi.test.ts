import { createMockApi } from './portalApi';
import { ProblemError, type User } from '@/shared/api/types';

const vm = (name: string, flavour = 's.small') => ({
  name,
  image: 'ubuntu-24.04',
  flavour,
  volumeGb: 50,
  volumeType: 'standard',
  publicIp: false,
  backupPolicy: 'daily-7',
});

async function users(api: ReturnType<typeof createMockApi>) {
  const all = await api.listUsers();
  const by = (id: string) => all.find((u) => u.id === id) as User;
  return { ravi: by('u-ravi'), meera: by('u-meera') };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('mock CMP API', () => {
  it('provisions a small VM asynchronously and moves quota from reserved to used', async () => {
    const api = createMockApi({ delayMs: 20, latencyMs: 0 });
    const { ravi } = await users(api);
    const { resource, operation } = await api.createResource(ravi, 'prj-1', 'vm-linux', vm('web-1'), 'k1');
    expect(resource.status).toBe('provisioning');
    expect(operation.status).toBe('running');
    expect((await api.getQuota('prj-1')).vcpu).toMatchObject({ used: 0, reserved: 2 });
    await wait(40);
    const [r] = await api.listResources('prj-1');
    expect(r?.status).toBe('active');
    expect((await api.getQuota('prj-1')).vcpu).toMatchObject({ used: 2, reserved: 0 });
  });

  it('never creates two resources for the same idempotency key', async () => {
    const api = createMockApi({ delayMs: 20, latencyMs: 0 });
    const { ravi } = await users(api);
    await api.createResource(ravi, 'prj-1', 'vm-linux', vm('web-1'), 'same');
    await api.createResource(ravi, 'prj-1', 'vm-linux', vm('web-1'), 'same');
    expect(await api.listResources('prj-1')).toHaveLength(1);
  });

  it('requires approval for GPU sizes and enforces separation of duties', async () => {
    const api = createMockApi({ delayMs: 20, latencyMs: 0 });
    const { ravi, meera } = await users(api);
    const { operation } = await api.createResource(meera, 'prj-1', 'vm-linux', vm('gpu-1', 'g.gpu1'), 'k2');
    expect(operation.status).toBe('awaiting_approval');
    await expect(api.decide(meera, operation.id, true)).rejects.toMatchObject({ problem: { status: 403, title: 'Separation of duties' } });
    await expect(api.decide(ravi, operation.id, true)).rejects.toBeInstanceOf(ProblemError);
  });

  it('releases reserved quota when a request is rejected', async () => {
    const api = createMockApi({ delayMs: 20, latencyMs: 0 });
    const all = await api.listUsers();
    const asha = all.find((u) => u.id === 'u-asha') as User;
    const { ravi } = await users(api);
    const { operation } = await api.createResource(ravi, 'prj-1', 'vm-linux', vm('big-1', 'l.large'), 'k3');
    expect((await api.getQuota('prj-1')).vcpu.reserved).toBe(8);
    await api.decide(asha, operation.id, false);
    expect((await api.getQuota('prj-1')).vcpu.reserved).toBe(0);
  });

  it('returns a problem-details error when quota would be exceeded', async () => {
    const api = createMockApi({ delayMs: 20, latencyMs: 0 });
    const { ravi } = await users(api);
    await api.createResource(ravi, 'prj-1', 'vm-linux', vm('g-1', 'g.gpu1'), 'a');
    await api.createResource(ravi, 'prj-1', 'vm-linux', vm('g-2', 'g.gpu1'), 'b');
    await expect(api.createResource(ravi, 'prj-1', 'vm-linux', vm('g-3', 'g.gpu1'), 'c')).rejects.toMatchObject({
      problem: { status: 422, title: 'Quota exceeded' },
    });
  });
});

describe('managed Kubernetes and PostgreSQL', () => {
  it('counts a dedicated control plane and workers against quota', async () => {
    const api = createMockApi({ delayMs: 20, latencyMs: 0 });
    const { ravi } = await users(api);
    const spec = { name: 'apps-1', version: '1.32', controlPlane: 'dedicated', workerFlavour: 'm.medium', workerCount: 3, publicApi: false };
    const { operation } = await api.createResource(ravi, 'prj-1', 'k8s', spec, 'k8s-1');
    expect(operation.status).toBe('running');
    // 3 workers × 4 vCPU + 3 control-plane nodes × 2 vCPU
    expect((await api.getQuota('prj-1')).vcpu.reserved).toBe(18);
    await wait(60);
    const [cluster] = await api.listResources('prj-1');
    expect(cluster?.status).toBe('active');
    expect(cluster?.endpoint).toMatch(/:6443$/);
  });

  it('requires approval for GPU worker pools', async () => {
    const api = createMockApi({ delayMs: 20, latencyMs: 0 });
    const { ravi } = await users(api);
    const spec = { name: 'ai-1', version: '1.33', controlPlane: 'hosted', workerFlavour: 'g.gpu1', workerCount: 1, publicApi: false };
    const { operation } = await api.createResource(ravi, 'prj-1', 'k8s', spec, 'k8s-2');
    expect(operation.status).toBe('awaiting_approval');
  });

  it('upgrades a cluster and refuses to upgrade one already on the latest version', async () => {
    const api = createMockApi({ delayMs: 20, latencyMs: 0 });
    const { ravi } = await users(api);
    const spec = { name: 'apps-2', version: '1.32', controlPlane: 'hosted', workerFlavour: 's.small', workerCount: 2, publicApi: false };
    const { resource } = await api.createResource(ravi, 'prj-1', 'k8s', spec, 'k8s-3');
    await wait(60);
    await api.runAction(ravi, resource.id, 'upgrade', 'up-1');
    await wait(40);
    expect((await api.listResources('prj-1'))[0]?.spec.version).toBe('1.33');
    await expect(api.runAction(ravi, resource.id, 'upgrade', 'up-2')).rejects.toMatchObject({ problem: { status: 409 } });
  });

  it('sizes an HA database as three instances and only allows failover with replicas', async () => {
    const api = createMockApi({ delayMs: 20, latencyMs: 0 });
    const { ravi } = await users(api);
    const base = { version: '17', size: 'db.small', storageGb: 100, encrypted: true, backupDays: 7 };
    await api.createResource(ravi, 'prj-1', 'pg', { ...base, name: 'orders', topology: 'ha' }, 'pg-1');
    expect((await api.getQuota('prj-1')).volumeGb.reserved).toBe(300);
    const { resource: single } = await api.createResource(ravi, 'prj-1', 'pg', { ...base, name: 'reports', topology: 'single' }, 'pg-2');
    await wait(60);
    await expect(api.runAction(ravi, single.id, 'failover', 'fo-1')).rejects.toMatchObject({ problem: { title: 'No replica to fail over to' } });
  });

  it('rejects actions a service does not offer', async () => {
    const api = createMockApi({ delayMs: 20, latencyMs: 0 });
    const { ravi } = await users(api);
    const { resource } = await api.createResource(ravi, 'prj-1', 'pg', { name: 'x-db', version: '17', size: 'db.small', topology: 'single', storageGb: 20, encrypted: false, backupDays: 7 }, 'pg-3');
    await wait(60);
    await expect(api.runAction(ravi, resource.id, 'snapshot', 's-1')).rejects.toMatchObject({ problem: { status: 400 } });
  });
});

describe('workload lifecycle: shut down, decommission, restore, delete permanently', () => {
  async function activeVm() {
    const api = createMockApi({ delayMs: 20, latencyMs: 0 });
    const all = await api.listUsers();
    const asha = all.find((u) => u.id === 'u-asha') as User;
    const { ravi } = await users(api);
    const { resource } = await api.createResource(ravi, 'prj-1', 'vm-linux', vm('app-1', 'm.medium'), 'c1');
    await wait(40);
    return { api, ravi, asha, id: resource.id };
  }
  const status = async (api: ReturnType<typeof createMockApi>) => (await api.listResources('prj-1'))[0]?.status;

  it('shuts down and starts a workload', async () => {
    const { api, ravi, id } = await activeVm();
    await api.runAction(ravi, id, 'stop', 's1');
    await wait(40);
    expect(await status(api)).toBe('stopped');
    await api.runAction(ravi, id, 'start', 's2');
    await wait(40);
    expect(await status(api)).toBe('active');
  });

  it('decommissioning needs approval from another admin, then releases compute quota but keeps storage', async () => {
    const { api, ravi, asha, id } = await activeVm();
    const op = await api.runAction(ravi, id, 'decommission', 'd1');
    expect(op.status).toBe('awaiting_approval');
    expect((await api.listResources('prj-1'))[0]?.pending?.action).toBe('decommission');
    await expect(api.runAction(ravi, id, 'decommission', 'd2')).rejects.toMatchObject({ problem: { title: 'Request already pending' } });
    await api.decide(asha, op.id, true);
    await wait(40);
    const [r] = await api.listResources('prj-1');
    expect(r?.status).toBe('decommissioned');
    expect(r?.pending).toBeUndefined();
    expect(r?.retentionUntil).toBeDefined();
    let q = await api.getQuota('prj-1');
    expect(q.vcpu.used).toBe(0);
    expect(q.volumeGb.used).toBe(50);
    await api.runAction(ravi, id, 'restore', 'r1');
    await wait(40);
    q = await api.getQuota('prj-1');
    expect(await status(api)).toBe('stopped');
    expect(q.vcpu.used).toBe(4);
  });

  it('a rejected decommission leaves the workload running', async () => {
    const { api, ravi, asha, id } = await activeVm();
    const op = await api.runAction(ravi, id, 'decommission', 'd1');
    await api.decide(asha, op.id, false);
    await wait(40);
    const [r] = await api.listResources('prj-1');
    expect(r?.status).toBe('active');
    expect(r?.pending).toBeUndefined();
  });

  it('permanent deletion only follows decommissioning, needs approval, and an admin cannot approve their own request', async () => {
    const { api, ravi, asha, id } = await activeVm();
    const all = await api.listUsers();
    const meera = all.find((u) => u.id === 'u-meera') as User;
    await expect(api.runAction(asha, id, 'purge', 'p0')).rejects.toMatchObject({ problem: { status: 409 } });
    const d = await api.runAction(ravi, id, 'decommission', 'd1');
    await api.decide(meera, d.id, true);
    await wait(40);
    const p = await api.runAction(asha, id, 'purge', 'p1');
    expect(p.status).toBe('awaiting_approval');
    await expect(api.decide(asha, p.id, true)).rejects.toMatchObject({ problem: { title: 'Separation of duties' } });
    await expect(api.decide(ravi, p.id, true)).rejects.toMatchObject({ problem: { status: 403 } });
    await api.decide(meera, p.id, true);
    await wait(40);
    expect(await api.listResources('prj-1')).toHaveLength(0);
    expect((await api.getQuota('prj-1')).volumeGb.used).toBe(0);
  });
});

describe('storage, regions, tags and IAM', () => {
  it('creates block, file and object storage; object storage reserves no capacity', async () => {
    const api = createMockApi({ delayMs: 20, latencyMs: 0 });
    const { ravi } = await users(api);
    await api.createResource(ravi, 'prj-1', 'block', { name: 'vol-a', sizeGb: 200, volumeType: 'premium', backupPolicy: 'none' }, 'b1');
    await api.createResource(ravi, 'prj-1', 'file', { name: 'share-a', protocol: 'nfs', sizeGb: 500, snapshots: true }, 'f1');
    await api.createResource(ravi, 'prj-1', 'object', { name: 'bucket-a', versioning: true, objectLock: false, retentionDays: 30 }, 'o1', { region: 'in-south' });
    expect((await api.getQuota('prj-1')).volumeGb.reserved).toBe(700);
    await wait(40);
    const list = await api.listResources('prj-1');
    expect(list.every((r) => r.status === 'active')).toBe(true);
    const bucket = list.find((r) => r.name === 'bucket-a')!;
    expect(bucket.region).toBe('in-south');
    expect(bucket.endpoint).toContain('in-south');
    await expect(api.runAction(ravi, bucket.id, 'stop', 's1')).rejects.toMatchObject({ problem: { status: 400 } });
  });

  it('keeps the region, description and tags given at creation', async () => {
    const api = createMockApi({ delayMs: 20, latencyMs: 0 });
    const { ravi } = await users(api);
    const { resource } = await api.createResource(ravi, 'prj-1', 'vm-linux', vm('tagged-1'), 't1', { region: 'in-west', description: 'Portal', tags: { environment: 'test' } });
    expect(resource).toMatchObject({ region: 'in-west', description: 'Portal', tags: { environment: 'test' } });
    expect(resource.id).toMatch(/^vm-[0-9a-f]{7}$/);
  });

  it('lists tenant members and lets only admins invite', async () => {
    const api = createMockApi({ delayMs: 20, latencyMs: 0 });
    const { ravi, meera } = await users(api);
    expect((await api.listMembers('org-1')).length).toBeGreaterThan(3);
    await expect(api.inviteMember(ravi, 'org-1', { name: 'X', email: 'x@example.in', role: 'project-reader' })).rejects.toMatchObject({ problem: { status: 403 } });
    const m = await api.inviteMember(meera, 'org-1', { name: 'X', email: 'x@example.in', role: 'project-reader' });
    expect(m.status).toBe('invited');
    await expect(api.inviteMember(meera, 'org-1', { name: 'X', email: 'x@example.in', role: 'project-reader' })).rejects.toMatchObject({ problem: { status: 409 } });
  });
});
