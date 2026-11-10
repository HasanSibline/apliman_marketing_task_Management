import { extendedEnd, GRACE_DAYS, subscriptionState, usersToRetire } from './subscription-state';

const NOW = new Date('2026-11-10T12:00:00Z');
const day = (n: number) => new Date(NOW.getTime() + n * 86_400_000);
const company = (over: Partial<Parameters<typeof subscriptionState>[0]> = {}) => ({
  isActive: true,
  subscriptionStatus: 'ACTIVE',
  subscriptionPlan: 'PRO',
  subscriptionEnd: day(30),
  ...over,
});

describe('subscriptionState', () => {
  it('is active with more than a week left', () => {
    expect(subscriptionState(company({ subscriptionEnd: day(8) }), NOW)).toMatchObject({ state: 'ACTIVE', daysLeft: 8, blocked: false });
  });

  it('is due soon within seven days of the end', () => {
    expect(subscriptionState(company({ subscriptionEnd: day(7) }), NOW).state).toBe('DUE_SOON');
    expect(subscriptionState(company({ subscriptionEnd: day(1) }), NOW).state).toBe('DUE_SOON');
  });

  it('keeps working through the grace period, then blocks', () => {
    const graceStart = subscriptionState(company({ subscriptionEnd: day(0) }), NOW);
    expect(graceStart).toMatchObject({ state: 'GRACE', blocked: false });

    const lastGraceDay = subscriptionState(company({ subscriptionEnd: day(-(GRACE_DAYS - 1)) }), NOW);
    expect(lastGraceDay).toMatchObject({ state: 'GRACE', blocked: false });

    const blocked = subscriptionState(company({ subscriptionEnd: day(-GRACE_DAYS) }), NOW);
    expect(blocked).toMatchObject({ state: 'EXPIRED', blocked: true });
    expect(blocked.daysLeft).toBe(-GRACE_DAYS);
  });

  it('says when access stops', () => {
    expect(subscriptionState(company({ subscriptionEnd: day(-2) }), NOW).graceEndsAt).toEqual(day(GRACE_DAYS - 2));
  });

  it('blocks a suspended company at once, whatever the dates', () => {
    expect(subscriptionState(company({ subscriptionStatus: 'SUSPENDED' }), NOW)).toMatchObject({ state: 'SUSPENDED', blocked: true });
    expect(subscriptionState(company({ isActive: false }), NOW)).toMatchObject({ state: 'SUSPENDED', blocked: true });
  });

  it('never blocks a company with no end date', () => {
    const open = subscriptionState(company({ subscriptionEnd: null }), NOW);
    expect(open).toMatchObject({ state: 'ACTIVE', blocked: false, daysLeft: null, graceEndsAt: null });
  });

  it('reports a running trial as a trial, and blocks it after grace like any plan', () => {
    expect(subscriptionState(company({ subscriptionPlan: 'FREE_TRIAL', subscriptionEnd: day(3) }), NOW).state).toBe('TRIAL');
    expect(subscriptionState(company({ subscriptionPlan: 'FREE_TRIAL', subscriptionEnd: day(-1) }), NOW).state).toBe('GRACE');
    expect(subscriptionState(company({ subscriptionPlan: 'FREE_TRIAL', subscriptionEnd: day(-8) }), NOW).blocked).toBe(true);
  });
});

describe('extendedEnd', () => {
  it('extends from the current end when it is still ahead', () => {
    const { start, end } = extendedEnd(new Date('2026-12-15T00:00:00Z'), 1, NOW);
    expect(start).toEqual(new Date('2026-12-15T00:00:00Z'));
    expect(end).toEqual(new Date('2027-01-15T00:00:00Z'));
  });

  it('extends from today when the end has passed, so a payment always reaches the future', () => {
    const { start, end } = extendedEnd(new Date('2026-08-01T00:00:00Z'), 1, NOW);
    expect(start).toEqual(NOW);
    expect(end).toEqual(new Date('2026-12-10T12:00:00Z'));
  });

  it('extends from today when there was no end date', () => {
    expect(extendedEnd(null, 12, NOW).end).toEqual(new Date('2027-11-10T12:00:00Z'));
  });

  it('lands on the last day of a shorter month rather than spilling into the next', () => {
    expect(extendedEnd(new Date('2027-01-31T00:00:00Z'), 1, NOW).end).toEqual(new Date('2027-02-28T00:00:00Z'));
  });
});

describe('usersToRetire', () => {
  const user = (id: string, role: string, created: string) => ({ id, role, createdAt: new Date(created) });
  const team = [
    user('owner', 'COMPANY_ADMIN', '2026-01-01'),
    user('a', 'EMPLOYEE', '2026-02-01'),
    user('b', 'ADMIN', '2026-03-01'),
    user('c', 'EMPLOYEE', '2026-04-01'),
    user('d', 'EMPLOYEE', '2026-05-01'),
  ];

  it('retires the newest users above the limit', () => {
    expect(usersToRetire(team, 3).map((u) => u.id)).toEqual(['d', 'c']);
  });

  it('never retires a company admin, even the newest', () => {
    const withNewAdmin = [...team, user('admin2', 'COMPANY_ADMIN', '2026-06-01')];
    expect(usersToRetire(withNewAdmin, 3).map((u) => u.id)).toEqual(['d', 'c', 'b']);
  });

  it('retires nobody within the limit or when unlimited', () => {
    expect(usersToRetire(team, 5)).toEqual([]);
    expect(usersToRetire(team, -1)).toEqual([]);
  });

  it('stops at the admins when they alone exceed the limit', () => {
    const admins = [user('x', 'COMPANY_ADMIN', '2026-01-01'), user('y', 'COMPANY_ADMIN', '2026-02-01'), user('z', 'EMPLOYEE', '2026-03-01')];
    expect(usersToRetire(admins, 1).map((u) => u.id)).toEqual(['z']);
  });
});
