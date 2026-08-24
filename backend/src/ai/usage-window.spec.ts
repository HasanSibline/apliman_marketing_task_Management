import { utcDayStart, utcMonthStart } from './usage-window';

describe('utcDayStart', () => {
  it('lands on midnight UTC, not midnight wherever the process runs', () => {
    const day = utcDayStart(new Date('2026-08-20T22:30:00Z'));
    expect(day.toISOString()).toBe('2026-08-20T00:00:00.000Z');
  });

  /**
   * The failure this exists to prevent: at 01:00 in UTC+3 it is still yesterday in
   * UTC, and a local midnight would file the row under a day that has not started.
   */
  it('keeps an early-morning UTC instant on its own UTC day', () => {
    expect(utcDayStart(new Date('2026-08-20T01:00:00Z')).toISOString()).toBe(
      '2026-08-20T00:00:00.000Z',
    );
    expect(utcDayStart(new Date('2026-08-19T23:59:59Z')).toISOString()).toBe(
      '2026-08-19T00:00:00.000Z',
    );
  });

  it('is stable, so two calls in the same UTC day upsert the same row', () => {
    const a = utcDayStart(new Date('2026-08-20T00:00:00Z'));
    const b = utcDayStart(new Date('2026-08-20T23:59:59.999Z'));
    expect(a.getTime()).toBe(b.getTime());
  });
});

describe('utcMonthStart', () => {
  it('starts the month at midnight UTC on the first', () => {
    expect(utcMonthStart(new Date('2026-08-20T22:30:00Z')).toISOString()).toBe(
      '2026-08-01T00:00:00.000Z',
    );
  });

  /** A month that starts a day early counts the previous month's last day as spend. */
  it('does not reach back into the previous month on the first of the month', () => {
    expect(utcMonthStart(new Date('2026-08-01T00:30:00Z')).toISOString()).toBe(
      '2026-08-01T00:00:00.000Z',
    );
  });

  it('handles a January boundary without slipping a year', () => {
    expect(utcMonthStart(new Date('2027-01-05T12:00:00Z')).toISOString()).toBe(
      '2027-01-01T00:00:00.000Z',
    );
  });
});
