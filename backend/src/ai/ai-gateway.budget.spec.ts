import { Logger } from '@nestjs/common';
import { AiGatewayService, AiUnavailableError } from './ai-gateway.service';
import { costOf } from './ai-cost';

/**
 * The budget ceiling, end to end.
 *
 * provider-chain.spec.ts already proves withinBudget excludes an over-spent entry when
 * it is handed one. It never was handed one: nothing wrote estimatedCost, so
 * spentThisMonth was zero on every entry forever and the ceiling was decoration. These
 * tests cover the join, which is the part that was broken: a call is priced, the price
 * is written, the next call reads it back, and the entry drops out of the chain.
 */

const COMPANY = 'company-1';

interface FakeConfig {
  id: string;
  provider: string;
  model: string | null;
  priority: number;
  enabled: boolean;
  isEmergency: boolean;
  monthlyBudget: number | null;
  status: string;
  cooldownUntil: Date | null;
  createdAt: Date;
  encryptedKey: string | null;
}

function config(over: Partial<FakeConfig> = {}): FakeConfig {
  return {
    id: 'paid',
    provider: 'anthropic',
    model: 'claude-opus-5',
    priority: 1,
    enabled: true,
    isEmergency: false,
    monthlyBudget: null,
    status: 'HEALTHY',
    cooldownUntil: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    encryptedKey: 'encrypted',
    ...over,
  };
}

/**
 * Just enough Prisma to run the gateway, with the usage table as a real in-memory
 * counter rather than a spy. A stub that only records the last call cannot show that
 * spend accumulates, which is the whole behaviour under test.
 */
function harness(configs: FakeConfig[], spendSoFar: Record<string, number> = {}) {
  const usage: Record<
    string,
    { requests: number; failures: number; inputTokens: number; outputTokens: number; estimatedCost: number }
  > = {};

  for (const [configId, estimatedCost] of Object.entries(spendSoFar)) {
    usage[configId] = { requests: 1, failures: 0, inputTokens: 0, outputTokens: 0, estimatedCost };
  }

  const prisma = {
    company: {
      findUnique: jest.fn(async () => ({
        name: 'Acme',
        aiEnabled: false,
        aiApiKey: null,
        aiProvider: null,
      })),
    },
    aiProviderConfig: {
      findMany: jest.fn(async () => configs),
      findUnique: jest.fn(async ({ where }: any) => {
        const row = configs.find((c) => c.id === where.id);
        return row ? { ...row, companyId: COMPANY, company: { name: 'Acme' } } : null;
      }),
      update: jest.fn(async () => ({})),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    aiProviderUsage: {
      groupBy: jest.fn(async ({ where }: any) => {
        const ids: string[] = where.configId.in;
        return ids
          .filter((id) => usage[id])
          .map((id) => ({ configId: id, _sum: { estimatedCost: usage[id].estimatedCost } }));
      }),
      upsert: jest.fn(async ({ where, create, update }: any) => {
        const id = where.configId_date.configId;
        if (!usage[id]) {
          usage[id] = {
            requests: create.requests,
            failures: create.failures,
            inputTokens: create.inputTokens,
            outputTokens: create.outputTokens,
            estimatedCost: create.estimatedCost,
          };
        } else {
          usage[id].requests += update.requests.increment;
          usage[id].failures += update.failures.increment;
          usage[id].inputTokens += update.inputTokens.increment;
          usage[id].outputTokens += update.outputTokens.increment;
          usage[id].estimatedCost += update.estimatedCost.increment;
        }
        return usage[id];
      }),
    },
    // The record paths hand back unawaited promises to be run together; awaiting them
    // here is the same ordering the real client gives them.
    $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  };

  const companies = { decryptApiKey: jest.fn(() => 'sk-real-key') };
  const gateway = new AiGatewayService(prisma as any, companies as any);

  return { gateway, prisma, usage };
}

beforeAll(() => {
  Logger.overrideLogger(false);
});

describe('writing what a call cost', () => {
  it('records tokens and cost alongside the request counter', async () => {
    const { gateway, usage } = harness([config({ id: 'paid' })]);

    await gateway.execute(COMPANY, async () => ({ summary: 'an answer of some length' }));

    expect(usage.paid.requests).toBe(1);
    expect(usage.paid.inputTokens).toBeGreaterThan(0);
    expect(usage.paid.outputTokens).toBeGreaterThan(0);
    expect(usage.paid.estimatedCost).toBeGreaterThan(0);
  });

  it('accumulates across calls the way the request counter does', async () => {
    const { gateway, usage } = harness([config({ id: 'paid' })]);

    await gateway.execute(COMPANY, async () => ({ summary: 'one' }));
    const afterOne = usage.paid.estimatedCost;
    await gateway.execute(COMPANY, async () => ({ summary: 'two' }));

    expect(usage.paid.requests).toBe(2);
    expect(usage.paid.estimatedCost).toBeCloseTo(afterOne * 2, 9);
    expect(usage.paid.inputTokens).toBeGreaterThan(0);
  });

  /** The migration path: real counts land in the same columns, at the same rates. */
  it('writes the counts the provider itself reported, when it reports any', async () => {
    const { gateway, usage } = harness([config({ id: 'paid' })]);

    await gateway.execute(COMPANY, async () => ({
      summary: 'measured',
      usage: { input_tokens: 12345, output_tokens: 678 },
    }));

    expect(usage.paid.inputTokens).toBe(12345);
    expect(usage.paid.outputTokens).toBe(678);
    expect(usage.paid.estimatedCost).toBe(
      costOf('anthropic', 'claude-opus-5', { inputTokens: 12345, outputTokens: 678 }),
    );
  });

  /** A refusal produced no answer to price, and pricing one would be invention. */
  it('charges nothing for a failed attempt', async () => {
    const { gateway, usage } = harness([config({ id: 'paid' })]);

    await expect(
      gateway.execute(COMPANY, async () => {
        throw new Error('The prompt was blocked by the content filter');
      }),
    ).rejects.toBeInstanceOf(AiUnavailableError);

    expect(usage.paid.failures).toBeGreaterThan(0);
    expect(usage.paid.estimatedCost).toBe(0);
  });
});

describe('the ceiling binding', () => {
  it('reads recorded spend back onto the entry', async () => {
    const { gateway } = harness([config({ id: 'paid', monthlyBudget: 10 })], { paid: 4.25 });

    const [entry] = await gateway.healthFor(COMPANY);

    expect(entry.spentThisMonth).toBe(4.25);
  });

  it('refuses an entry that has spent its budget, instead of running up the bill', async () => {
    const { gateway } = harness([config({ id: 'paid', monthlyBudget: 5 })], { paid: 5.5 });
    const work = jest.fn();

    await expect(gateway.execute(COMPANY, work)).rejects.toMatchObject({
      kind: 'BUDGET_EXHAUSTED',
    });
    expect(work).not.toHaveBeenCalled();
  });

  it('still uses an entry that has room left', async () => {
    const { gateway } = harness([config({ id: 'paid', monthlyBudget: 5 })], { paid: 1.5 });

    await expect(gateway.execute(COMPANY, async () => 'served')).resolves.toBe('served');
  });

  /**
   * The realistic shape of the defect: a free provider is exhausted, the emergency key
   * that costs money picks up the traffic, and the ceiling is the only thing standing
   * between one tenant and an unbounded invoice.
   */
  it('falls through to the emergency entry, then stops when it is spent', async () => {
    const entries = [
      config({ id: 'free', provider: 'groq', model: 'openai/gpt-oss-120b', priority: 1 }),
      config({
        id: 'paid',
        provider: 'anthropic',
        priority: 2,
        isEmergency: true,
        monthlyBudget: 20,
      }),
    ];

    const withRoom = harness(entries, { paid: 19 });
    await expect(
      withRoom.gateway.execute(COMPANY, async (credential) => {
        if (credential.provider === 'groq') throw new Error('429 rate limit exceeded');
        return 'the emergency key answered';
      }),
    ).resolves.toBe('the emergency key answered');

    const spent = harness(entries, { paid: 20 });
    await expect(
      spent.gateway.execute(COMPANY, async (credential) => {
        if (credential.provider === 'groq') throw new Error('429 rate limit exceeded');
        return 'the emergency key answered';
      }),
    ).rejects.toMatchObject({ kind: 'RATE_LIMIT' });
  });

  /**
   * A run of ordinary calls eventually crosses the line on its own. Nothing outside
   * this loop touches the database, which is exactly the situation the ceiling was
   * written for.
   */
  it('closes off an entry by its own accumulated spend', async () => {
    const answer = { text: 'x'.repeat(20000) };
    const { gateway, usage } = harness([
      config({ id: 'paid', monthlyBudget: 0.5, isEmergency: true }),
    ]);

    let served = 0;
    let refusal: AiUnavailableError | null = null;

    for (let i = 0; i < 40; i++) {
      try {
        await gateway.execute(COMPANY, async () => answer);
        served++;
      } catch (e: any) {
        refusal = e;
        break;
      }
    }

    expect(served).toBeGreaterThan(0);
    expect(refusal).toBeInstanceOf(AiUnavailableError);
    expect(refusal?.kind).toBe('BUDGET_EXHAUSTED');
    expect(usage.paid.estimatedCost).toBeGreaterThanOrEqual(0.5);
  });
});
