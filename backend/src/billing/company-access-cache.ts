import { SubscriptionState } from './subscription-state';

/**
 * The per-request subscription check's cache, shared by everything that changes the
 * answer.
 *
 * It lives here rather than inside UsersService so that billing and company changes
 * can clear it without a module cycle. One process serves the API, so a module-level
 * map is the whole cache. Clearing it on a payment, extension, suspension or plan
 * change makes the change take effect on the very next request, instead of bouncing
 * a user who signs in during the minute after their company paid.
 */
const TTL_MS = 60_000;
const entries = new Map<string, { at: number; state: SubscriptionState | null }>();

export function cachedCompanyAccess(companyId: string): SubscriptionState | null | undefined {
  const hit = entries.get(companyId);
  if (!hit || Date.now() - hit.at >= TTL_MS) return undefined;
  return hit.state;
}

export function rememberCompanyAccess(companyId: string, state: SubscriptionState | null): void {
  entries.set(companyId, { at: Date.now(), state });
}

export function forgetCompanyAccess(companyId: string): void {
  entries.delete(companyId);
}
