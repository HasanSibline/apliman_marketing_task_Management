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
 * Why nothing could be tried, for a log an engineer can act on.
 *
 * "No provider available" is true and useless. Whether every key is rate limited, or
 * the budget is spent, or nobody ever configured one, are three different problems with
 * three different fixes.
 */
export function explainEmptyChain(entries: ChainEntry[], now: Date = new Date()): string {
  if (entries.length === 0) return 'no providers configured';

  const enabled = entries.filter((e) => e.enabled);
  if (enabled.length === 0) return 'every provider is disabled';

  const budgetBlocked = enabled.filter((e) => isAvailable(e, now) && !withinBudget(e));
  if (budgetBlocked.length > 0 && budgetBlocked.length === enabled.filter((e) => isAvailable(e, now)).length) {
    return 'the only remaining providers are over their monthly budget';
  }

  const cooling = enabled.filter((e) => e.cooldownUntil && e.cooldownUntil > now);
  if (cooling.length === enabled.length) {
    const soonest = cooling
      .map((e) => e.cooldownUntil!.getTime())
      .sort((a, b) => a - b)[0];
    return `every provider is cooling down, the first frees up in ${Math.ceil((soonest - now.getTime()) / 1000)}s`;
  }

  const bad = enabled.filter((e) => e.status === 'INVALID_KEY');
  if (bad.length === enabled.length) return 'every configured key was rejected by its provider';

  return 'no provider is currently available';
}
