/**
 * What the assistant is allowed to remember about a person, and how often it is allowed
 * to spend an AI call working out what that memory means.
 *
 * Both halves exist because of the same defect. Stored context was merged with
 * `[...new Set([...old, ...incoming])]`, and a Set compares objects by reference, so two
 * identical `{ question, timestamp }` records were always two distinct entries. Nothing
 * ever deduplicated and nothing ever fell off the end. Three hundred messages produced
 * three hundred stored records, and the whole blob was sent as userContext on every
 * message after that, spending exactly the token budget knowledge-selection.ts exists to
 * protect. The same unbounded array kept a `length >= 3` check permanently true, so a
 * second upstream call fired on every message forever.
 */

/** Fields that record when something was stored rather than what was stored. */
const WHEN_KEYS = new Set([
  'timestamp',
  'lastupdated',
  'createdat',
  'updatedat',
  'recordedat',
  'askedat',
]);

function normalise(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * A key two remembered items share when they say the same thing.
 *
 * Timestamps are excluded, since asking the same question twice on different days is one
 * interest and not two. Casing and spacing are normalised for the same reason: nobody
 * types their own question back identically.
 */
export function rememberedIdentity(item: unknown): string {
  if (item === null || item === undefined) return 'empty';
  if (typeof item !== 'object') return `${typeof item}:${normalise(String(item))}`;
  if (Array.isArray(item)) return `array:[${item.map(rememberedIdentity).join(',')}]`;

  const entries = Object.entries(item as Record<string, unknown>)
    .filter(([key]) => !WHEN_KEYS.has(key.toLowerCase()))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${rememberedIdentity(value)}`);

  // Nothing left but timestamps means the record carries no claim of its own, so there
  // is no honest way to call two of them the same. Fall back to the literal object.
  if (entries.length === 0) return `object:${JSON.stringify(item)}`;

  return `object:{${entries.join(',')}}`;
}

/** How many entries of one kind are worth carrying into every future prompt. */
export const REMEMBERED_LIMIT = 10;

/**
 * Fold new remembered items into the stored ones, deduplicated and bounded.
 *
 * A repeat keeps the newer copy and moves to the end, so the cap discards what has not
 * been mentioned in longest rather than what was merely stored first.
 */
export function mergeRemembered<T>(
  existing: readonly T[],
  incoming: readonly T[],
  limit = REMEMBERED_LIMIT,
): T[] {
  const byIdentity = new Map<string, T>();

  for (const item of [...existing, ...incoming]) {
    const key = rememberedIdentity(item);
    byIdentity.delete(key);
    byIdentity.set(key, item);
  }

  return Array.from(byIdentity.values()).slice(-limit);
}

/** Below this there is not enough asked to infer an interest from. */
export const DOMAIN_LEARNING_MIN_QUESTIONS = 3;

/**
 * How long a conclusion about someone's interests stays good enough.
 *
 * What a person cares about moves over days, not between two consecutive messages, and
 * each pass costs an upstream call on top of the two every chat message already spends.
 * A day is short enough that a genuine change of focus is picked up by the next morning
 * and long enough that a busy afternoon costs one extra call rather than fifty.
 */
export const DOMAIN_LEARNING_INTERVAL_MS = 24 * 60 * 60 * 1000;

export function shouldLearnDomain(
  questionCount: number,
  lastLearnedAt: unknown,
  now: number = Date.now(),
): boolean {
  if (questionCount < DOMAIN_LEARNING_MIN_QUESTIONS) return false;
  if (typeof lastLearnedAt !== 'string' || !lastLearnedAt) return true;

  const previous = Date.parse(lastLearnedAt);
  // An unreadable stamp is treated as never having learned, because the alternative is
  // a stored typo silencing the feature permanently with nothing to show for it.
  if (Number.isNaN(previous)) return true;

  return now - previous >= DOMAIN_LEARNING_INTERVAL_MS;
}
