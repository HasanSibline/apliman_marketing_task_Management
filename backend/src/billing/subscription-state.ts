/**
 * Where a company stands with its subscription, decided in one place.
 *
 * Login, every authenticated request, the Super Admin's billing page and the company's
 * own banner all ask this, so they cannot disagree about whether a company is blocked.
 *
 * The timeline after `subscriptionEnd`:
 *   - up to DUE_SOON_DAYS before it: DUE_SOON, a reminder
 *   - from the end date: GRACE for GRACE_DAYS, still working, with a warning
 *   - after that: EXPIRED, and the company's users cannot sign in
 *
 * A Super Admin suspension blocks at once, whatever the dates say. A company with no
 * end date has an open-ended subscription and is never blocked by time.
 */

export const DUE_SOON_DAYS = 7;
export const GRACE_DAYS = 7;
const DAY_MS = 86_400_000;

export type SubscriptionStateName = 'ACTIVE' | 'TRIAL' | 'DUE_SOON' | 'GRACE' | 'EXPIRED' | 'SUSPENDED';

export interface SubscriptionFields {
  isActive: boolean;
  subscriptionStatus: string;
  subscriptionPlan: string;
  subscriptionEnd: Date | null;
}

export interface SubscriptionState {
  state: SubscriptionStateName;
  /** Whole days until the end date; negative once it has passed; null with no end date. */
  daysLeft: number | null;
  subscriptionEnd: Date | null;
  /** When access stops. Null when time cannot block this company. */
  graceEndsAt: Date | null;
  blocked: boolean;
}

export const BLOCKED_MESSAGE =
  "Your company's subscription has ended. Please contact your administrator to renew it.";

export function subscriptionState(company: SubscriptionFields, now: Date = new Date()): SubscriptionState {
  const end = company.subscriptionEnd ? new Date(company.subscriptionEnd) : null;
  const graceEndsAt = end ? new Date(end.getTime() + GRACE_DAYS * DAY_MS) : null;
  const daysLeft = end ? Math.ceil((end.getTime() - now.getTime()) / DAY_MS) : null;
  const base = { daysLeft, subscriptionEnd: end, graceEndsAt };

  if (!company.isActive || company.subscriptionStatus === 'SUSPENDED') {
    return { ...base, state: 'SUSPENDED', blocked: true };
  }
  if (!end) {
    return { ...base, graceEndsAt: null, state: isTrial(company) ? 'TRIAL' : 'ACTIVE', blocked: false };
  }
  if (now.getTime() >= graceEndsAt!.getTime()) {
    return { ...base, state: 'EXPIRED', blocked: true };
  }
  if (now.getTime() >= end.getTime()) {
    return { ...base, state: 'GRACE', blocked: false };
  }
  if (isTrial(company)) {
    return { ...base, state: 'TRIAL', blocked: false };
  }
  return { ...base, state: daysLeft! <= DUE_SOON_DAYS ? 'DUE_SOON' : 'ACTIVE', blocked: false };
}

function isTrial(company: SubscriptionFields): boolean {
  return company.subscriptionPlan === 'FREE_TRIAL';
}

/** The new end date when a payment covers `months`: from the later of now and the current end. */
export function extendedEnd(currentEnd: Date | null, months: number, now: Date = new Date()): { start: Date; end: Date } {
  const start = currentEnd && currentEnd.getTime() > now.getTime() ? new Date(currentEnd) : new Date(now);
  const end = new Date(start);
  const day = end.getUTCDate();
  end.setUTCMonth(end.getUTCMonth() + months);
  // 31 January plus one month is 3 March in JavaScript; pull it back to the month's last day.
  if (end.getUTCDate() !== day) end.setUTCDate(0);
  return { start, end };
}

/**
 * Who loses access when a company has more active users than its plan allows.
 *
 * Newest first, so the people who have used the system longest keep it, and never a
 * company admin, who is the one person who can fix the situation. When admins alone
 * exceed the limit, they all stay and the company remains over its limit.
 */
export function usersToRetire<T extends { role: string; createdAt: Date }>(activeUsers: T[], maxUsers: number): T[] {
  if (maxUsers < 0 || activeUsers.length <= maxUsers) return [];
  const excess = activeUsers.length - maxUsers;
  return activeUsers
    .filter((u) => u.role !== 'COMPANY_ADMIN')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, excess);
}
