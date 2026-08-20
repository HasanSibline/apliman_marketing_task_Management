/**
 * What kind of failure this was, and what the gateway should do about it.
 *
 * The gateway's whole behaviour turns on this classification, so it is a pure function
 * over the error rather than a chain of ifs inside a catch block. Falling back on
 * everything is as wrong as falling back on nothing: retrying a content filter on four
 * providers means four refusals and four bills, and retrying an invalid key forever
 * means never noticing the key is invalid.
 */

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
}

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
 */
const VERDICTS: Record<AiErrorKind, Omit<AiErrorVerdict, 'kind'>> = {
  RATE_LIMIT:           { fallback: true,  retrySame: true,  cooldownSeconds: 90,     status: 'RATE_LIMITED' },
  QUOTA_EXCEEDED:       { fallback: true,  retrySame: false, cooldownSeconds: 60 * 60, status: 'QUOTA_EXCEEDED' },
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

export function classifyAiError(error: any): AiErrorVerdict {
  const status: number | undefined = error?.response?.status ?? error?.status;
  const text = haystack(error);
  const code = String(error?.code ?? '').toUpperCase();

  const kind = ((): AiErrorKind => {
    // Checked before status, because a provider may return 400 for a filtered prompt
    // and 429 for a quota that is not a rate limit.
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
    if (/quota|resource_exhausted|billing|insufficient_quota|credit/.test(text)) {
      return 'QUOTA_EXCEEDED';
    }
    if (/stream (ended|closed|interrupted)|incomplete chunked|premature close/.test(text)) {
      return 'STREAM_INTERRUPTED';
    }
    if (code === 'ECONNABORTED' || /timeout|etimedout|timed out/.test(text)) return 'TIMEOUT';
    if (['ECONNRESET', 'ENOTFOUND', 'ECONNREFUSED', 'EAI_AGAIN', 'EPIPE'].includes(code)) {
      return 'NETWORK_ERROR';
    }

    if (status === 429) return 'RATE_LIMIT';
    if (status === 401 || status === 403) return 'AUTHENTICATION_ERROR';
    if (status === 529 || status === 503 || /overloaded|capacity|try again later/.test(text)) {
      return 'PROVIDER_OVERLOADED';
    }
    if (status !== undefined && status >= 500) return 'PROVIDER_ERROR';
    if (status === 400 || status === 422) return 'BAD_REQUEST';

    return 'UNKNOWN';
  })();

  return { kind, ...VERDICTS[kind] };
}

/**
 * What the person on the other end is told.
 *
 * Never the provider, never the status code, never the key. "Groq 429" is our problem
 * described in our vocabulary; the reader only needs to know whether to try again.
 */
export function userFacingMessage(kind: AiErrorKind): string {
  switch (kind) {
    case 'CONTENT_FILTER':
      return 'That request was declined by the safety filter. Try rewording it.';
    case 'CONTEXT_TOO_LARGE':
      return 'That is too long to process in one go. Try shortening it.';
    case 'BAD_REQUEST':
      return 'That request could not be processed as written.';
    default:
      return 'The assistant is briefly unavailable. Please try again in a moment.';
  }
}
