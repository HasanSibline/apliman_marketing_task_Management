/**
 * How long to wait before trying the same entry again.
 *
 * Exponential with jitter. The jitter matters more than the exponent here: without it,
 * every request that failed at the same moment retries at the same moment, and the
 * provider that just rate-limited us receives a synchronised burst. Full jitter spreads
 * them across the window instead.
 *
 * A provider's own Retry-After always wins, since it knows and we are guessing.
 */
export const BASE_DELAY_MS = 400;
export const MAX_DELAY_MS = 8_000;

export function backoffDelay(
  attempt: number,
  retryAfterSeconds?: number,
  random: () => number = Math.random,
): number {
  if (retryAfterSeconds && retryAfterSeconds > 0) {
    return Math.min(retryAfterSeconds * 1000, MAX_DELAY_MS);
  }
  const ceiling = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** Math.max(0, attempt - 1));
  return Math.round(random() * ceiling);
}
