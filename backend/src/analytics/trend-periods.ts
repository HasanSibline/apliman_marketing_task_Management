/**
 * The buckets behind the performance trend chart.
 *
 * The month buckets were built by mutating one date in the wrong order:
 *
 *     const periodStart = new Date();          // today
 *     periodStart.setMonth(periodStart.getMonth() - i - 1);
 *     periodStart.setDate(1);
 *
 * `setMonth` keeps the day of the month, and if the target month has no such day
 * JavaScript rolls forward into the next one. Run the report on 31 March and
 * `setMonth(1)` asks for 31 February, which becomes 3 March. `setDate(1)` then pins
 * the first of March, not the first of February. The same mutation drives the label,
 * so a whole month of the chart was mislabelled as well as misbucketed, and only for
 * people who opened the page on the 29th, 30th or 31st. `periodEnd.setMonth(...)`
 * followed by `setDate(0)` slipped the same way.
 *
 * Building the date from explicit year and month components cannot slip, because the
 * day is supplied rather than carried over. `new Date(y, m, 1)` normalises an
 * out-of-range month on its own, so month -1 is December of the previous year and no
 * year arithmetic is needed at the boundary.
 *
 * Local time, not UTC, unlike `ai/usage-window.ts`. Those are `@db.Date` columns; the
 * timestamps compared here are `createdAt` and `updatedAt`, and the label is rendered
 * with `toLocaleString`, so the buckets have to line up with the reader's calendar.
 *
 * The clock is a parameter for the same reason it is in `usage-window.ts`: the defect
 * only appears on three days of the month, so a test has to be able to pick the day.
 */

export interface TrendPeriod {
  /** First instant of the bucket, inclusive. */
  start: Date;
  /** Last instant of the bucket, inclusive, to match Prisma's `lte`. */
  end: Date;
  /** What the chart puts on the axis. */
  label: string;
}

/** Last millisecond of the day `d` falls on. */
function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

/**
 * One whole calendar month, `monthsAgo` before the month `now` sits in.
 *
 * `monthsAgo` of 1 is last month. Zero would be the current month, which the year
 * trend deliberately leaves out: a month still in progress would draw as a collapse
 * in output next to twelve complete ones.
 */
export function monthPeriod(now: Date, monthsAgo: number): TrendPeriod {
  const year = now.getFullYear();
  const month = now.getMonth() - monthsAgo;

  const start = new Date(year, month, 1, 0, 0, 0, 0);
  // Day 0 of the following month is the last day of this one, so February gets 28 or
  // 29 without anyone having to know which.
  const end = new Date(year, month + 1, 0, 23, 59, 59, 999);

  return {
    start,
    end,
    label: start.toLocaleString('default', { month: 'short', year: 'numeric' }),
  };
}

/**
 * Seven whole days, the most recent block ending today.
 *
 * `weeksAgo` of 0 is today and the six days before it.
 *
 * The blocks used to be eight days long: the start was `now - (weeksAgo * 7 + 7)` days
 * and the end was `now - weeksAgo * 7` days, so consecutive blocks shared a boundary
 * day and any task on that day was counted in both. Six days back rather than seven
 * makes them abut instead of overlap.
 */
export function weekPeriod(now: Date, weeksAgo: number, label: string): TrendPeriod {
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - weeksAgo * 7);
  const start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 6, 0, 0, 0, 0);

  return { start, end: endOfDay(end), label };
}

/**
 * The whole series, oldest first, which is the order the chart draws.
 *
 * `timeRange` of 'year' gives whole calendar months; anything else gives weeks, which
 * is what the week and month ranges both asked for before.
 */
export function trendPeriods(now: Date, timeRange: string | undefined, count: number): TrendPeriod[] {
  const periods: TrendPeriod[] = [];

  for (let i = count - 1; i >= 0; i--) {
    periods.push(
      timeRange === 'year'
        ? monthPeriod(now, i + 1)
        : weekPeriod(now, i, `Week ${count - i}`),
    );
  }

  return periods;
}
