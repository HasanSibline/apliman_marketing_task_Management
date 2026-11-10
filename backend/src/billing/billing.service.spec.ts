import { Prisma } from '@prisma/client';
import { BillingService } from './billing.service';

const NOW = new Date('2026-11-10T12:00:00Z');
const day = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

function harness(opts: { companies?: any[]; invoices?: any[]; userCounts?: any[]; plans?: any[] } = {}) {
  const invoices = [...(opts.invoices ?? [])];
  const companyRows = new Map((opts.companies ?? []).map((c) => [c.id, { ...c }]));
  const history: any[] = [];

  const prisma: any = {
    company: {
      findMany: jest.fn(async () => [...companyRows.values()]),
      findUnique: jest.fn(async ({ where }: any) => companyRows.get(where.id) ?? null),
      update: jest.fn(async ({ where, data }: any) => Object.assign(companyRows.get(where.id), data)),
    },
    user: {
      groupBy: jest.fn(async () => opts.userCounts ?? []),
      findMany: jest.fn(async () => [{ id: 'sa', name: 'System Administrator' }]),
    },
    plan: {
      findMany: jest.fn(async () => opts.plans ?? []),
      findUnique: jest.fn(async ({ where }: any) => (opts.plans ?? []).find((p: any) => p.name === where.name) ?? null),
    },
    invoice: {
      findMany: jest.fn(async () => invoices),
      findFirst: jest.fn(async ({ where }: any) => {
        const matching = invoices.filter((i) => i.number.startsWith(where.number.startsWith)).sort((a, b) => b.number.localeCompare(a.number));
        return matching[0] ?? null;
      }),
      aggregate: jest.fn(async () => ({ _sum: { amount: invoices.reduce((s, i) => s + i.amount, 0) || null } })),
      create: jest.fn(async ({ data }: any) => {
        if (invoices.some((i) => i.number === data.number)) {
          throw new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' });
        }
        const row = { id: `inv-${invoices.length + 1}`, createdAt: NOW, currency: 'USD', ...data, company: { name: 'Acme', billingEmail: 'pay@acme.test' } };
        invoices.push(row);
        return row;
      }),
    },
    subscriptionHistory: { create: jest.fn(async ({ data }: any) => history.push(data)) },
  };
  prisma.$transaction = jest.fn(async (fn: any) => fn(prisma));

  const companies: any = { retireUsersOverLimit: jest.fn(async () => ({ retired: [], activeUsers: 3, maxUsers: 3 })) };
  return { service: new BillingService(prisma, companies), prisma, invoices, companyRows, history, companies };
}

const acme = (over: any = {}) => ({
  id: 'acme',
  name: 'Acme',
  slug: 'acme',
  logo: null,
  isActive: true,
  subscriptionStatus: 'ACTIVE',
  subscriptionPlan: 'PRO',
  subscriptionEnd: day(3),
  monthlyPrice: 99,
  billingEmail: 'pay@acme.test',
  maxUsers: null,
  ...over,
});

describe('recordPayment', () => {
  it('numbers invoices per year and extends from the current end', async () => {
    const { service, companyRows } = harness({ companies: [acme({ subscriptionEnd: new Date('2026-11-20T00:00:00Z') })] });

    const first = await service.recordPayment('acme', { amount: 99, months: 1 }, 'sa', NOW);
    expect(first.invoice.number).toBe('INV-2026-0001');
    expect(first.invoice.recordedByName).toBe('System Administrator');
    expect(first.invoice.companyName).toBe('Acme');
    expect(companyRows.get('acme').subscriptionEnd).toEqual(new Date('2026-12-20T00:00:00Z'));
    expect(first.state).toBe('ACTIVE');

    const second = await service.recordPayment('acme', { amount: 198, months: 2 }, 'sa', NOW);
    expect(second.invoice.number).toBe('INV-2026-0002');
    expect(companyRows.get('acme').subscriptionEnd).toEqual(new Date('2027-02-20T00:00:00Z'));
  });

  it('unblocks an expired company by extending from today, not from the old end', async () => {
    const { service, companyRows } = harness({ companies: [acme({ subscriptionEnd: day(-30) })] });
    const { state } = await service.recordPayment('acme', { amount: 99, months: 1 }, 'sa', NOW);
    expect(state).toBe('ACTIVE');
    expect(companyRows.get('acme').subscriptionEnd).toEqual(new Date('2026-12-10T12:00:00Z'));
  });

  it('leaves a suspended company suspended', async () => {
    const { service, companyRows } = harness({ companies: [acme({ subscriptionStatus: 'SUSPENDED', isActive: false })] });
    const { state } = await service.recordPayment('acme', { amount: 99, months: 1 }, 'sa', NOW);
    expect(state).toBe('SUSPENDED');
    expect(companyRows.get('acme').subscriptionStatus).toBe('SUSPENDED');
  });

  it('takes the next number when another payment claimed this one first', async () => {
    const { service, prisma } = harness({ companies: [acme()], invoices: [] });
    // The first lookup misses a number that is taken by the time the insert lands.
    prisma.invoice.findFirst.mockResolvedValueOnce(null);
    prisma.invoice.create.mockImplementationOnce(async () => {
      throw new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' });
    });
    const { invoice } = await service.recordPayment('acme', { amount: 99, months: 1 }, 'sa', NOW);
    expect(invoice.number).toBe('INV-2026-0001');
    expect(prisma.invoice.create).toHaveBeenCalledTimes(2);
  });

  it('records the renewal in the subscription history', async () => {
    const { service, history } = harness({ companies: [acme()] });
    await service.recordPayment('acme', { amount: 99, months: 1, method: 'Bank transfer' }, 'sa', NOW);
    expect(history[0]).toMatchObject({ action: 'RENEWED', amount: 99, performedBy: 'sa' });
  });

  it('converts a trial with its first payment: plan, price and invoice all move to the paid plan', async () => {
    const { service, companyRows, history, companies } = harness({
      companies: [acme({ subscriptionPlan: 'FREE_TRIAL', monthlyPrice: 0, subscriptionEnd: day(2) })],
      plans: [{ name: 'PRO', maxUsers: 25, price: 99 }],
    });
    const { invoice, state } = await service.recordPayment('acme', { amount: 99, months: 1, plan: 'PRO' }, 'sa', NOW);
    expect(invoice.plan).toBe('PRO');
    expect(state).toBe('ACTIVE');
    expect(companyRows.get('acme')).toMatchObject({ subscriptionPlan: 'PRO', monthlyPrice: 99 });
    expect(history.map((h) => h.action)).toEqual(['PLAN_CHANGED', 'RENEWED']);
    // A payment never deactivates anyone; over-limit is left to Apply limit.
    expect(companies.retireUsersOverLimit).not.toHaveBeenCalled();
  });

  it('refuses a plan that does not exist, before recording anything', async () => {
    const { service, invoices } = harness({ companies: [acme()], plans: [] });
    await expect(service.recordPayment('acme', { amount: 1, months: 1, plan: 'GOLD' }, 'sa', NOW)).rejects.toThrow(
      'There is no plan called GOLD.',
    );
    expect(invoices).toHaveLength(0);
  });

  it('keeps the plan when the payment names the one the company is already on', async () => {
    const { service, companyRows, companies } = harness({ companies: [acme()] });
    await service.recordPayment('acme', { amount: 99, months: 1, plan: 'PRO' }, 'sa', NOW);
    expect(companyRows.get('acme').subscriptionPlan).toBe('PRO');
    expect(companies.retireUsersOverLimit).not.toHaveBeenCalled();
  });

  it('refuses an unknown company', async () => {
    const { service } = harness();
    await expect(service.recordPayment('nope', { amount: 1, months: 1 }, 'sa', NOW)).rejects.toThrow('Company not found');
  });
});

describe('overview', () => {
  it('reports state, users against the plan limit, and orders the urgent first', async () => {
    const { service } = harness({
      companies: [
        acme({ id: 'fine', name: 'Fine', subscriptionEnd: day(60) }),
        acme({ id: 'late', name: 'Late', subscriptionEnd: day(-10) }),
        acme({ id: 'trial', name: 'Trial', subscriptionPlan: 'FREE_TRIAL', subscriptionEnd: day(5) }),
        acme({ id: 'ent', name: 'Ent', subscriptionPlan: 'ENTERPRISE', subscriptionEnd: day(200) }),
      ],
      userCounts: [
        { companyId: 'trial', _count: { _all: 5 } },
        { companyId: 'ent', _count: { _all: 400 } },
      ],
      plans: [
        { name: 'FREE_TRIAL', maxUsers: 3 },
        { name: 'PRO', maxUsers: 25 },
        { name: 'ENTERPRISE', maxUsers: -1 },
      ],
    });

    const { summary, companies } = await service.overview(NOW);

    expect(companies.map((c) => c.id)).toEqual(['late', 'trial', 'fine', 'ent']);
    const trial = companies.find((c) => c.id === 'trial')!;
    expect(trial).toMatchObject({ state: 'TRIAL', activeUsers: 5, maxUsers: 3, overLimitBy: 2 });
    expect(companies.find((c) => c.id === 'ent')).toMatchObject({ maxUsers: -1, overLimitBy: 0 });
    expect(companies.find((c) => c.id === 'late')).toMatchObject({ state: 'EXPIRED', blocked: true });
    expect(summary).toMatchObject({ expired: 1, trial: 1, overLimit: 1, needsAttention: 2 });
  });

  it('prefers a company’s own limit over its plan’s', async () => {
    const { service } = harness({
      companies: [acme({ maxUsers: 200, subscriptionPlan: 'ENTERPRISE' })],
      userCounts: [{ companyId: 'acme', _count: { _all: 2 } }],
      plans: [{ name: 'ENTERPRISE', maxUsers: -1 }],
    });
    const { companies } = await service.overview(NOW);
    expect(companies[0]).toMatchObject({ maxUsers: 200, overLimitBy: 0 });
  });
});
