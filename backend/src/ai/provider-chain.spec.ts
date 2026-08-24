import {
  isAvailable,
  withinBudget,
  orderChain,
  selectCandidates,
  explainEmptyChain,
  emptyChainCode,
  ChainEntry,
} from './provider-chain';

const NOW = new Date('2026-08-18T12:00:00Z');
const entry = (over: Partial<ChainEntry> = {}): ChainEntry => ({
  id: 'e1',
  provider: 'groq',
  priority: 1,
  enabled: true,
  isEmergency: false,
  status: 'HEALTHY',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  ...over,
});

describe('isAvailable', () => {
  it('accepts a healthy entry', () => {
    expect(isAvailable(entry(), NOW)).toBe(true);
  });

  it('skips one that is still cooling down', () => {
    const cooling = entry({ cooldownUntil: new Date(NOW.getTime() + 30_000) });
    expect(isAvailable(cooling, NOW)).toBe(false);
  });

  /** The breaker half-opens by the clock, so recovery needs no scheduled job. */
  it('accepts it again the moment the cooldown has passed', () => {
    const recovered = entry({
      status: 'RATE_LIMITED',
      cooldownUntil: new Date(NOW.getTime() - 1_000),
    });
    expect(isAvailable(recovered, NOW)).toBe(true);
  });

  it('never retries a key the provider rejected, because waiting does not fix it', () => {
    expect(isAvailable(entry({ status: 'INVALID_KEY' }), NOW)).toBe(false);
    expect(
      isAvailable(entry({ status: 'INVALID_KEY', cooldownUntil: new Date(NOW.getTime() - 1) }), NOW),
    ).toBe(false);
  });

  it('respects the admin switching one off', () => {
    expect(isAvailable(entry({ enabled: false }), NOW)).toBe(false);
  });
});

describe('withinBudget', () => {
  it('lets an unmetered entry through', () => {
    expect(withinBudget(entry({ monthlyBudget: null }))).toBe(true);
  });

  it('stops one that has spent its allowance', () => {
    expect(withinBudget(entry({ monthlyBudget: 2, spentThisMonth: 2 }))).toBe(false);
    expect(withinBudget(entry({ monthlyBudget: 2, spentThisMonth: 1.5 }))).toBe(true);
  });
});

describe('orderChain', () => {
  it('puts the paid safety net last however it is numbered', () => {
    const chain = orderChain([
      entry({ id: 'paid', priority: 1, isEmergency: true }),
      entry({ id: 'free', priority: 50 }),
    ]);
    expect(chain.map((e) => e.id)).toEqual(['free', 'paid']);
  });

  it('orders ordinary entries by priority', () => {
    const chain = orderChain([
      entry({ id: 'c', priority: 3 }),
      entry({ id: 'a', priority: 1 }),
      entry({ id: 'b', priority: 2 }),
    ]);
    expect(chain.map((e) => e.id)).toEqual(['a', 'b', 'c']);
  });

  /** Without this the order is whatever the database returned, and it can change. */
  it('breaks ties on age so the order never varies between requests', () => {
    const chain = orderChain([
      entry({ id: 'newer', priority: 1, createdAt: new Date('2026-05-01') }),
      entry({ id: 'older', priority: 1, createdAt: new Date('2026-01-01') }),
    ]);
    expect(chain.map((e) => e.id)).toEqual(['older', 'newer']);
  });
});

describe('selectCandidates', () => {
  it('walks past a rate-limited primary to the next healthy provider', () => {
    const chain = selectCandidates(
      [
        entry({ id: 'groq', priority: 1, status: 'RATE_LIMITED', cooldownUntil: new Date(NOW.getTime() + 60_000) }),
        entry({ id: 'gemini', priority: 2, provider: 'gemini' }),
      ],
      NOW,
    );
    expect(chain.map((e) => e.id)).toEqual(['gemini']);
  });

  it('tries a second key for the same provider before changing provider', () => {
    const chain = selectCandidates(
      [
        entry({ id: 'groq-a', priority: 1, cooldownUntil: new Date(NOW.getTime() + 60_000) }),
        entry({ id: 'groq-b', priority: 2 }),
        entry({ id: 'gemini', priority: 3, provider: 'gemini' }),
      ],
      NOW,
    );
    expect(chain[0].id).toBe('groq-b');
  });

  it('reaches the paid net only once everything free is out', () => {
    const all = [
      entry({ id: 'groq', priority: 1, cooldownUntil: new Date(NOW.getTime() + 60_000) }),
      entry({ id: 'gemini', priority: 2, cooldownUntil: new Date(NOW.getTime() + 60_000) }),
      entry({ id: 'openai', isEmergency: true, monthlyBudget: 2, spentThisMonth: 0 }),
    ];
    expect(selectCandidates(all, NOW).map((e) => e.id)).toEqual(['openai']);
  });

  it('will not spend past the emergency budget even with nothing else left', () => {
    const all = [
      entry({ id: 'groq', priority: 1, cooldownUntil: new Date(NOW.getTime() + 60_000) }),
      entry({ id: 'openai', isEmergency: true, monthlyBudget: 2, spentThisMonth: 2 }),
    ];
    expect(selectCandidates(all, NOW)).toEqual([]);
  });

  it('returns nothing when a company has configured nothing', () => {
    expect(selectCandidates([], NOW)).toEqual([]);
  });
});

describe('explainEmptyChain', () => {
  it('distinguishes the reasons, because each has a different fix', () => {
    expect(explainEmptyChain([], NOW)).toMatch(/no providers configured/);
    expect(explainEmptyChain([entry({ enabled: false })], NOW)).toMatch(/disabled/);
    expect(explainEmptyChain([entry({ status: 'INVALID_KEY' })], NOW)).toMatch(/rejected/);
    expect(
      explainEmptyChain([entry({ isEmergency: true, monthlyBudget: 1, spentThisMonth: 5 })], NOW),
    ).toMatch(/budget/);
  });

  it('says how long until the first provider frees up', () => {
    const cooling = [entry({ cooldownUntil: new Date(NOW.getTime() + 45_000) })];
    expect(explainEmptyChain(cooling, NOW)).toMatch(/45s/);
  });
});

/**
 * The same reasoning as explainEmptyChain, in a form the gateway can branch on: two of
 * these states are permanent until an administrator acts and one clears by itself, and
 * the user-facing message has to tell them apart.
 */
describe('emptyChainCode', () => {
  it('names each reason separately', () => {
    expect(emptyChainCode([], NOW)).toBe('NOT_CONFIGURED');
    expect(emptyChainCode([entry({ enabled: false })], NOW)).toBe('ALL_DISABLED');
    expect(emptyChainCode([entry({ status: 'INVALID_KEY' })], NOW)).toBe('ALL_KEYS_REJECTED');
    expect(
      emptyChainCode([entry({ isEmergency: true, monthlyBudget: 1, spentThisMonth: 5 })], NOW),
    ).toBe('BUDGET_EXHAUSTED');
    expect(emptyChainCode([entry({ cooldownUntil: new Date(NOW.getTime() + 45_000) })], NOW)).toBe(
      'ALL_COOLING',
    );
  });

  it('agrees with the sentence the log prints, because they are the same decision', () => {
    const cases: ChainEntry[][] = [
      [],
      [entry({ enabled: false })],
      [entry({ status: 'INVALID_KEY' })],
      [entry({ monthlyBudget: 1, spentThisMonth: 5 })],
      [entry({ cooldownUntil: new Date(NOW.getTime() + 45_000) })],
      [entry({ status: 'INVALID_KEY' }), entry({ id: 'e2', cooldownUntil: new Date(NOW.getTime() + 10_000) })],
    ];
    const expected = [
      'no providers configured',
      'every provider is disabled',
      'every configured key was rejected by its provider',
      'the only remaining providers are over their monthly budget',
      'every provider is cooling down',
      'no provider is currently available',
    ];
    cases.forEach((c, i) => expect(explainEmptyChain(c, NOW)).toContain(expected[i]));
  });
});
