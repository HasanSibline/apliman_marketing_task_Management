import { monthPeriod, weekPeriod, trendPeriods } from './trend-periods';

/** Local-time date, because the buckets are local by design. */
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h);

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

describe('monthPeriod', () => {
  it('returns the whole of last month', () => {
    const p = monthPeriod(at(2026, 5, 14), 1);
    expect(ymd(p.start)).toBe('2026-04-01');
    expect(ymd(p.end)).toBe('2026-04-30');
  });

  it('ends at the last millisecond so an lte bound keeps the final day', () => {
    const p = monthPeriod(at(2026, 5, 14), 1);
    expect(p.start.getHours()).toBe(0);
    expect(p.start.getMinutes()).toBe(0);
    expect(p.start.getMilliseconds()).toBe(0);
    expect(p.end.getHours()).toBe(23);
    expect(p.end.getMinutes()).toBe(59);
    expect(p.end.getMilliseconds()).toBe(999);
  });

  /**
   * The regression. Mutating a date that still carried day 29, 30 or 31 rolled it
   * into the following month, and the label rolled with it.
   */
  it.each([29, 30, 31])('does not skid into the wrong month when run on the %ith', (day) => {
    const p = monthPeriod(at(2026, 3, day), 1);
    expect(ymd(p.start)).toBe('2026-02-01');
    expect(ymd(p.end)).toBe('2026-02-28');
  });

  it('gets February right in a leap year', () => {
    const p = monthPeriod(at(2024, 3, 31), 1);
    expect(ymd(p.start)).toBe('2024-02-01');
    expect(ymd(p.end)).toBe('2024-02-29');
  });

  it('crosses the year boundary backwards', () => {
    const p = monthPeriod(at(2026, 1, 31), 1);
    expect(ymd(p.start)).toBe('2025-12-01');
    expect(ymd(p.end)).toBe('2025-12-31');
  });

  it('goes back a whole year without losing a month', () => {
    const p = monthPeriod(at(2026, 1, 31), 12);
    expect(ymd(p.start)).toBe('2025-01-01');
    expect(ymd(p.end)).toBe('2025-01-31');
  });

  it('labels the month it actually covers', () => {
    // 31 March asking for last month used to be labelled Mar 2026 while covering March.
    expect(monthPeriod(at(2026, 3, 31), 1).label).toContain('Feb');
    expect(monthPeriod(at(2026, 1, 31), 1).label).toContain('Dec');
    expect(monthPeriod(at(2026, 1, 31), 1).label).toContain('2025');
  });

  it('never overlaps the month before or after it, on any day of any month', () => {
    for (let month = 1; month <= 12; month++) {
      for (const day of [1, 15, 28, 29, 30, 31]) {
        const now = new Date(2026, month - 1, day, 12);
        // Skip days the month does not have; the Date constructor would roll them.
        if (now.getMonth() !== month - 1) continue;

        for (let back = 1; back <= 12; back++) {
          const older = monthPeriod(now, back + 1);
          const newer = monthPeriod(now, back);
          expect(older.end.getTime()).toBeLessThan(newer.start.getTime());
          // Abutting, to the millisecond: no gap for a task to fall into.
          expect(newer.start.getTime() - older.end.getTime()).toBe(1);
        }
      }
    }
  });
});

describe('weekPeriod', () => {
  it('covers seven days ending today', () => {
    const p = weekPeriod(at(2026, 5, 14), 0, 'Week 4');
    expect(ymd(p.start)).toBe('2026-05-08');
    expect(ymd(p.end)).toBe('2026-05-14');
  });

  /** The blocks used to be eight days long and shared a day with their neighbour. */
  it('does not share a day with the block before it', () => {
    const older = weekPeriod(at(2026, 5, 14), 1, 'Week 3');
    const newer = weekPeriod(at(2026, 5, 14), 0, 'Week 4');
    expect(ymd(older.end)).toBe('2026-05-07');
    expect(older.end.getTime()).toBeLessThan(newer.start.getTime());
    expect(newer.start.getTime() - older.end.getTime()).toBe(1);
  });

  it('walks back over a month boundary', () => {
    const p = weekPeriod(at(2026, 3, 3), 1, 'Week 1');
    expect(ymd(p.end)).toBe('2026-02-24');
    expect(ymd(p.start)).toBe('2026-02-18');
  });

  it('walks back over a year boundary', () => {
    const p = weekPeriod(at(2026, 1, 5), 1, 'Week 1');
    expect(ymd(p.end)).toBe('2025-12-29');
    expect(ymd(p.start)).toBe('2025-12-23');
  });
});

describe('trendPeriods', () => {
  it('returns twelve whole months for a year, oldest first, ending last month', () => {
    const periods = trendPeriods(at(2026, 3, 31), 'year', 12);
    expect(periods).toHaveLength(12);
    expect(ymd(periods[0].start)).toBe('2025-03-01');
    expect(ymd(periods[11].start)).toBe('2026-02-01');
    expect(ymd(periods[11].end)).toBe('2026-02-28');
  });

  it('leaves the month in progress out of the year trend', () => {
    const periods = trendPeriods(at(2026, 3, 31), 'year', 12);
    const now = at(2026, 3, 31);
    for (const p of periods) {
      expect(p.end.getTime()).toBeLessThan(now.getTime());
    }
  });

  it('returns weeks for every other range, most recent last', () => {
    const periods = trendPeriods(at(2026, 5, 14), 'month', 4);
    expect(periods.map((p) => p.label)).toEqual(['Week 1', 'Week 2', 'Week 3', 'Week 4']);
    expect(ymd(periods[0].start)).toBe('2026-04-17');
    expect(ymd(periods[3].end)).toBe('2026-05-14');
  });

  it('returns a single week for the week range', () => {
    const periods = trendPeriods(at(2026, 5, 14), 'week', 1);
    expect(periods).toHaveLength(1);
    expect(ymd(periods[0].start)).toBe('2026-05-08');
  });

  it('never produces a period whose end precedes its start', () => {
    for (const range of ['week', 'month', 'year', undefined]) {
      for (const day of [1, 28, 29, 30, 31]) {
        const now = new Date(2026, 0, day, 12);
        if (now.getDate() !== day) continue;
        for (const p of trendPeriods(now, range, 12)) {
          expect(p.start.getTime()).toBeLessThan(p.end.getTime());
        }
      }
    }
  });
});
