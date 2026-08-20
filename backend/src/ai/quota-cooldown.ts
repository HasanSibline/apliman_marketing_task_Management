/**
 * How long to stand down after a provider says no, and when a burst is one incident.
 *
 * Extracted as pure functions because the bug they fix was arithmetic, not plumbing:
 * a per-minute rate limit was being answered with a sixty-minute lockout, and a single
 * user action that fires several AI calls was counted as several separate offences.
 * Both are the kind of thing that reads fine and is wrong, so they are testable here
 * rather than buried in a catch block.
 */

/** Cooldown used when the provider does not say how long to wait. */
export const QUOTA_COOLDOWN_SECONDS = 90;

/** Ceiling on a provider-supplied wait, so one bad header cannot lock out a day. */
export const MAX_COOLDOWN_SECONDS = 15 * 60;

/** Rate-limit errors closer together than this belong to one incident. */
export const STRIKE_DEBOUNCE_SECONDS = 20;

/**
 * The provider's own retry hint, in seconds, if it gave one.
 *
 * Providers disagree on where to put it: a Retry-After header holding either seconds
 * or an HTTP date, or a retryDelay of "31s" inside a Gemini error body. Reading it is
 * what turns a guessed cooldown into the real one.
 */
export function retryAfterSeconds(error: any, now: number = Date.now()): number | undefined {
  const header =
    error?.response?.headers?.['retry-after'] ?? error?.response?.headers?.['Retry-After'];

  if (header !== undefined && header !== null && header !== '') {
    const asNumber = Number(header);
    if (Number.isFinite(asNumber) && asNumber > 0) return asNumber;

    const asDate = Date.parse(String(header));
    if (!Number.isNaN(asDate)) {
      const seconds = Math.ceil((asDate - now) / 1000);
      if (seconds > 0) return seconds;
    }
  }

  const body = JSON.stringify(error?.response?.data ?? error?.message ?? '');
  const match = body.match(/retryDelay["':\s]+(\d+)s/i);
  if (match) return Number(match[1]);

  return undefined;
}

/** The cooldown to apply, honouring the provider and clamped to something sane. */
export function cooldownFor(hintSeconds?: number): number {
  if (hintSeconds && hintSeconds > 0) return Math.min(MAX_COOLDOWN_SECONDS, hintSeconds);
  return QUOTA_COOLDOWN_SECONDS;
}

/** Whether this failure is part of the burst already counted. */
export function isSameIncident(lastStrikeAt: number | undefined, now: number): boolean {
  if (!lastStrikeAt) return false;
  return now - lastStrikeAt < STRIKE_DEBOUNCE_SECONDS * 1000;
}
