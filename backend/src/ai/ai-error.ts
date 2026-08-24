/**
 * What kind of failure this was, and what the gateway should do about it.
 *
 * The gateway's whole behaviour turns on this classification, so it is a pure function
 * over the error rather than a chain of ifs inside a catch block. Falling back on
 * everything is as wrong as falling back on nothing: retrying a content filter on four
 * providers means four refusals and four bills, and retrying an invalid key forever
 * means never noticing the key is invalid.
 */

import { MAX_COOLDOWN_SECONDS } from './quota-cooldown';
import type { EmptyChainCode } from './provider-chain';

export type AiErrorKind =
  | 'RATE_LIMIT'
  | 'QUOTA_EXCEEDED'
  | 'PROVIDER_OVERLOADED'
  | 'TIMEOUT'
  | 'NETWORK_ERROR'
  | 'PROVIDER_ERROR'
  | 'CONTEXT_TOO_LARGE'
  | 'MAX_OUTPUT_REACHED'
  | 'CONTENT_FILTER'
  | 'INVALID_API_KEY'
  | 'AUTHENTICATION_ERROR'
  | 'STREAM_INTERRUPTED'
  | 'BAD_REQUEST'
  | 'ENDPOINT_NOT_FOUND'
  | 'NOT_CONFIGURED'
  | 'BUDGET_EXHAUSTED'
  | 'UNKNOWN';

export interface AiErrorVerdict {
  kind: AiErrorKind;
  /** Try the next entry in the chain. */
  fallback: boolean;
  /** Try this same entry again after a wait. */
  retrySame: boolean;
  /** Take this entry out of service, and for how long in seconds. */
  cooldownSeconds?: number;
  /** The status to record on the entry, when it should be marked. */
  status?: 'RATE_LIMITED' | 'QUOTA_EXCEEDED' | 'UNAVAILABLE' | 'INVALID_KEY';
  /**
   * Whether this failure says anything about the entry that produced it.
   *
   * Almost everything does. A 404 from our own service does not: recording it would
   * raise failureCount and stamp lastError on a provider that never saw the request,
   * so one undeployed route leaves four healthy providers looking broken on the admin
   * dashboard.
   */
  blameEntry: boolean;
}

/** A verdict as the table stores it: blameEntry is only written where it is false. */
type VerdictRow = Omit<AiErrorVerdict, 'kind' | 'blameEntry'> & { blameEntry?: boolean };

/**
 * How each kind is handled.
 *
 * The distinctions that matter, and why:
 *
 * A **rate limit** clears on its own in a minute, so the entry is rested briefly and
 * the next one is tried meanwhile. A **quota** is usually the day or the month, so the
 * entry rests far longer rather than being retried into the ground.
 *
 * An **invalid key** is not a transient condition and never becomes one by waiting. It
 * is taken out of service and the admin is shown why, because the only fix is a human.
 *
 * A **content filter** is a property of the prompt, not the provider. Sending it
 * elsewhere gets the same refusal from a second provider, so it stops here.
 *
 * **Context too large** is also a property of the request, but a different provider may
 * genuinely have a bigger window, so it falls through without punishing the entry.
 *
 * **Max output** is not a failure at all. The model finished a sentence and stopped
 * because it was told to. Treating it as one is how a working provider gets rested.
 *
 * **Endpoint not found** is our own deployment answering rather than a provider, so it
 * stops the chain and blames nobody: every entry would fail it identically.
 *
 * QUOTA_EXCEEDED rests for MAX_COOLDOWN_SECONDS rather than the hour it used to claim.
 * Which ceiling wins is now decided here: the fifteen minute clamp does, because the
 * gateway routes every cooldown through cooldownFor and an hour was therefore a number
 * this table could not honour. It is also the better number. Being wrong for fifteen
 * minutes costs one probe request; being wrong for an hour leaves a topped-up account
 * benched for fifty-nine minutes with nothing to un-bench it.
 */
const VERDICTS: Record<AiErrorKind, VerdictRow> = {
  RATE_LIMIT:           { fallback: true,  retrySame: true,  cooldownSeconds: 90,     status: 'RATE_LIMITED' },
  QUOTA_EXCEEDED:       { fallback: true,  retrySame: false, cooldownSeconds: MAX_COOLDOWN_SECONDS, status: 'QUOTA_EXCEEDED' },
  PROVIDER_OVERLOADED:  { fallback: true,  retrySame: true,  cooldownSeconds: 60,     status: 'UNAVAILABLE' },
  TIMEOUT:              { fallback: true,  retrySame: true },
  NETWORK_ERROR:        { fallback: true,  retrySame: true },
  PROVIDER_ERROR:       { fallback: true,  retrySame: true,  cooldownSeconds: 60,     status: 'UNAVAILABLE' },
  CONTEXT_TOO_LARGE:    { fallback: true,  retrySame: false },
  MAX_OUTPUT_REACHED:   { fallback: false, retrySame: false },
  CONTENT_FILTER:       { fallback: false, retrySame: false },
  INVALID_API_KEY:      { fallback: true,  retrySame: false, status: 'INVALID_KEY' },
  AUTHENTICATION_ERROR: { fallback: true,  retrySame: false, status: 'INVALID_KEY' },
  STREAM_INTERRUPTED:   { fallback: true,  retrySame: true },
  BAD_REQUEST:          { fallback: false, retrySame: false },
  ENDPOINT_NOT_FOUND:   { fallback: false, retrySame: false, blameEntry: false },
  NOT_CONFIGURED:       { fallback: false, retrySame: false, blameEntry: false },
  BUDGET_EXHAUSTED:     { fallback: false, retrySame: false, blameEntry: false },
  UNKNOWN:              { fallback: true,  retrySame: false },
};

/** Everything an error might be carrying, flattened into one lowercase haystack. */
function haystack(error: any): string {
  const parts = [
    error?.message,
    error?.code,
    error?.response?.data?.message,
    error?.response?.data?.detail?.message,
    error?.response?.data?.error?.message,
    error?.response?.data?.detail,
    typeof error?.response?.data === 'string' ? error.response.data : '',
  ];
  return parts.filter(Boolean).join(' ').toLowerCase();
}

/**
 * The words that mean the account is out, as opposed to going too fast.
 *
 * Deliberately narrow. "quota" and "resource_exhausted" are not on this list, because
 * Gemini's free tier says both when it is refusing a burst that clears in sixty
 * seconds. Every phrase here names money or an account state instead: a balance, a
 * plan, a payment. Nothing else is treated as evidence of exhaustion.
 */
const HARD_EXHAUSTION =
  /insufficient[_ ]?quota|billing|credit balance|out of credits?|no credits? (left|remaining)|payment required|exceeded your current quota|plan and billing|account balance/;

export function classifyAiError(error: any): AiErrorVerdict {
  const status: number | undefined = error?.response?.status ?? error?.status;
  const text = haystack(error);
  const code = String(error?.code ?? '').toUpperCase();

  const kind = ((): AiErrorKind => {
    // Checked before status, because a provider may return 400 for a filtered prompt
    // and 402 for an account that has run dry.
    if (/content[_ ]?filter|safety|blocked by|responsibleai|content policy/.test(text)) {
      return 'CONTENT_FILTER';
    }
    if (/max[_ ]?tokens|max output|length limit|finish_reason.*length/.test(text)) {
      return 'MAX_OUTPUT_REACHED';
    }
    if (/context (length|window)|too many tokens|maximum context|prompt is too long|request too large/.test(text)) {
      return 'CONTEXT_TOO_LARGE';
    }
    if (/api[_ ]?key not valid|api_key_invalid|invalid api key|incorrect api key|api key expired|revoked/.test(text)) {
      return 'INVALID_API_KEY';
    }
    // Hard exhaustion is checked before the status codes because it can arrive with
    // any of them, but it needs positive evidence to be claimed at all.
    if (status === 402 || HARD_EXHAUSTION.test(text)) return 'QUOTA_EXCEEDED';

    if (/stream (ended|closed|interrupted)|incomplete chunked|premature close/.test(text)) {
      return 'STREAM_INTERRUPTED';
    }
    if (code === 'ECONNABORTED' || /timeout|etimedout|timed out/.test(text)) return 'TIMEOUT';
    if (['ECONNRESET', 'ENOTFOUND', 'ECONNREFUSED', 'EAI_AGAIN', 'EPIPE'].includes(code)) {
      return 'NETWORK_ERROR';
    }

    // Nothing between us and a provider answers 404 or 405. Our own AI service raises
    // 400, 500 or 502 for everything it handles, so these two come from its router:
    // the route is missing, or the deployment is behind the backend calling it. No key
    // fixes that, and walking the chain only spends four providers proving it.
    if (status === 404 || status === 405) return 'ENDPOINT_NOT_FOUND';

    // A 429 with no evidence of exhaustion is a speed limit, and speed limits clear in
    // about a minute. Reading one as an hour of lockout is the same arithmetic the
    // company-level breaker already got wrong once, see quota-cooldown.ts.
    if (status === 429 || /rate[_ ]?limit|too many requests|resource_exhausted|quota/.test(text)) {
      return 'RATE_LIMIT';
    }
    if (status === 401 || status === 403) return 'AUTHENTICATION_ERROR';
    if (status === 529 || status === 503 || /overloaded|capacity|try again later/.test(text)) {
      return 'PROVIDER_OVERLOADED';
    }
    if (status !== undefined && status >= 500) return 'PROVIDER_ERROR';
    if (status === 400 || status === 422) return 'BAD_REQUEST';

    return 'UNKNOWN';
  })();

  // blameEntry first, so the table only has to say where the answer is "no".
  return { kind, blameEntry: true, ...VERDICTS[kind] };
}

/**
 * Whether to try the same entry again.
 *
 * retrySame on its own is not enough. An entry that has just been given a cooldown is
 * one that isAvailable() refuses to hand to any other request, and hammering it from
 * this request is the same contradiction with the clock on our side. So a cooldown
 * written now vetoes the retry and the chain moves on, which is what the chain is for.
 */
export function shouldRetrySame(
  verdict: AiErrorVerdict,
  opts: { cooldownApplied: boolean; tryNo: number; maxAttempts: number },
): boolean {
  if (!verdict.retrySame) return false;
  if (opts.cooldownApplied) return false;
  return opts.tryNo < opts.maxAttempts;
}

/**
 * Why an empty chain is empty, in the gateway's own vocabulary.
 *
 * The reasons are not interchangeable. A tenant with no keys is in a permanent state
 * that only an administrator can leave, and "try again in a moment" tells them to wait
 * forever for something nobody is doing. A chain that is entirely cooling down really
 * does fix itself.
 */
export function kindForEmptyChain(code: EmptyChainCode): AiErrorKind {
  switch (code) {
    case 'NOT_CONFIGURED':
    case 'ALL_DISABLED':
      return 'NOT_CONFIGURED';
    case 'ALL_KEYS_REJECTED':
      return 'INVALID_API_KEY';
    case 'BUDGET_EXHAUSTED':
      return 'BUDGET_EXHAUSTED';
    case 'ALL_COOLING':
      return 'RATE_LIMIT';
    default:
      return 'UNKNOWN';
  }
}

/**
 * What the person on the other end is told.
 *
 * Never the provider, never the status code, never the key. "Groq 429" is our problem
 * described in our vocabulary; the reader only needs to know whether to try again, and
 * when the answer is no, who can fix it. A permanent state that reads as a temporary
 * one is worse than no message, because it asks the reader to wait for nothing.
 */
export function userFacingMessage(kind: AiErrorKind): string {
  switch (kind) {
    case 'CONTENT_FILTER':
      return 'That request was declined by the safety filter. Try rewording it.';
    case 'CONTEXT_TOO_LARGE':
      return 'That is too long to process in one go. Try shortening it.';
    case 'BAD_REQUEST':
      return 'That request could not be processed as written.';
    case 'ENDPOINT_NOT_FOUND':
      return 'That assistant feature is not available yet. Please report it to your administrator.';
    case 'NOT_CONFIGURED':
      return 'The assistant has not been set up yet. Ask your administrator to enable it.';
    case 'BUDGET_EXHAUSTED':
      return 'The assistant has reached its spending limit for this month. Ask your administrator to raise it.';
    case 'INVALID_API_KEY':
    case 'AUTHENTICATION_ERROR':
      return 'The assistant is not set up correctly. Ask your administrator to check the AI settings.';
    default:
      return 'The assistant is briefly unavailable. Please try again in a moment.';
  }
}
