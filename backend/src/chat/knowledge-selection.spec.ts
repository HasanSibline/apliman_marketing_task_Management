import {
  terms,
  chunk,
  score,
  selectRelevant,
  selectAcrossSources,
  allocateBudget,
} from './knowledge-selection';

describe('terms', () => {
  it('keeps the words that distinguish a passage and drops the ones every passage has', () => {
    expect(terms('The pricing for our platform and the competitors')).toEqual([
      'pricing',
      'platform',
      'competitors',
    ]);
  });

  it('survives punctuation and casing', () => {
    expect(terms('MyMonty (CPaaS) — SMS, WhatsApp!')).toEqual([
      'mymonty',
      'cpaas',
      'sms',
      'whatsapp',
    ]);
  });
});

describe('chunk', () => {
  it('splits on the blank lines the author already put there', () => {
    expect(chunk('First idea.\n\nSecond idea.\n\nThird idea.')).toEqual([
      'First idea.',
      'Second idea.',
      'Third idea.',
    ]);
  });

  /** One unbroken wall of text must not become a chunk that swallows the whole budget. */
  it('breaks an over-long paragraph on sentences', () => {
    const long = 'A'.repeat(200) + '. ' + 'B'.repeat(200) + '. ' + 'C'.repeat(200) + '.';
    const chunks = chunk(long, 250);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(260);
  });

  it('drops empty space rather than emitting blank chunks', () => {
    expect(chunk('One.\n\n\n\n   \n\nTwo.')).toEqual(['One.', 'Two.']);
  });
});

describe('score', () => {
  const question = new Set(terms('what is their pricing model'));

  it('rates a passage on the question, not on its own length', () => {
    const onPoint = score('Pricing model is per seat.', question);
    const rambling = score('The company was founded in a garage and grew steadily.', question);
    expect(onPoint).toBeGreaterThan(rambling);
  });

  it('gives nothing to a passage sharing no meaningful word', () => {
    expect(score('Entirely unrelated sentence about weather.', question)).toBe(0);
  });
});

describe('selectRelevant', () => {
  /**
   * The behaviour this module exists to fix: the answer used to live past the cut and
   * was silently dropped, and nothing in the reply revealed it.
   */
  it('finds the answer even when it sits at the end of a long document', () => {
    const filler = Array.from({ length: 30 }, (_, i) => `Paragraph ${i} about history and background.`).join('\n\n');
    const buried = `${filler}\n\nOur pricing is fifty dollars per seat per month.`;

    const picked = selectRelevant(buried, 'what is the pricing per seat', 400);
    expect(picked).toMatch(/fifty dollars per seat/);
  });

  it('stays inside the budget it was given', () => {
    const long = Array.from({ length: 50 }, (_, i) => `Pricing detail number ${i} for seats.`).join('\n\n');
    expect(selectRelevant(long, 'pricing seats', 300).length).toBeLessThanOrEqual(320);
  });

  it('returns a short source untouched rather than picking it apart', () => {
    const short = 'We sell to telecom operators.';
    expect(selectRelevant(short, 'who do you sell to', 1500)).toBe(short);
  });

  /** The gap marker is six characters and used to be charged as two. */
  it('stays inside the budget even when it marks gaps', () => {
    const doc = Array.from({ length: 40 }, (_, i) =>
      i % 2 === 0 ? `Pricing fact ${i}.` : `Office trivia ${i}.`,
    ).join('\n\n');

    for (const budget of [40, 80, 160, 320]) {
      expect(selectRelevant(doc, 'pricing', budget).length).toBeLessThanOrEqual(budget);
    }
  });

  it('marks where it skipped, so extracts are not read as continuous prose', () => {
    const doc = [
      'Pricing is per seat.',
      'Unrelated middle section about office locations.',
      'Pricing includes support.',
    ].join('\n\n');

    const picked = selectRelevant(doc, 'pricing', 60);
    if (picked.includes('per seat') && picked.includes('includes support')) {
      expect(picked).toContain('[…]');
    }
  });

  it('keeps the original order, since prose out of sequence loses the thread', () => {
    const doc = ['Pricing starts at ten.', 'Filler.', 'Pricing rises to twenty.'].join('\n\n');
    const picked = selectRelevant(doc, 'pricing', 100);
    expect(picked.indexOf('ten')).toBeLessThan(picked.indexOf('twenty'));
  });

  it('falls back to the opening when the question matches nothing', () => {
    const doc = 'Alpha content here.\n\n' + 'B'.repeat(3000);
    const picked = selectRelevant(doc, 'zzz qqq', 100);
    expect(picked.startsWith('Alpha content')).toBe(true);
  });

  it('falls back to the opening when the question is only noise words', () => {
    const doc = 'Alpha content here.\n\n' + 'B'.repeat(3000);
    expect(selectRelevant(doc, 'the and for with', 100).startsWith('Alpha')).toBe(true);
  });
});

describe('selectAcrossSources', () => {
  const long = (word: string) =>
    Array.from({ length: 40 }, (_, i) => `${word} detail ${i} about the offering.`).join('\n\n');

  /**
   * The third competitor used to never reach the model at all, so a question about it
   * could not be answered however good the other two sources were.
   */
  it('gives every source a share instead of the first two taking everything', () => {
    const sources = [
      { name: 'A', content: long('alpha') },
      { name: 'B', content: long('bravo') },
      { name: 'C', content: long('charlie') },
    ];

    const trimmed = selectAcrossSources(sources, 'charlie offering', 1500);
    expect(trimmed).toHaveLength(3);
    for (const s of trimmed) expect(s.content!.length).toBeGreaterThan(0);
    expect(trimmed[2].content).toMatch(/charlie/);
  });

  it('leaves a source with no content alone rather than inventing one', () => {
    const sources = [{ name: 'A', content: null }, { name: 'B', content: 'short' }];
    expect(selectAcrossSources(sources, 'anything')[0].content).toBeNull();
  });

  it('returns everything untouched when nothing has content', () => {
    const sources = [{ name: 'A', content: null }, { name: 'B', content: '' }];
    expect(selectAcrossSources(sources, 'q')).toEqual(sources);
  });

  it('does not mutate what it was given', () => {
    const original = { name: 'A', content: long('alpha') };
    const before = original.content;
    selectAcrossSources([original], 'alpha', 200);
    expect(original.content).toBe(before);
  });

  /**
   * The 400-character floor meant twenty sources carried 8000 characters against a
   * stated 4000 budget, and thirty carried 12000. The budget has to be a ceiling.
   */
  it('holds the total budget however many sources there are', () => {
    for (const count of [1, 3, 10, 20, 50]) {
      const sources = Array.from({ length: count }, (_, i) => ({
        name: `S${i}`,
        content: long(`word${i}`),
      }));

      const total = selectAcrossSources(sources, 'offering detail', 4000)
        .reduce((sum, s) => sum + s.content!.length, 0);

      expect(total).toBeLessThanOrEqual(4000);
    }
  });

  it('still sends something from every source when there are many of them', () => {
    const sources = Array.from({ length: 20 }, (_, i) => ({
      name: `S${i}`,
      content: long(`word${i}`),
    }));

    for (const s of selectAcrossSources(sources, 'offering detail', 4000)) {
      expect(s.content!.length).toBeGreaterThan(0);
    }
  });

  it('spends the budget on the long sources when the short ones cannot use it', () => {
    const shortOne = 'We sell to telecom operators.';
    const sources = [{ name: 'A', content: shortOne }, { name: 'B', content: long('bravo') }];

    const trimmed = selectAcrossSources(sources, 'bravo offering', 1000);
    expect(trimmed[0].content).toBe(shortOne);
    // An even split would have capped B at 500; the unused remainder goes to B instead.
    expect(trimmed[1].content!.length).toBeGreaterThan(500);
  });
});

describe('allocateBudget', () => {
  it('splits evenly when every source wants more than its share', () => {
    expect(allocateBudget([1000, 1000, 1000], 300)).toEqual([100, 100, 100]);
  });

  it('gives a short source only what it needs and the rest to the others', () => {
    expect(allocateBudget([10, 1000, 1000], 300)).toEqual([10, 145, 145]);
  });

  it('never hands out more than the budget', () => {
    for (const count of [1, 2, 7, 20, 100]) {
      const shares = allocateBudget(new Array(count).fill(5000), 4000);
      expect(shares.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(4000);
    }
  });

  it('leaves nothing on the table when everything fits', () => {
    expect(allocateBudget([100, 200], 4000)).toEqual([100, 200]);
  });
});
