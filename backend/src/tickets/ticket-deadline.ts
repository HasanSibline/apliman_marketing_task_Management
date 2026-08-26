/**
 * Whether a ticket's deadline means anything right now.
 *
 * `Ticket.deadline` is set at creation and, before this, never read back anywhere:
 * nothing sorted by it, nothing flagged a ticket that had blown past it, nothing
 * reminded anyone one was coming. The data existed and did nothing. These two
 * functions are the one place that reads it, so the list page, the detail page and
 * the reminder worker all agree on what "overdue" and "due soon" mean.
 *
 * Pure, with the ticket and the current instant passed in, because "is this overdue"
 * is a fact about two values, not about the database, and is only honestly testable
 * without one.
 */

/** Ticket.status values a deadline no longer applies to. Work here is finished. */
export const TERMINAL_TICKET_STATUSES = ['RESOLVED', 'CANCELLED'];

/** What the two functions below need to know about a ticket. */
export interface DeadlineTicket {
  deadline: Date | string | null;
  status: string;
}

function toDate(value: Date | string | null): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Past its deadline, and still open work.
 *
 * A resolved or cancelled ticket is never overdue, however late it closed: the
 * deadline was a promise about when it would be dealt with, and it has been. Without
 * that exclusion, every ticket ever closed a day past its deadline would sit in an
 * "overdue" list forever.
 */
export function isOverdue(ticket: DeadlineTicket, now: Date): boolean {
  const deadline = toDate(ticket.deadline);
  if (!deadline) return false;
  if (TERMINAL_TICKET_STATUSES.includes(ticket.status)) return false;
  return deadline.getTime() < now.getTime();
}

/**
 * Not overdue yet, but inside the warning window.
 *
 * Exclusive of a deadline already passed: that is `isOverdue`'s claim to make, not
 * this one's, so a ticket cannot be both without the caller treating them as the same
 * event twice. `hoursAhead` defaults to a day, the reminder worker's own window.
 */
export function dueSoon(ticket: DeadlineTicket, now: Date, hoursAhead = 24): boolean {
  const deadline = toDate(ticket.deadline);
  if (!deadline) return false;
  if (TERMINAL_TICKET_STATUSES.includes(ticket.status)) return false;

  const msAhead = deadline.getTime() - now.getTime();
  if (msAhead <= 0) return false;
  return msAhead <= hoursAhead * 60 * 60 * 1000;
}
