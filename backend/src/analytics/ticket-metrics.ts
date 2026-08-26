/**
 * Ticket reporting: resolution time, SLA compliance, backlog age and department volume.
 *
 * Pure functions over plain data, same shape as `task-buckets.ts`, and for the same
 * reason: the arithmetic here is the part that is worth getting right in isolation,
 * decided once, and tested without spinning up Prisma or a database.
 */

/** What `averageResolutionHours` needs from a ticket. */
export interface ResolutionTicket {
  createdAt: Date;
  resolvedAt: Date | null;
}

/**
 * Mean hours between `createdAt` and `resolvedAt`, over tickets that have resolved.
 *
 * An unresolved ticket has no resolution time yet, not a resolution time of zero, so
 * it is excluded from both the sum and the count rather than pulling the average down
 * toward zero the longer a backlog sits open. An empty input — or an input where
 * nothing has resolved — returns 0 rather than dividing by zero.
 */
export function averageResolutionHours(tickets: ResolutionTicket[]): number {
  const resolved = tickets.filter((t): t is ResolutionTicket & { resolvedAt: Date } => t.resolvedAt !== null);
  if (resolved.length === 0) return 0;

  const totalHours = resolved.reduce((sum, t) => {
    const ms = t.resolvedAt.getTime() - t.createdAt.getTime();
    return sum + ms / (1000 * 60 * 60);
  }, 0);

  return totalHours / resolved.length;
}

/** What `slaComplianceRate` needs from a ticket. */
export interface SlaTicket {
  deadline: Date | null;
  resolvedAt: Date | null;
}

/**
 * Percentage (0-100, rounded) of tickets that met their deadline.
 *
 * A ticket with no deadline was never given a bar to clear, so it is excluded from the
 * denominator entirely rather than counted as either compliant or a miss — counting it
 * either way would score a company on a promise nobody made. An unresolved ticket that
 * does have a deadline is also excluded: it has not missed anything yet if the deadline
 * has not passed, and it has not met anything either, so there is no honest answer
 * until it resolves. `resolvedAt <= deadline` (not `<`) is deliberate: a ticket closed
 * at the exact deadline instant met it, not missed it by zero.
 */
export function slaComplianceRate(tickets: SlaTicket[]): number {
  const withDeadline = tickets.filter((t) => t.deadline !== null && t.resolvedAt !== null);
  if (withDeadline.length === 0) return 0;

  const compliant = withDeadline.filter((t) => t.resolvedAt!.getTime() <= t.deadline!.getTime());
  return Math.round((compliant.length / withDeadline.length) * 100);
}

/** `Ticket.status` values that mean the ticket is no longer open work. */
export const TERMINAL_TICKET_STATUSES = ['RESOLVED', 'CANCELLED'];

/** What `backlogByAge` needs from a ticket. */
export interface BacklogTicket {
  createdAt: Date;
  status: string;
}

export interface BacklogByAge {
  /** Created 0-2 days ago. */
  fresh: number;
  /** Created 3-7 days ago. */
  aging: number;
  /** Created 8+ days ago. */
  stale: number;
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * Open tickets bucketed by how long they have been open.
 *
 * Resolved and cancelled tickets are not backlog: backlog is work still waiting on
 * someone, and a terminal ticket is not waiting on anyone regardless of how old it is.
 * Age is measured from `createdAt`, not from the last update, because the question a
 * backlog-by-age report answers is "how long has this been sitting unaddressed since it
 * arrived", not "how long since anyone touched it".
 */
export function backlogByAge(tickets: BacklogTicket[], now: Date): BacklogByAge {
  const buckets: BacklogByAge = { fresh: 0, aging: 0, stale: 0 };

  for (const ticket of tickets) {
    if (TERMINAL_TICKET_STATUSES.includes(ticket.status)) continue;

    const ageDays = (now.getTime() - ticket.createdAt.getTime()) / MS_PER_DAY;
    if (ageDays <= 2) buckets.fresh += 1;
    else if (ageDays <= 7) buckets.aging += 1;
    else buckets.stale += 1;
  }

  return buckets;
}

/** What `volumeByDepartment` needs from a ticket. */
export interface DepartmentTicket {
  receiverDeptId: string;
  departmentName: string;
}

export interface DepartmentVolume {
  departmentId: string;
  departmentName: string;
  count: number;
}

/**
 * Ticket counts grouped by receiving department, highest volume first.
 *
 * `departmentName` is carried on each ticket rather than looked up separately so this
 * stays a pure function of the rows the caller already fetched — no second pass over a
 * department table, and no risk of a department id with no matching name being
 * silently dropped.
 */
export function volumeByDepartment(tickets: DepartmentTicket[]): DepartmentVolume[] {
  const counts = new Map<string, DepartmentVolume>();

  for (const ticket of tickets) {
    const existing = counts.get(ticket.receiverDeptId);
    if (existing) {
      existing.count += 1;
    } else {
      counts.set(ticket.receiverDeptId, {
        departmentId: ticket.receiverDeptId,
        departmentName: ticket.departmentName,
        count: 1,
      });
    }
  }

  return Array.from(counts.values()).sort((a, b) => b.count - a.count);
}
