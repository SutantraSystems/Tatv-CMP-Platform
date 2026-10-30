import { ProblemError } from '@/shared/api/types';
import { createOpsMock, verifyChain } from './operatorApi';
import type { Operator } from '@/shared/api/operatorTypes';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function setup() {
  const api = createOpsMock({ latencyMs: 0, delayMs: 20 });
  const ops = await api.listOperators();
  const by = (id: string) => ops.find((o) => o.id === id) as Operator;
  return { api, vikram: by('op-vikram'), anita: by('op-anita'), priya: by('op-priya'), rahul: by('op-rahul') };
}

describe('operator API', () => {
  it('lists enrolled tenants with usage, quota and indicative INR spend', async () => {
    const { api } = await setup();
    const tenants = await api.listTenants();
    expect(tenants.length).toBeGreaterThan(10);
    const indus = tenants.find((t) => t.name === 'Indus AI Research Lab')!;
    expect(indus.usage.gpus).toBe(8);
    expect(indus.monthly).toBeGreaterThan(8 * 120000);
    expect(tenants.find((t) => t.status === 'suspended')?.invoices.some((i) => i.status === 'overdue')).toBe(true);
  });

  it('applies the four-eyes rule: requester cannot approve, operators and partner staff cannot approve', async () => {
    const { api, vikram, anita, priya, rahul } = await setup();
    const kaveri = (await api.listTenants()).find((t) => t.name === 'Kaveri Logistics Pvt Ltd')!;
    const c = await api.requestChange(vikram, { kind: 'suspend', tenantId: kaveri.id, reason: 'Test' });
    await expect(api.decideChange(vikram, c.id, true)).rejects.toMatchObject({ problem: { title: 'Four-eyes rule' } });
    await expect(api.decideChange(priya, c.id, true)).rejects.toMatchObject({ problem: { status: 403 } });
    await expect(api.decideChange(rahul, c.id, true)).rejects.toMatchObject({ problem: { status: 403 } });
    await api.decideChange(anita, c.id, true);
    expect((await api.getTenant(kaveri.id))?.status).toBe('suspended');
  });

  it('refuses quota below current usage and duplicate pending requests', async () => {
    const { api, priya } = await setup();
    const t = (await api.listTenants()).find((x) => x.name === 'Vidya Learning Pvt Ltd')!;
    await expect(api.requestChange(priya, { kind: 'quota', tenantId: t.id, reason: 'x', quota: { ...t.quota, vcpu: 10 } })).rejects.toMatchObject({ problem: { status: 422 } });
    await api.requestChange(priya, { kind: 'quota', tenantId: t.id, reason: 'x', quota: { ...t.quota, vcpu: t.quota.vcpu + 32 } });
    await expect(api.requestChange(priya, { kind: 'quota', tenantId: t.id, reason: 'x', quota: { ...t.quota, vcpu: t.quota.vcpu + 64 } })).rejects.toMatchObject({ problem: { status: 409 } });
  });

  it('onboards a tenant only after approval and validates the GSTIN', async () => {
    const { api, rahul, vikram } = await setup();
    const base = { kind: 'commercial' as const, adminEmail: 'admin@new.example.in', region: 'in-west' as const, realm: 'shared' as const };
    await expect(api.requestChange(rahul, { kind: 'onboard', reason: 'x', onboard: { ...base, name: 'New Co', gstin: 'BAD' } })).rejects.toBeInstanceOf(ProblemError);
    const before = (await api.listTenants()).length;
    const c = await api.requestChange(rahul, { kind: 'onboard', reason: 'Signed order', onboard: { ...base, name: 'New Co', gstin: '27AABCN1234K1Z5' } });
    expect((await api.listTenants()).length).toBe(before);
    await api.decideChange(vikram, c.id, true);
    const created = (await api.listTenants()).find((t) => t.name === 'New Co');
    expect(created).toMatchObject({ status: 'onboarding', kyc: 'pending', gstin: '27AABCN1234K1Z5' });
  });

  it('lets platform staff retry failed workflows but not partner business staff', async () => {
    const { api, priya, rahul } = await setup();
    const [wf] = await api.listFailedWorkflows();
    await expect(api.retryWorkflow(rahul, wf!.id)).rejects.toMatchObject({ problem: { status: 403 } });
    await api.retryWorkflow(priya, wf!.id);
    await wait(40);
    expect((await api.listFailedWorkflows()).find((w) => w.id === wf!.id)?.status).toBe('resolved');
  });

  it('writes every action to a hash chain that verifies, and detects tampering', async () => {
    const { api, priya, anita } = await setup();
    const t = (await api.listTenants())[0]!;
    const c = await api.requestChange(priya, { kind: 'quota', tenantId: t.id, reason: 'Growth', quota: { ...t.quota, vcpu: t.quota.vcpu + 16 } });
    await api.decideChange(anita, c.id, false);
    const log = await api.audit();
    expect(log[0]?.action).toBe('Reject quota');
    expect(verifyChain(log)).toBe(true);
    const tampered = log.map((e) => (e.seq === 2 ? { ...e, detail: 'edited' } : e));
    expect(verifyChain(tampered)).toBe(false);
  });

  it('computes capacity per region from tenant allocation', async () => {
    const { api } = await setup();
    const cap = await api.capacity();
    const west = cap.find((c) => c.region === 'in-west')!;
    expect(west.vcpu.allocated).toBeGreaterThan(0);
    expect(west.vcpu.allocated).toBeLessThan(west.vcpu.installed);
    expect(west.gpus.allocated).toBe(10);
  });
});
