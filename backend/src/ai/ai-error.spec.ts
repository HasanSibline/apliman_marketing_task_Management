import { classifyAiError, userFacingMessage } from './ai-error';

const withStatus = (status: number, message = '') => ({ response: { status, data: { message } } });

describe('classifyAiError', () => {
  describe('the failures worth falling back on', () => {
    it('treats 429 as a rate limit, rested briefly and routed past', () => {
      const v = classifyAiError(withStatus(429));
      expect(v.kind).toBe('RATE_LIMIT');
      expect(v.fallback).toBe(true);
      expect(v.cooldownSeconds).toBeLessThanOrEqual(120);
    });

    it('separates a quota from a rate limit, because a quota does not clear in a minute', () => {
      const v = classifyAiError(withStatus(429, 'RESOURCE_EXHAUSTED: quota exceeded'));
      expect(v.kind).toBe('QUOTA_EXCEEDED');
      expect(v.cooldownSeconds).toBeGreaterThan(600);
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

describe('userFacingMessage', () => {
  it('never names a provider, a status code or a key', () => {
    const all = ['RATE_LIMIT', 'QUOTA_EXCEEDED', 'INVALID_API_KEY', 'PROVIDER_ERROR', 'UNKNOWN'] as const;
    for (const kind of all) {
      const msg = userFacingMessage(kind);
      expect(msg).not.toMatch(/groq|gemini|anthropic|openai|429|529|api key/i);
    }
  });

  it('says something the reader can act on when the fault is the prompt', () => {
    expect(userFacingMessage('CONTENT_FILTER')).toMatch(/reword/i);
    expect(userFacingMessage('CONTEXT_TOO_LARGE')).toMatch(/shorten/i);
  });
});
