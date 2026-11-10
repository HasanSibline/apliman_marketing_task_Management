import { cachedCompanyAccess, forgetCompanyAccess, rememberCompanyAccess } from './company-access-cache';

const blocked = { state: 'EXPIRED' as const, daysLeft: -9, subscriptionEnd: null, graceEndsAt: null, blocked: true };

describe('company access cache', () => {
  afterEach(() => jest.useRealTimers());

  it('serves a remembered answer, and nothing once forgotten', () => {
    rememberCompanyAccess('c1', blocked);
    expect(cachedCompanyAccess('c1')).toBe(blocked);
    forgetCompanyAccess('c1');
    expect(cachedCompanyAccess('c1')).toBeUndefined();
  });

  it('remembers "no such company" as null, distinct from not cached', () => {
    rememberCompanyAccess('gone', null);
    expect(cachedCompanyAccess('gone')).toBeNull();
  });

  it('expires an answer after a minute', () => {
    jest.useFakeTimers({ now: 0 });
    rememberCompanyAccess('c2', blocked);
    jest.setSystemTime(59_000);
    expect(cachedCompanyAccess('c2')).toBe(blocked);
    jest.setSystemTime(60_000);
    expect(cachedCompanyAccess('c2')).toBeUndefined();
  });
});
