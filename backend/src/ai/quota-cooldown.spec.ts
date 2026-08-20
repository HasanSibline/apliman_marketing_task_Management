import {
  retryAfterSeconds,
  cooldownFor,
  isSameIncident,
  QUOTA_COOLDOWN_SECONDS,
  MAX_COOLDOWN_SECONDS,
  STRIKE_DEBOUNCE_SECONDS,
} from './quota-cooldown';

describe('retryAfterSeconds', () => {
  it('reads a plain seconds header', () => {
    expect(retryAfterSeconds({ response: { headers: { 'retry-after': '31' } } })).toBe(31);
  });

  it('reads the capitalised spelling, since providers disagree', () => {
    expect(retryAfterSeconds({ response: { headers: { 'Retry-After': '12' } } })).toBe(12);
  });

  it('reads an HTTP date and converts it to a wait', () => {
    const now = Date.parse('2026-01-01T00:00:00Z');
    const error = { response: { headers: { 'retry-after': 'Thu, 01 Jan 2026 00:00:45 GMT' } } };
    expect(retryAfterSeconds(error, now)).toBe(45);
  });

  it("reads Gemini's retryDelay out of the error body", () => {
    const error = { response: { data: { error: { details: [{ retryDelay: '31s' }] } } } };
    expect(retryAfterSeconds(error)).toBe(31);
  });

  it('says nothing when the provider said nothing', () => {
    expect(retryAfterSeconds({ message: 'quota exceeded' })).toBeUndefined();
    expect(retryAfterSeconds({})).toBeUndefined();
  });

  it('ignores a date already in the past rather than returning a negative wait', () => {
    const now = Date.parse('2026-01-01T00:01:00Z');
    const error = { response: { headers: { 'retry-after': 'Thu, 01 Jan 2026 00:00:00 GMT' } } };
    expect(retryAfterSeconds(error, now)).toBeUndefined();
  });
});

describe('cooldownFor', () => {
  it('honours what the provider asked for', () => {
    expect(cooldownFor(31)).toBe(31);
  });

  it('falls back to the floor when nothing was said', () => {
    expect(cooldownFor(undefined)).toBe(QUOTA_COOLDOWN_SECONDS);
    expect(cooldownFor(0)).toBe(QUOTA_COOLDOWN_SECONDS);
  });

  it('clamps an absurd hint, so one bad header cannot lock out a day', () => {
    expect(cooldownFor(86_400)).toBe(MAX_COOLDOWN_SECONDS);
  });

  /**
   * The regression this whole module exists for: a per-minute limit was answered with
   * a sixty-minute lockout, sixty times longer than the thing it protected against.
   */
  it('never returns anything close to the old hour', () => {
    expect(cooldownFor(undefined)).toBeLessThan(5 * 60);
  });
});

describe('isSameIncident', () => {
  const now = 1_000_000;

  it('treats the calls of one user action as a single incident', () => {
    // Creating a task fires generateContent and generateSubtasks back to back.
    expect(isSameIncident(now - 800, now)).toBe(true);
  });

  it('counts a genuinely later failure separately', () => {
    expect(isSameIncident(now - (STRIKE_DEBOUNCE_SECONDS + 5) * 1000, now)).toBe(false);
  });

  it('has nothing to compare against on the first failure', () => {
    expect(isSameIncident(undefined, now)).toBe(false);
  });
});
