import {
  classifyAiError,
  userFacingMessage,
  shouldRetrySame,
  kindForEmptyChain,
  AiErrorKind,
} from './ai-error';
import { MAX_COOLDOWN_SECONDS } from './quota-cooldown';

const withStatus = (status: number, message = '') => ({ response: { status, data: { message } } });

/** How Gemini's free tier actually refuses a burst: a 429 that says RESOURCE_EXHAUSTED. */
const geminiPerMinute = {
  response: {
    status: 429,
    data: {
      error: {
        code: 429,
        status: 'RESOURCE_EXHAUSTED',
        message:
          "Quota exceeded for quota metric 'Generate Content API requests per minute' and " +
          "limit 'GenerateRequestsPerMinutePerProjectPerModel' of service " +
          "'generativelanguage.googleapis.com' for consumer 'project_number:1234'.",
      },
    },
  },
};

describe('classifyAiError', () => {
  describe('the failures worth falling back on', () => {
    it('treats 429 as a rate limit, rested briefly and routed past', () => {
      const v = classifyAiError(withStatus(429));
      expect(v.kind).toBe('RATE_LIMIT');
      expect(v.fallback).toBe(true);
      expect(v.cooldownSeconds).toBeLessThanOrEqual(120);
    });

    it("reads Anthropic's 529 as overload rather than a generic server error", () => {
      expect(classifyAiError(withStatus(529)).kind).toBe('PROVIDER_OVERLOADED');
    });

    it('treats a timeout as transient', () => {
      expect(classifyAiError({ code: 'ECONNABORTED' }).kind).toBe('TIMEOUT');
      expect(classifyAiError({ message: 'timeout of 30000ms exceeded' }).fallback).toBe(true);
    });

    it('treats a dropped socket as transient', () => {
      expect(classifyAiError({ code: 'ECONNRESET' }).kind).toBe('NETWORK_ERROR');
    });

    it('falls back on 5xx', () => {
      expect(classifyAiError(withStatus(500)).kind).toBe('PROVIDER_ERROR');
    });
  });

  /**
   * The distinction is worth an hour of somebody's month: a per-minute refusal answered
   * with a long lockout is the same arithmetic error the company-level breaker already
   * made once, and the word "quota" appears in both bodies.
   */
  describe('a speed limit against an exhausted account', () => {
    it('reads the real Gemini RESOURCE_EXHAUSTED 429 as a rate limit, because it clears in a minute', () => {
      const v = classifyAiError(geminiPerMinute);
      expect(v.kind).toBe('RATE_LIMIT');
      expect(v.cooldownSeconds).toBeLessThanOrEqual(120);
      expect(v.retrySame).toBe(true);
    });

    /** Our own AI service re-raises a provider failure as a 5xx carrying its text. */
    it('still reads it as a rate limit when our service has wrapped it in a 500', () => {
      const wrapped = {
        response: {
          status: 500,
          data: { detail: `RESOURCE_EXHAUSTED: ${geminiPerMinute.response.data.error.message}` },
        },
      };
      expect(classifyAiError(wrapped).kind).toBe('RATE_LIMIT');
    });

    it('claims exhaustion only on evidence of billing, not on the word quota', () => {
      const openai = {
        response: {
          status: 429,
          data: {
            error: {
              message: 'You exceeded your current quota, please check your plan and billing details.',
            },
          },
        },
      };
      const v = classifyAiError(openai);
      expect(v.kind).toBe('QUOTA_EXCEEDED');
      expect(v.retrySame).toBe(false);
    });

    it('reads a credit balance the same way, whatever status carries it', () => {
      expect(
        classifyAiError(withStatus(400, 'Your credit balance is too low to access the API.')).kind,
      ).toBe('QUOTA_EXCEEDED');
      expect(classifyAiError(withStatus(402)).kind).toBe('QUOTA_EXCEEDED');
    });

    /**
     * The gateway clamps every cooldown to MAX_COOLDOWN_SECONDS, so a table claiming an
     * hour was claiming something the code would never do. The ceiling wins.
     */
    it('rests an exhausted account no longer than the clamp the gateway applies', () => {
      const v = classifyAiError(withStatus(402));
      expect(v.cooldownSeconds).toBe(MAX_COOLDOWN_SECONDS);
      expect(v.status).toBe('QUOTA_EXCEEDED');
    });
  });

  /**
   * Our AI service answers 400, 500 or 502 for everything it handles, so a 404 or a 405
   * is its router: the route is missing or the deployment is behind. Charging that to a
   * provider is how one undeployed endpoint makes four healthy keys look broken.
   */
  describe('a route that does not exist on our own service', () => {
    it('does not shop a 404 around the chain', () => {
      const v = classifyAiError({ response: { status: 404, data: { detail: 'Not Found' } } });
      expect(v.kind).toBe('ENDPOINT_NOT_FOUND');
      expect(v.fallback).toBe(false);
      expect(v.retrySame).toBe(false);
    });

    it('blames nobody and benches nobody', () => {
      const v = classifyAiError({ response: { status: 404, data: { detail: 'Not Found' } } });
      expect(v.blameEntry).toBe(false);
      expect(v.cooldownSeconds).toBeUndefined();
      expect(v.status).toBeUndefined();
    });

    it('reads a 405 the same way', () => {
      const v = classifyAiError({
        response: { status: 405, data: { detail: 'Method Not Allowed' } },
      });
      expect(v.kind).toBe('ENDPOINT_NOT_FOUND');
      expect(v.blameEntry).toBe(false);
    });

    it('still blames the entry for everything a provider really did', () => {
      expect(classifyAiError(withStatus(429)).blameEntry).toBe(true);
      expect(classifyAiError(withStatus(500)).blameEntry).toBe(true);
      expect(classifyAiError(withStatus(401)).blameEntry).toBe(true);
    });
  });

  describe('the failures that must not be retried elsewhere', () => {
    /**
     * The prompt is the problem, not the provider. Four providers would give four
     * refusals, four round trips and four bills for the same answer.
     */
    it('stops on a content filter instead of shopping it around', () => {
      const v = classifyAiError(withStatus(400, 'Blocked by safety filter'));
      expect(v.kind).toBe('CONTENT_FILTER');
      expect(v.fallback).toBe(false);
      expect(v.retrySame).toBe(false);
    });

    it('does not treat hitting max output as a failure at all', () => {
      const v = classifyAiError({ message: 'finish_reason: length, max_tokens reached' });
      expect(v.kind).toBe('MAX_OUTPUT_REACHED');
      expect(v.fallback).toBe(false);
    });

    it('stops on a malformed request', () => {
      expect(classifyAiError(withStatus(400)).fallback).toBe(false);
    });
  });

  describe('a bad key', () => {
    it('is taken out of service rather than retried, since waiting never fixes it', () => {
      const v = classifyAiError(withStatus(400, 'API key not valid. Please pass a valid API key.'));
      expect(v.kind).toBe('INVALID_API_KEY');
      expect(v.retrySame).toBe(false);
      expect(v.status).toBe('INVALID_KEY');
      expect(v.fallback).toBe(true); // the next entry may still work
    });

    it('reads a 401 the same way', () => {
      expect(classifyAiError(withStatus(401)).status).toBe('INVALID_KEY');
    });
  });

  describe('context length', () => {
    it('moves on without punishing the provider, since another may have a bigger window', () => {
      const v = classifyAiError(withStatus(400, 'maximum context length is 8192 tokens'));
      expect(v.kind).toBe('CONTEXT_TOO_LARGE');
      expect(v.fallback).toBe(true);
      expect(v.status).toBeUndefined();
      expect(v.cooldownSeconds).toBeUndefined();
    });
  });

  it('classifies an interrupted stream as retryable', () => {
    expect(classifyAiError({ message: 'stream interrupted' }).kind).toBe('STREAM_INTERRUPTED');
  });

  it('falls back once on something it does not recognise, rather than retrying it', () => {
    const v = classifyAiError({ message: 'something nobody has seen before' });
    expect(v.kind).toBe('UNKNOWN');
    expect(v.fallback).toBe(true);
    expect(v.retrySame).toBe(false);
  });
});

/**
 * An entry that has just been benched must not then be hammered by the request that
 * benched it: every other request is being refused that entry by isAvailable, and the
 * chain exists precisely so this one does not have to wait for it.
 */
describe('shouldRetrySame', () => {
  const opts = { cooldownApplied: false, tryNo: 1, maxAttempts: 2 };

  it('retries a transient failure that left no cooldown behind', () => {
    expect(shouldRetrySame(classifyAiError({ code: 'ECONNRESET' }), opts)).toBe(true);
  });

  it('refuses to retry an entry it has just put in cooldown', () => {
    const rateLimited = classifyAiError(withStatus(429));
    expect(rateLimited.retrySame).toBe(true);
    expect(shouldRetrySame(rateLimited, { ...opts, cooldownApplied: true })).toBe(false);
  });

  it('still retries a rate limit that was never persisted, as on a legacy single key', () => {
    expect(shouldRetrySame(classifyAiError(withStatus(429)), opts)).toBe(true);
  });

  it('respects the attempt ceiling', () => {
    expect(shouldRetrySame(classifyAiError({ code: 'ECONNRESET' }), { ...opts, tryNo: 2 })).toBe(
      false,
    );
  });

  it('never retries a verdict that said not to', () => {
    expect(shouldRetrySame(classifyAiError(withStatus(401)), opts)).toBe(false);
  });
});

describe('kindForEmptyChain', () => {
  it('calls a tenant with no providers what it is, not a passing glitch', () => {
    expect(kindForEmptyChain('NOT_CONFIGURED')).toBe('NOT_CONFIGURED');
    expect(kindForEmptyChain('ALL_DISABLED')).toBe('NOT_CONFIGURED');
  });

  it('keeps the states that really do clear by themselves transient', () => {
    expect(kindForEmptyChain('ALL_COOLING')).toBe('RATE_LIMIT');
    expect(kindForEmptyChain('NONE_AVAILABLE')).toBe('UNKNOWN');
  });

  it('separates a spending ceiling from a rejected key, since the fixes differ', () => {
    expect(kindForEmptyChain('BUDGET_EXHAUSTED')).toBe('BUDGET_EXHAUSTED');
    expect(kindForEmptyChain('ALL_KEYS_REJECTED')).toBe('INVALID_API_KEY');
  });
});

describe('userFacingMessage', () => {
  it('never names a provider, a status code or a key', () => {
    const all: AiErrorKind[] = [
      'RATE_LIMIT',
      'QUOTA_EXCEEDED',
      'INVALID_API_KEY',
      'PROVIDER_ERROR',
      'ENDPOINT_NOT_FOUND',
      'NOT_CONFIGURED',
      'BUDGET_EXHAUSTED',
      'UNKNOWN',
    ];
    for (const kind of all) {
      const msg = userFacingMessage(kind);
      expect(msg).not.toMatch(/groq|gemini|anthropic|openai|404|429|529|api key/i);
    }
  });

  it('says something the reader can act on when the fault is the prompt', () => {
    expect(userFacingMessage('CONTENT_FILTER')).toMatch(/reword/i);
    expect(userFacingMessage('CONTEXT_TOO_LARGE')).toMatch(/shorten/i);
  });

  /** Telling somebody to wait a moment for a state nobody is fixing is telling them to wait forever. */
  it('does not ask the reader to wait out a state only an administrator can end', () => {
    for (const kind of ['NOT_CONFIGURED', 'BUDGET_EXHAUSTED', 'ENDPOINT_NOT_FOUND', 'INVALID_API_KEY'] as const) {
      const msg = userFacingMessage(kind);
      expect(msg).not.toMatch(/try again|in a moment/i);
      expect(msg).toMatch(/administrator/i);
    }
  });

  it('does keep the transient failures transient', () => {
    expect(userFacingMessage('RATE_LIMIT')).toMatch(/try again/i);
    expect(userFacingMessage('UNKNOWN')).toMatch(/try again/i);
  });
});
