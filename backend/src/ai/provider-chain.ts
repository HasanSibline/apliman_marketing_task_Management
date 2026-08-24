/**
 * Choosing what to try, and in what order.
 *
 * Separated from the gateway that executes it so the routing decisions can be tested
 * without a database, a network or a provider. Everything here is a pure function over
 * a list of candidates.
 */

export type ProviderStatus =
  | 'HEALTHY'
  | 'RATE_LIMITED'
  | 'QUOTA_EXCEEDED'
  | 'UNAVAILABLE'
  | 'INVALID_KEY'
  | 'DISABLED';

export interface ChainEntry {
  id: string;
  provider: string;
  model?: string | null;
  priority: number;
  enabled: boolean;
  isEmergency: boolean;
  monthlyBudget?: number | null;
  status: ProviderStatus;
  cooldownUntil?: Date | null;
  createdAt?: Date;
  /** Spent this calendar month against this entry, for budget enforcement. */
  spentThisMonth?: number;
}

/**
 * Whether an entry may be tried right now.
 *
 * A cooldown that has passed makes an entry available again without anybody resetting
 * it: the breaker half-opens by the clock, and a successful call closes it. Storing
 * only a timestamp means recovery needs no scheduled job and survives a restart.
 */
export function isAvailable(entry: ChainEntry, now: Date = new Date()): boolean {
  if (!entry.enabled) return false;
  if (entry.status === 'DISABLED' || entry.status === 'INVALID_KEY') return false;
  if (entry.cooldownUntil && entry.cooldownUntil > now) return false;
  return true;
}

/** Whether a paid entry still has room this month. */
export function withinBudget(entry: ChainEntry): boolean {
  if (entry.monthlyBudget === null || entry.monthlyBudget === undefined) return true;
  return (entry.spentThisMonth ?? 0) < entry.monthlyBudget;
}

/**
 * The order to try things in.
 *
 * Ordinary entries first, by priority, then the emergency ones. The emergency tier is
 * last by construction rather than by an admin remembering to number it last: it is the
 * one that costs money, and the whole point is that it is only reached when everything
 * free has been tried.
 *
 * Ties break on createdAt so two entries at the same priority always resolve the same
 * way. Without it the order comes from whatever the database felt like returning, and a
 * chain that reorders itself between requests is one nobody can reason about.
 */
export function orderChain(entries: ChainEntry[]): ChainEntry[] {
  return [...entries].sort((a, b) => {
    if (a.isEmergency !== b.isEmergency) return a.isEmergency ? 1 : -1;
    if (a.priority !== b.priority) return a.priority - b.priority;
    const at = a.createdAt?.getTime() ?? 0;
    const bt = b.createdAt?.getTime() ?? 0;
    return at - bt;
  });
}

/** The entries worth attempting, in order. */
export function selectCandidates(entries: ChainEntry[], now: Date = new Date()): ChainEntry[] {
  return orderChain(entries).filter((e) => isAvailable(e, now) && withinBudget(e));
}

/**
 * Why nothing could be tried, as something the caller can branch on.
 *
 * The reasons are not interchangeable, and the difference is not only for the log: two
 * of them are permanent until a human acts and one clears by itself, which is the
 * difference between telling a user to wait a moment and telling them to go and ask
 * their administrator.
 */
export type EmptyChainCode =
  | 'NOT_CONFIGURED'
  | 'ALL_DISABLED'
  | 'BUDGET_EXHAUSTED'
  | 'ALL_COOLING'
  | 'ALL_KEYS_REJECTED'
  | 'NONE_AVAILABLE';

export function emptyChainCode(entries: ChainEntry[], now: Date = new Date()): EmptyChainCode {
  if (entries.length === 0) return 'NOT_CONFIGURED';

  const enabled = entries.filter((e) => e.enabled);
  if (enabled.length === 0) return 'ALL_DISABLED';

  const available = enabled.filter((e) => isAvailable(e, now));
  const budgetBlocked = available.filter((e) => !withinBudget(e));
  if (budgetBlocked.length > 0 && budgetBlocked.length === available.length) {
    return 'BUDGET_EXHAUSTED';
  }

  if (enabled.every((e) => e.cooldownUntil && e.cooldownUntil > now)) return 'ALL_COOLING';
  if (enabled.every((e) => e.status === 'INVALID_KEY')) return 'ALL_KEYS_REJECTED';

  return 'NONE_AVAILABLE';
}

/**
 * Why nothing could be tried, for a log an engineer can act on.
 *
 * "No provider available" is true and useless. Whether every key is rate limited, or
 * the budget is spent, or nobody ever configured one, are three different problems with
 * three different fixes.
 */
export function explainEmptyChain(entries: ChainEntry[], now: Date = new Date()): string {
  switch (emptyChainCode(entries, now)) {
    case 'NOT_CONFIGURED':
      return 'no providers configured';
    case 'ALL_DISABLED':
      return 'every provider is disabled';
    case 'BUDGET_EXHAUSTED':
      return 'the only remaining providers are over their monthly budget';
    case 'ALL_COOLING': {
      const soonest = entries
        .filter((e) => e.enabled && e.cooldownUntil)
        .map((e) => e.cooldownUntil!.getTime())
        .sort((a, b) => a - b)[0];
      return `every provider is cooling down, the first frees up in ${Math.ceil((soonest - now.getTime()) / 1000)}s`;
    }
    case 'ALL_KEYS_REJECTED':
      return 'every configured key was rejected by its provider';
    default:
      return 'no provider is currently available';
  }
}
