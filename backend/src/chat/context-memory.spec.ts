import {
  rememberedIdentity,
  mergeRemembered,
  shouldLearnDomain,
  REMEMBERED_LIMIT,
  DOMAIN_LEARNING_INTERVAL_MS,
} from './context-memory';

const question = (text: string, timestamp = '2026-01-01T00:00:00.000Z') => ({
  question: text,
  timestamp,
});

describe('rememberedIdentity', () => {
  /** The defect: a Set compares objects by reference, so nothing ever deduplicated. */
  it('gives two equal records the same identity even though they are different objects', () => {
    expect(rememberedIdentity(question('what do competitors charge'))).toBe(
      rememberedIdentity(question('what do competitors charge')),
    );
  });

  it('ignores when a record was stored, since asking twice is one interest', () => {
    expect(rememberedIdentity(question('pricing?', '2026-01-01T00:00:00.000Z'))).toBe(
      rememberedIdentity(question('pricing?', '2026-08-20T09:30:00.000Z')),
    );
  });

  it('ignores casing and spacing, because nobody retypes a question identically', () => {
    expect(rememberedIdentity(question('What  is   the pricing'))).toBe(
      rememberedIdentity(question('what is the pricing')),
    );
  });

  it('keeps genuinely different records apart', () => {
    expect(rememberedIdentity(question('pricing'))).not.toBe(
      rememberedIdentity(question('roadmap')),
    );
  });

  it('does not care what order the fields were written in', () => {
    expect(rememberedIdentity({ a: 1, b: 2 })).toBe(rememberedIdentity({ b: 2, a: 1 }));
  });

  it('handles plain strings, which older stored context holds', () => {
    expect(rememberedIdentity('Pricing ')).toBe(rememberedIdentity('pricing'));
  });

  /** A record of nothing but a timestamp makes no claim, so it cannot be merged away. */
  it('falls back to the whole object when only timestamps remain', () => {
    expect(rememberedIdentity({ timestamp: 'a' })).not.toBe(
      rememberedIdentity({ timestamp: 'b' }),
    );
  });
});

describe('mergeRemembered', () => {
  it('deduplicates objects that a Set would have kept twice', () => {
    const merged = mergeRemembered([question('pricing')], [question('pricing')]);
    expect(merged).toHaveLength(1);
  });

  it('keeps the newer copy of a repeat', () => {
    const merged = mergeRemembered(
      [question('pricing', '2026-01-01T00:00:00.000Z')],
      [question('pricing', '2026-08-20T00:00:00.000Z')],
    );
    expect(merged[0].timestamp).toBe('2026-08-20T00:00:00.000Z');
  });

  it('moves a repeat to the end, so the cap drops what is least recently asked', () => {
    const merged = mergeRemembered([question('a'), question('b')], [question('a')]);
    expect(merged.map((q) => q.question)).toEqual(['b', 'a']);
  });

  /**
   * The cap used to be applied before a merge that then undid it, so stored context grew
   * one record per message forever and was sent in full on every message after that.
   */
  it('holds the cap however many messages arrive', () => {
    let stored: { question: string; timestamp: string }[] = [];
    for (let i = 0; i < 300; i++) {
      stored = mergeRemembered(stored, [question(`question number ${i}`)]);
    }
    expect(stored).toHaveLength(REMEMBERED_LIMIT);
    expect(stored[REMEMBERED_LIMIT - 1].question).toBe('question number 299');
  });

  it('keeps the most recent entries rather than the first ones', () => {
    const stored = mergeRemembered(
      Array.from({ length: 12 }, (_, i) => question(`q${i}`)),
      [],
      3,
    );
    expect(stored.map((q) => q.question)).toEqual(['q9', 'q10', 'q11']);
  });

  it('leaves a short list alone', () => {
    const stored = mergeRemembered([question('a')], [question('b')]);
    expect(stored.map((q) => q.question)).toEqual(['a', 'b']);
  });
});

describe('shouldLearnDomain', () => {
  const now = Date.parse('2026-08-20T12:00:00.000Z');

  it('waits until there is enough asked to infer anything from', () => {
    expect(shouldLearnDomain(2, null, now)).toBe(false);
    expect(shouldLearnDomain(3, null, now)).toBe(true);
  });

  /** The defect: this was true from the third message onward, forever. */
  it('does not run again straight after it has just run', () => {
    const justNow = new Date(now - 60_000).toISOString();
    expect(shouldLearnDomain(10, justNow, now)).toBe(false);
  });

  it('runs again once the conclusion has had time to go stale', () => {
    const yesterday = new Date(now - DOMAIN_LEARNING_INTERVAL_MS - 1).toISOString();
    expect(shouldLearnDomain(10, yesterday, now)).toBe(true);
  });

  it('treats an unreadable stamp as never having learned', () => {
    expect(shouldLearnDomain(5, 'not a date', now)).toBe(true);
    expect(shouldLearnDomain(5, 42, now)).toBe(true);
  });
});
