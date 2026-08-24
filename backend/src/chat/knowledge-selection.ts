/**
 * Choosing which parts of a knowledge source to send.
 *
 * The prompt builder took the first two sources and the first 1500 characters of each,
 * so a third competitor never reached the model at all and anything past a few hundred
 * words of the first two was dropped. Nothing said so: the answer came back reading
 * exactly as complete as a fully informed one, which is the worst way to be wrong.
 *
 * The obvious fix is to raise the limits, and it is the wrong one. Every chat message
 * would then carry the whole knowledge base, on a free tier measured in requests and
 * tokens per minute, which is the quota problem we have just spent a day fixing. So the
 * budget stays roughly where it is and what fills it changes: the parts of each source
 * that bear on the question asked, rather than whichever parts happen to be first.
 *
 * The budget is a ceiling on the whole set, not a per-source allowance. Adding a
 * twenty-first knowledge source therefore makes each of the twenty-one a little
 * shorter; it does not make the prompt longer.
 *
 * Term overlap rather than embeddings. Embeddings would rank better and would need a
 * vector store, an embedding call per message, and a second thing to keep running. This
 * needs none of that, runs in under a millisecond, is identical on every run, and is a
 * large improvement on position-in-file. If it proves too blunt, this is the one module
 * that has to change.
 */

/** Words that appear in every document and so distinguish none of them. */
const NOISE = new Set([
  'the', 'and', 'for', 'with', 'this', 'that', 'from', 'are', 'was', 'were', 'has',
  'have', 'had', 'not', 'but', 'they', 'their', 'them', 'our', 'you', 'your', 'its',
  'can', 'will', 'would', 'could', 'should', 'about', 'into', 'over', 'more', 'most',
  'other', 'than', 'then', 'when', 'what', 'which', 'who', 'how', 'why', 'all', 'any',
  'also', 'been', 'being', 'does', 'did', 'each', 'such', 'these', 'those', 'there',
]);

export function terms(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !NOISE.has(w));
}

/**
 * Split into passages a reader would recognise.
 *
 * Blank lines first, because whoever wrote the source used them to separate ideas and
 * that is better structure than anything inferred. A passage still too long after that
 * is split on sentences, so one unbroken wall of text does not become a single chunk
 * that either dominates the budget or is skipped entirely.
 */
export function chunk(content: string, maxChars = 600): string[] {
  const paragraphs = content
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  const out: string[] = [];
  for (const paragraph of paragraphs) {
    if (paragraph.length <= maxChars) {
      out.push(paragraph);
      continue;
    }

    let current = '';
    for (const sentence of paragraph.split(/(?<=[.!?])\s+/)) {
      if (current && current.length + sentence.length > maxChars) {
        out.push(current.trim());
        current = '';
      }
      current += (current ? ' ' : '') + sentence;
    }
    if (current.trim()) out.push(current.trim());
  }

  return out;
}

/** How well a passage answers this question, by shared meaningful words. */
export function score(passage: string, questionTerms: Set<string>): number {
  if (questionTerms.size === 0) return 0;
  const words = new Set(terms(passage));
  if (words.size === 0) return 0;

  let shared = 0;
  for (const t of questionTerms) if (words.has(t)) shared++;

  // Divided by the question rather than the passage, so a long passage covering the
  // whole question beats a short one that happens to be mostly one matching word.
  return shared / questionTerms.size;
}

/**
 * The parts of one source worth sending, within a character budget.
 *
 * Chunks are chosen by relevance and then re-ordered back into the order they appear in
 * the document, because prose read out of sequence loses the thread even when every
 * sentence is individually apt. A gap between non-adjacent chunks is marked, so the
 * model can tell it has been handed extracts rather than a continuous passage.
 *
 * A question with nothing to match on, or a source shorter than the budget, both fall
 * back to the opening of the document. That is the old behaviour, kept deliberately for
 * the cases where selection has nothing to add.
 */
/** Shown between chunks that were not adjacent in the source. */
const GAP_MARKER = '\n[…]\n';

/** Shown between chunks that were adjacent, so they read as continuous prose. */
const JOIN = '\n\n';

export function selectRelevant(content: string, question: string, budget = 1500): string {
  if (!content) return '';
  if (content.length <= budget) return content;

  const questionTerms = new Set(terms(question));
  if (questionTerms.size === 0) return content.slice(0, budget);

  const chunks = chunk(content);
  const ranked = chunks
    .map((text, index) => ({ text, index, value: score(text, questionTerms) }))
    .filter((c) => c.value > 0)
    .sort((a, b) => b.value - a.value);

  if (ranked.length === 0) return content.slice(0, budget);

  const picked: { text: string; index: number }[] = [];
  let used = 0;
  for (const c of ranked) {
    // Whether this chunk ends up joined or gapped is only known once everything is
    // picked and re-sorted, so charge the longer of the two now. Charging the shorter
    // one let the output run four characters past the budget for every gap it marked.
    const separator = picked.length === 0 ? 0 : GAP_MARKER.length;
    if (used + separator + c.text.length > budget) continue;
    picked.push(c);
    used += separator + c.text.length;
    if (used >= budget) break;
  }

  if (picked.length === 0) return content.slice(0, budget);

  picked.sort((a, b) => a.index - b.index);

  let out = '';
  let previous = -1;
  for (const c of picked) {
    if (previous !== -1) out += c.index === previous + 1 ? JOIN : GAP_MARKER;
    out += c.text;
    previous = c.index;
  }
  return out;
}

export interface SelectableSource {
  name?: string | null;
  type?: string | null;
  content?: string | null;
  description?: string | null;
}

/**
 * Split a budget between sources, giving back what the short ones cannot use.
 *
 * A flat equal split wastes budget whenever a source is shorter than its share: that
 * source has no use for the remainder and nobody else is offered it. So the split
 * repeats over the sources still asking for more than an equal share, until every
 * remaining one would take everything it is offered.
 *
 * The returned shares always sum to at most totalBudget. The single exception is more
 * sources than the budget has characters, where each is given one character so that it
 * still reaches the model at all; that needs thousands of sources to occur.
 */
export function allocateBudget(lengths: number[], totalBudget: number): number[] {
  const shares = new Array<number>(lengths.length).fill(0);
  let pending = lengths.map((_, i) => i);
  let remaining = totalBudget;

  while (pending.length > 0) {
    const equal = Math.max(1, Math.floor(remaining / pending.length));
    const satisfied = pending.filter((i) => lengths[i] <= equal);

    if (satisfied.length === 0) {
      for (const i of pending) shares[i] = equal;
      break;
    }

    for (const i of satisfied) {
      shares[i] = lengths[i];
      remaining -= lengths[i];
    }
    pending = pending.filter((i) => lengths[i] > equal);
  }

  return shares;
}

/**
 * Trim a set of sources against one question, keeping every source represented.
 *
 * Two guarantees, held together. Every source with content gets a share, so a question
 * about the third competitor is answerable rather than depending on which sources happen
 * to be stored first. And the shares sum to no more than totalBudget, so what a message
 * costs is a property of this call rather than of how many sources the company has
 * uploaded since.
 *
 * They pull against each other, and the budget wins: the share per source shrinks as
 * sources multiply, so twenty sources against a 4000 budget get 200 characters each
 * rather than 400 each for 8000 total. A 400-character floor used to guarantee every
 * source a useful amount instead of a token one, but a floor turns the budget into a
 * starting point that then grows linearly with source count, which is the one thing the
 * budget exists to prevent. Sources shorter than their share hand back what they cannot
 * use, so a few one-paragraph sources cost the longer ones nothing.
 */
export function selectAcrossSources<T extends SelectableSource>(
  sources: T[],
  question: string,
  totalBudget = 4000,
): T[] {
  const withContent = sources.filter((s) => s.content && s.content.trim());
  if (withContent.length === 0) return sources;

  const shares = allocateBudget(
    withContent.map((s) => s.content!.length),
    totalBudget,
  );

  let next = 0;
  return sources.map((s) => {
    if (!s.content || !s.content.trim()) return s;
    return { ...s, content: selectRelevant(s.content, question, shares[next++]) };
  });
}
