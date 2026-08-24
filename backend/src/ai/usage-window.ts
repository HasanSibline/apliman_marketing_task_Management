/**
 * Which calendar day and month a usage row belongs to.
 *
 * Both are @db.Date columns, and Prisma sends a Date to Postgres as UTC. A boundary
 * built with setHours(0,0,0,0) is therefore only the right instant on a process that
 * happens to run in UTC. Render does, which is why nobody has noticed; a developer in
 * UTC+3 files today's row under yesterday, and the monthly rollup then starts on the
 * last day of the previous month and counts it twice.
 *
 * Pure functions with the clock passed in, because the bug is arithmetic and the only
 * honest way to test it is to hand it a time.
 */

/** Midnight UTC on the day of `now`. */
export function utcDayStart(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** Midnight UTC on the first day of the month of `now`. */
export function utcMonthStart(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}
