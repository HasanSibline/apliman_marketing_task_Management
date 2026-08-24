import { rateFor, costOf, callCost, UNKNOWN_MODEL_RATE } from './ai-cost';

describe('rateFor', () => {
  it('prices the models each provider is actually configured with', () => {
    expect(rateFor('anthropic', 'claude-opus-5')).toEqual({
      inputPerMillion: 5,
      outputPerMillion: 25,
    });
    expect(rateFor('openai', 'gpt-4o-mini')).toEqual({
      inputPerMillion: 0.15,
      outputPerMillion: 0.6,
    });
    expect(rateFor('gemini', 'gemini-2.5-flash')).toEqual({
      inputPerMillion: 0.3,
      outputPerMillion: 2.5,
    });
    expect(rateFor('groq', 'openai/gpt-oss-120b')).toEqual({
      inputPerMillion: 0.15,
      outputPerMillion: 0.6,
    });
  });

  /**
   * gemini-2.0-flash was shut down on 2026-06-01 and gemini-2.5-flash replaced it as
   * the AI service's default. Usage rows recorded before the switch must keep pricing
   * at the old rate, so the retired row is not deleted when its successor arrives.
   */
  it('still prices the retired Gemini default at what it cost', () => {
    expect(rateFor('gemini', 'gemini-2.0-flash')).toEqual({
      inputPerMillion: 0.1,
      outputPerMillion: 0.4,
    });
    expect(rateFor('gemini', 'gemini-2.5-flash')).not.toEqual(rateFor('gemini', 'gemini-2.0-flash'));
  });

  /** Google dates its snapshots too, and 2.5-flash is the id the service now sends. */
  it('prices a dated gemini-2.5-flash snapshot as gemini-2.5-flash', () => {
    expect(rateFor('gemini', 'gemini-2.5-flash-preview-09-2026')).toEqual(
      rateFor('gemini', 'gemini-2.5-flash'),
    );
  });

  /**
   * The successor is materially dearer, which is the whole reason moving to it is the
   * owner's decision and not a silent default change.
   */
  it('keeps the successor dearer than the model it replaces', () => {
    const current = rateFor('gemini', 'gemini-2.5-flash');
    const successor = rateFor('gemini', 'gemini-3.5-flash');

    expect(successor.inputPerMillion).toBeGreaterThan(current.inputPerMillion);
    expect(successor.outputPerMillion).toBeGreaterThan(current.outputPerMillion);
  });

  /** Groq's vendor path says who trained the model, not who is billing for it. */
  it('ignores the vendor path in a Groq model id', () => {
    expect(rateFor('groq', 'openai/gpt-oss-120b')).toEqual(rateFor('groq', 'gpt-oss-120b'));
  });

  it('matches dated snapshot suffixes by prefix', () => {
    expect(rateFor('anthropic', 'claude-haiku-4-5-20251001')).toEqual({
      inputPerMillion: 1,
      outputPerMillion: 5,
    });
  });

  it('does not care about case or stray whitespace', () => {
    expect(rateFor('Anthropic', '  Claude-Opus-5 ')).toEqual(rateFor('anthropic', 'claude-opus-5'));
  });

  /**
   * The whole point of the fallback. An entry that pins no model, or pins one released
   * after this table was written, must not be treated as free.
   */
  it('falls back to the conservative rate for an unpinned or unknown model', () => {
    expect(rateFor('anthropic', null)).toEqual(UNKNOWN_MODEL_RATE);
    expect(rateFor('anthropic', undefined)).toEqual(UNKNOWN_MODEL_RATE);
    expect(rateFor('anthropic', 'claude-something-7')).toEqual(UNKNOWN_MODEL_RATE);
    expect(rateFor('a-provider-nobody-added-yet', 'some-model')).toEqual(UNKNOWN_MODEL_RATE);
  });

  /**
   * If a pricier model is ever added and the fallback stays below it, an unknown model
   * is charged less than a known one and the guard leaks.
   */
  it('keeps the fallback at least as expensive as every listed rate', () => {
    const listed = [
      ['anthropic', 'claude-fable-5'],
      ['anthropic', 'claude-opus-5'],
      ['anthropic', 'claude-sonnet-5'],
      ['anthropic', 'claude-haiku-4-5'],
      ['openai', 'gpt-4o-mini'],
      ['gemini', 'gemini-2.0-flash'],
      ['gemini', 'gemini-2.5-flash'],
      ['gemini', 'gemini-3.5-flash'],
      ['groq', 'gpt-oss-120b'],
    ] as const;

    for (const [provider, model] of listed) {
      const rate = rateFor(provider, model);
      expect(rate.inputPerMillion).toBeLessThanOrEqual(UNKNOWN_MODEL_RATE.inputPerMillion);
      expect(rate.outputPerMillion).toBeLessThanOrEqual(UNKNOWN_MODEL_RATE.outputPerMillion);
    }
  });
});

describe('costOf', () => {
  it('charges input and output at their separate rates', () => {
    // 1M in at $5 plus 1M out at $25.
    expect(costOf('anthropic', 'claude-opus-5', { inputTokens: 1e6, outputTokens: 1e6 })).toBe(30);
  });

  it('scales down to a realistic single call', () => {
    // 4,000 in at $5/M is $0.02; 500 out at $25/M is $0.0125.
    expect(costOf('anthropic', 'claude-opus-5', { inputTokens: 4000, outputTokens: 500 })).toBe(
      0.0325,
    );
  });

  it('costs nothing for no tokens', () => {
    expect(costOf('anthropic', 'claude-opus-5', { inputTokens: 0, outputTokens: 0 })).toBe(0);
  });

  /** Float noise summed across thousands of daily rows is how a total drifts. */
  it('rounds to the nearest millionth of a dollar', () => {
    const cost = costOf('groq', 'gpt-oss-120b', { inputTokens: 1, outputTokens: 1 });
    expect(cost).toBe(Math.round(cost * 1e6) / 1e6);
  });

  it('never returns zero for real traffic on an unknown model', () => {
    expect(
      costOf('anthropic', 'a-model-released-tomorrow', { inputTokens: 1000, outputTokens: 100 }),
    ).toBeGreaterThan(0);
  });
});

describe('callCost', () => {
  describe('when the provider reported real counts', () => {
    it('uses Anthropic-shaped usage and calls it measured', () => {
      const cost = callCost('anthropic', 'claude-opus-5', {
        text: 'hello',
        usage: { input_tokens: 1200, output_tokens: 340 },
      });

      expect(cost.basis).toBe('measured');
      expect(cost.inputTokens).toBe(1200);
      expect(cost.outputTokens).toBe(340);
      expect(cost.estimatedCost).toBe(costOf('anthropic', 'claude-opus-5', cost));
    });

    it('uses OpenAI and Groq shaped usage', () => {
      const cost = callCost('openai', 'gpt-4o-mini', {
        usage: { prompt_tokens: 900, completion_tokens: 120 },
      });

      expect(cost).toMatchObject({ basis: 'measured', inputTokens: 900, outputTokens: 120 });
    });

    it('uses Gemini shaped usage', () => {
      const cost = callCost('gemini', 'gemini-2.0-flash', {
        usageMetadata: { promptTokenCount: 700, candidatesTokenCount: 80 },
      });

      expect(cost).toMatchObject({ basis: 'measured', inputTokens: 700, outputTokens: 80 });
    });

    /**
     * What ai-service actually sends now: every provider normalised onto Anthropic's
     * two names, whatever the model underneath. A Gemini chat turn arrives in this
     * shape, not in Google's own.
     */
    it('prices a normalised Gemini report at the gemini-2.5-flash rate', () => {
      const cost = callCost('gemini', 'gemini-2.5-flash', {
        message: 'an answer',
        contextUsed: true,
        usage: { input_tokens: 12_000, output_tokens: 800 },
      });

      // 12,000 in at $0.30/M is $0.0036; 800 out at $2.50/M is $0.002.
      expect(cost).toEqual({
        basis: 'measured',
        inputTokens: 12_000,
        outputTokens: 800,
        estimatedCost: 0.0056,
      });
    });

    /** A pair of zeroes tells us nothing, and an estimate beats nothing. */
    it('does not treat an all-zero report as a measurement', () => {
      const cost = callCost('anthropic', 'claude-opus-5', {
        usage: { input_tokens: 0, output_tokens: 0 },
        summary: 'a real answer that plainly cost something',
      });

      expect(cost.basis).toBe('estimated');
      expect(cost.estimatedCost).toBeGreaterThan(0);
    });
  });

  describe('when nothing reported anything', () => {
    it('says so, rather than presenting a guess as a measurement', () => {
      expect(callCost('anthropic', 'claude-opus-5', { summary: 'a short answer' }).basis).toBe(
        'estimated',
      );
    });

    it('assumes a prompt it cannot see, so a call is never free', () => {
      const cost = callCost('anthropic', 'claude-opus-5', {});

      expect(cost.inputTokens).toBeGreaterThan(0);
      expect(cost.estimatedCost).toBeGreaterThan(0);
    });

    it('grows the output estimate with the size of the answer', () => {
      const short = callCost('anthropic', 'claude-opus-5', { text: 'x'.repeat(100) });
      const long = callCost('anthropic', 'claude-opus-5', { text: 'x'.repeat(10000) });

      expect(long.outputTokens).toBeGreaterThan(short.outputTokens);
      expect(long.estimatedCost).toBeGreaterThan(short.estimatedCost);
    });

    it('handles a plain string answer and a null one', () => {
      expect(callCost('anthropic', 'claude-opus-5', 'a bare string').outputTokens).toBeGreaterThan(
        0,
      );
      expect(callCost('anthropic', 'claude-opus-5', null).outputTokens).toBe(0);
    });

    /** A cost calculation must never be the thing that fails a request. */
    it('survives a response that cannot be serialised', () => {
      const circular: any = { name: 'loop' };
      circular.self = circular;

      expect(() => callCost('anthropic', 'claude-opus-5', circular)).not.toThrow();
      expect(callCost('anthropic', 'claude-opus-5', circular).estimatedCost).toBeGreaterThan(0);
    });
  });

  /**
   * The migration path: the moment ai-service starts returning usage, the same call
   * that was estimated becomes measured with no other change anywhere.
   */
  it('switches from estimated to measured purely on the response shape', () => {
    const body = { summary: 'same answer either way' };
    expect(callCost('anthropic', 'claude-opus-5', body).basis).toBe('estimated');
    expect(
      callCost('anthropic', 'claude-opus-5', {
        ...body,
        usage: { input_tokens: 10, output_tokens: 5 },
      }).basis,
    ).toBe('measured');
  });
});
