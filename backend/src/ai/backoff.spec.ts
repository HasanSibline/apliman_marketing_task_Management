import { backoffDelay, BASE_DELAY_MS, MAX_DELAY_MS } from './backoff';

describe('backoffDelay', () => {
  const half = () => 0.5;

  it('grows with each attempt', () => {
    expect(backoffDelay(1, undefined, half)).toBe(BASE_DELAY_MS / 2);
    expect(backoffDelay(2, undefined, half)).toBe(BASE_DELAY_MS);
    expect(backoffDelay(3, undefined, half)).toBe(BASE_DELAY_MS * 2);
  });

  it('stops growing at the ceiling', () => {
    expect(backoffDelay(20, undefined, () => 1)).toBe(MAX_DELAY_MS);
  });

  /**
   * The point of jitter: two requests failing together must not retry together, or the
   * provider that just rate-limited us gets a synchronised second burst.
   */
  it('spreads retries rather than firing them in lockstep', () => {
    const a = backoffDelay(3, undefined, () => 0.1);
    const b = backoffDelay(3, undefined, () => 0.9);
    expect(a).not.toBe(b);
  });

  it("defers to the provider's own figure, since it knows and we are guessing", () => {
    expect(backoffDelay(1, 3, half)).toBe(3000);
  });

  it('still caps an absurd Retry-After, so one header cannot stall a request forever', () => {
    expect(backoffDelay(1, 3600, half)).toBe(MAX_DELAY_MS);
  });
});
