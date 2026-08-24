/**
 * What one AI call cost, in US dollars.
 *
 * Separated from the gateway for the same reason the routing was: this is arithmetic
 * over a lookup table, and arithmetic that guards money should be testable without a
 * database, a network or a provider.
 *
 * PUBLISHED RATES GO STALE. Providers reprice, retire models and run introductory
 * discounts. Everything in RATES below was read from the providers' own pricing pages
 * on 2026-08-21; when a number is wrong, the fix is in this file and nowhere else:
 *
 *   anthropic  https://claude.com/pricing#api
 *   openai     https://openai.com/api/pricing
 *   gemini     https://ai.google.dev/pricing
 *   gemini     https://ai.google.dev/gemini-api/docs/pricing  (per-model paid tier)
 *   groq       https://groq.com/pricing
 *
 * Where a provider quotes both a discounted and a standard rate, the standard one is
 * recorded. A budget that assumes the discount and does not get it overspends.
 */

/** Published price of one model, in US dollars per million tokens. */
export interface TokenRate {
  inputPerMillion: number;
  outputPerMillion: number;
}

/**
 * Rates by provider, then by model id prefix.
 *
 * Prefixes rather than exact ids, because providers append dated snapshot suffixes to
 * the same model and an exact-match table would silently fall through to the unknown
 * rate for every one of them.
 */
const RATES: Record<string, Record<string, TokenRate>> = {
  anthropic: {
    'claude-fable-5': { inputPerMillion: 10, outputPerMillion: 50 },
    'claude-mythos-5': { inputPerMillion: 10, outputPerMillion: 50 },
    'claude-opus-5': { inputPerMillion: 5, outputPerMillion: 25 },
    'claude-opus-4-8': { inputPerMillion: 5, outputPerMillion: 25 },
    'claude-opus-4-7': { inputPerMillion: 5, outputPerMillion: 25 },
    'claude-opus-4-6': { inputPerMillion: 5, outputPerMillion: 25 },
    // Sonnet 5 is on an introductory $2/$10 until 2026-08-31. The standard rate is
    // recorded on purpose, so nothing has to be edited on the day it ends.
    'claude-sonnet-5': { inputPerMillion: 3, outputPerMillion: 15 },
    'claude-sonnet-4-6': { inputPerMillion: 3, outputPerMillion: 15 },
    'claude-haiku-4-5': { inputPerMillion: 1, outputPerMillion: 5 },
  },
  openai: {
    'gpt-4o-mini': { inputPerMillion: 0.15, outputPerMillion: 0.6 },
  },
  gemini: {
    // Retired by Google on 2026-06-01 and no longer the AI service's default, so the
    // rate stays listed: a row of usage against it should price at what it cost.
    'gemini-2.0-flash': { inputPerMillion: 0.1, outputPerMillion: 0.4 },
    // The AI service's default since the 2.0 shutdown, and retired itself on
    // 2026-10-16. Note the successor below is 5x the input and 3.6x the output, so the
    // day someone moves to it, every budget ceiling set against this row is wrong.
    'gemini-2.5-flash': { inputPerMillion: 0.3, outputPerMillion: 2.5 },
    'gemini-3.5-flash': { inputPerMillion: 1.5, outputPerMillion: 9 },
  },
  groq: {
    'gpt-oss-120b': { inputPerMillion: 0.15, outputPerMillion: 0.6 },
  },
};

/**
 * What an unrecognised model is charged at: the most expensive rate we know of.
 *
 * Erring high is the only safe direction for a spending guard. An unknown model priced
 * low keeps a chain entry inside its ceiling that has in fact blown through it, and the
 * ceiling exists precisely because nobody is watching the bill in real time. Priced
 * high, the worst case is that an entry is benched early and an admin raises the
 * budget, which is a conversation rather than an invoice.
 *
 * Derived from the table rather than typed in, so adding a pricier model cannot leave
 * the fallback quietly cheaper than a real one.
 */
export const UNKNOWN_MODEL_RATE: TokenRate = Object.values(RATES)
  .flatMap((models) => Object.values(models))
  .reduce(
    (worst, rate) => ({
      inputPerMillion: Math.max(worst.inputPerMillion, rate.inputPerMillion),
      outputPerMillion: Math.max(worst.outputPerMillion, rate.outputPerMillion),
    }),
    { inputPerMillion: 0, outputPerMillion: 0 },
  );

/**
 * The rate for one provider and model.
 *
 * A null model is the common case rather than an edge one: an entry that pins no model
 * lets the AI service pick its own default, which this service cannot see. That falls
 * to the unknown rate, which is correct, because guessing the service's default here
 * would be a second copy of a value that lives in ai-service/config.py.
 */
export function rateFor(provider: string, model?: string | null): TokenRate {
  const models = RATES[(provider || '').toLowerCase()];
  if (!models || !model) return UNKNOWN_MODEL_RATE;

  // Groq serves models under a vendor path, "openai/gpt-oss-120b". The path says who
  // trained it, not who is billing, so it is not part of the key.
  const id = model.toLowerCase().trim().split('/').pop() ?? '';

  // Longest prefix wins, so "claude-opus-4-8" is not matched by a shorter neighbour if
  // one is ever added.
  const match = Object.keys(models)
    .filter((prefix) => id.startsWith(prefix))
    .sort((a, b) => b.length - a.length)[0];

  return match ? models[match] : UNKNOWN_MODEL_RATE;
}

/** US dollars for a given number of tokens, rounded to the nearest millionth. */
export function costOf(
  provider: string,
  model: string | null | undefined,
  tokens: { inputTokens: number; outputTokens: number },
): number {
  const rate = rateFor(provider, model);
  const dollars =
    (tokens.inputTokens / 1_000_000) * rate.inputPerMillion +
    (tokens.outputTokens / 1_000_000) * rate.outputPerMillion;

  // Six decimals is a ten-thousandth of a cent. Below that is float noise, and these
  // values are summed across thousands of rows.
  return Math.round(dollars * 1e6) / 1e6;
}

/**
 * Average characters per token.
 *
 * English prose runs around four. JSON, code and identifiers tokenise denser, and a
 * smaller divisor yields more tokens, which is the safe direction here.
 */
const ESTIMATED_CHARS_PER_TOKEN = 3.5;

/**
 * Tokens assumed for a prompt nobody measured.
 *
 * The gateway sees the AI service's response and never its request, so the prompt has
 * to be assumed whenever ai-service reports no counts of its own. This figure is not
 * invented:
 * the service's own system prompt templates are roughly 6,500 characters for content
 * generation and 11,700 for chat before any task data, history or knowledge sources are
 * interpolated in, which at the divisor above is 1,900 to 3,300 tokens of fixed text.
 *
 * KNOWN UNDER-COUNT: a chat turn carrying a base64 image or PDF costs far more than
 * this. Such a call is charged too little until real counts arrive.
 */
const ESTIMATED_PROMPT_TOKENS = 4000;

/** Where a call's token counts came from. Never let these two be confused. */
export type CostBasis = 'measured' | 'estimated';

export interface CallCost {
  inputTokens: number;
  outputTokens: number;
  /** Dollars. Trustworthy only in proportion to `basis`. */
  estimatedCost: number;
  basis: CostBasis;
}

/**
 * Token counts reported by the provider, if the response carries any.
 *
 * Three shapes, because three providers name the same two numbers differently and the
 * AI service passes whatever it is given straight through. The service now normalises
 * its own reports to the first shape, so the other two are for a body that reaches
 * here unnormalised. Returns null when nothing usable is present, which is still the
 * case for any path that does not report counts.
 */
function measuredTokens(result: unknown): { inputTokens: number; outputTokens: number } | null {
  if (!result || typeof result !== 'object') return null;
  const body = result as Record<string, any>;

  const pairs: [any, any][] = [
    // Anthropic, and the names the AI service normalises every provider onto.
    [body.usage?.input_tokens, body.usage?.output_tokens],
    // OpenAI and Groq, verbatim from their chat-completions payloads.
    [body.usage?.prompt_tokens, body.usage?.completion_tokens],
    // Gemini.
    [body.usageMetadata?.promptTokenCount, body.usageMetadata?.candidatesTokenCount],
  ];

  for (const [input, output] of pairs) {
    if (typeof input === 'number' && typeof output === 'number') {
      // A provider that reports zero for both told us nothing worth trusting over an
      // estimate, so it is not treated as a measurement.
      if (input > 0 || output > 0) {
        return { inputTokens: Math.round(input), outputTokens: Math.round(output) };
      }
    }
  }

  return null;
}

/** How many characters of answer came back, as a proxy for output size. */
function responseChars(result: unknown): number {
  if (result === null || result === undefined) return 0;
  if (typeof result === 'string') return result.length;
  try {
    return JSON.stringify(result)?.length ?? 0;
  } catch {
    // A circular response is not something to fail a cost calculation over.
    return 0;
  }
}

/**
 * What one successful call cost, and how confident that figure is.
 *
 * Prefers counts the provider itself reported. When there are none it estimates, and
 * says so in `basis` rather than only in a comment, because the estimate and the
 * measurement land in the same database column and nothing downstream could otherwise
 * tell them apart.
 */
export function callCost(
  provider: string,
  model: string | null | undefined,
  result: unknown,
): CallCost {
  const measured = measuredTokens(result);
  if (measured) {
    return { ...measured, estimatedCost: costOf(provider, model, measured), basis: 'measured' };
  }

  const tokens = {
    inputTokens: ESTIMATED_PROMPT_TOKENS,
    outputTokens: Math.ceil(responseChars(result) / ESTIMATED_CHARS_PER_TOKEN),
  };

  return { ...tokens, estimatedCost: costOf(provider, model, tokens), basis: 'estimated' };
}
