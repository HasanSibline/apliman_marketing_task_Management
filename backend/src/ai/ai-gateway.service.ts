import { Injectable, Logger, Inject, forwardRef, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CompaniesService } from '../companies/companies.service';
import {
  classifyAiError,
  userFacingMessage,
  shouldRetrySame,
  kindForEmptyChain,
  AiErrorKind,
  AiErrorVerdict,
} from './ai-error';
import {
  ChainEntry,
  EmptyChainCode,
  selectCandidates,
  explainEmptyChain,
  emptyChainCode,
} from './provider-chain';
import { backoffDelay } from './backoff';
import { retryAfterSeconds, cooldownFor } from './quota-cooldown';
import { utcDayStart, utcMonthStart } from './usage-window';
import { callCost, CallCost } from './ai-cost';

/** What one attempt needs in order to call a provider. */
export interface ResolvedCredential {
  configId: string | null;
  apiKey: string;
  provider: string;
  model?: string | null;
  companyId: string;
  companyName: string;
}

/**
 * A company's chain and everything the loop over it needs.
 *
 * The encrypted keys travel beside the entries rather than inside them, because
 * ChainEntry is the routing type: it is passed to pure functions, logged around and
 * has no business carrying key material. Loading them here is what stops the loop
 * re-reading the same two rows once per provider.
 */
interface ChainContext {
  entries: ChainEntry[];
  companyName: string;
  /** Encrypted key per entry id, still encrypted. */
  keys: Map<string, string | null>;
}

/**
 * Which HTTP status a classified AI failure deserves.
 *
 * The distinction that matters to a caller is whose problem it is. A prompt that was
 * refused or too long is the request's fault and will fail identically on a retry, so
 * it is a 4xx. A route we never deployed is ours, so it is a 500. Everything else is
 * the upstream being unwilling right now, which is what 503 means.
 */
const STATUS_FOR_KIND: Partial<Record<AiErrorKind, number>> = {
  CONTENT_FILTER: HttpStatus.BAD_REQUEST,
  CONTEXT_TOO_LARGE: HttpStatus.BAD_REQUEST,
  MAX_OUTPUT_REACHED: HttpStatus.BAD_REQUEST,
  BAD_REQUEST: HttpStatus.BAD_REQUEST,
  ENDPOINT_NOT_FOUND: HttpStatus.INTERNAL_SERVER_ERROR,
};

/**
 * An HttpException, deliberately, rather than a plain Error.
 *
 * It used to be a plain Error with a `kind` nobody outside this process could read.
 * Nest turns an unrecognised throw into `{"statusCode":500,"message":"Internal server
 * error"}`, so every one of these arrived at the browser identical and meaningless, and
 * the whole point of classifying failures was lost at the last hop. `userFacingMessage`
 * was being computed carefully and then discarded.
 *
 * The body carries `kind` so a client can tell a permanent state that needs an
 * administrator from a passing one worth retrying. It carries no provider name, no
 * upstream status and nothing derived from a key, which is the same rule the message
 * itself follows.
 */
export class AiUnavailableError extends HttpException {
  constructor(
    readonly kind: AiErrorKind,
    readonly attempts: number,
    message: string,
  ) {
    super(
      {
        statusCode: STATUS_FOR_KIND[kind] ?? HttpStatus.SERVICE_UNAVAILABLE,
        error: 'AI Unavailable',
        kind,
        message,
      },
      STATUS_FOR_KIND[kind] ?? HttpStatus.SERVICE_UNAVAILABLE,
    );
    this.name = 'AiUnavailableError';
  }
}

/**
 * The one place that decides which provider serves a request, and what to do when it
 * will not.
 *
 * Callers hand it a function that does the work against one credential; the gateway
 * supplies credentials until something answers. Nothing above it knows that Groq or
 * Gemini exist, which is the point: a provider becomes a row in a table rather than a
 * branch in a service.
 *
 * State lives in Postgres, not memory. The breaker this replaces was an in-memory Map,
 * so it forgot everything on each deploy and would be wrong the moment a second
 * instance existed. A cooldown timestamp on the row survives both and needs no Redis
 * until there is something a row cannot express.
 */
@Injectable()
export class AiGatewayService {
  private readonly logger = new Logger(AiGatewayService.name);

  /** Attempts per entry before moving on. Small, because the chain is the real cure. */
  private readonly MAX_ATTEMPTS_PER_ENTRY = 2;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => CompaniesService))
    private readonly companies: CompaniesService,
  ) {}

  /**
   * Run the work against the first provider that answers.
   *
   * Every failure is classified before anything is decided: a content filter stops the
   * whole thing, a rate limit rests that entry and moves on, a rejected key is retired.
   * The caller gets a result or one clean error, never a provider's own vocabulary.
   */
  async execute<T>(
    companyId: string,
    work: (credential: ResolvedCredential) => Promise<T>,
    opts: {
      label?: string;
      /**
       * Wall-clock ceiling for the whole walk, in milliseconds.
       *
       * Without one, a long chain of hanging providers can outlive the browser waiting
       * on it: four entries at two attempts each, on a 22 second per-attempt timeout,
       * is nearly three minutes, and the answer arrives to nobody. Chat sets this
       * because a person is watching; a background call can leave it unset and let the
       * chain run its length.
       *
       * It bounds when a new attempt may START. An attempt already in flight keeps its
       * own timeout, since abandoning it would waste a call that has already been paid
       * for upstream.
       */
      deadlineMs?: number;
    } = {},
  ): Promise<T> {
    const requestId = Math.random().toString(36).slice(2, 10);
    const label = opts.label ?? 'ai';
    const endBy = opts.deadlineMs ? Date.now() + opts.deadlineMs : undefined;
    const chain = await this.loadChain(companyId);
    const candidates = selectCandidates(chain.entries);

    if (candidates.length === 0) {
      // The reason is carried through to the caller, not only to the log. "No provider
      // configured" is permanent until an administrator acts, and rendering it as the
      // generic "briefly unavailable" asks the user to wait for something nobody is
      // doing.
      const kind = kindForEmptyChain(emptyChainCode(chain.entries));
      this.logger.warn(
        `[${requestId}] ${label} for company ${companyId}: ${explainEmptyChain(chain.entries)}`,
      );
      throw new AiUnavailableError(kind, 0, userFacingMessage(kind));
    }

    let attempts = 0;
    let lastKind: AiErrorKind = 'UNKNOWN';
    let lastMessage = userFacingMessage('UNKNOWN');

    /** True once there is not enough time left for an attempt to be worth starting. */
    const outOfTime = () => endBy !== undefined && Date.now() >= endBy;

    for (const entry of candidates) {
      if (outOfTime()) break;

      const credential = await this.credentialFor(entry, companyId, chain);
      if (!credential) continue;

      for (let tryNo = 1; tryNo <= this.MAX_ATTEMPTS_PER_ENTRY; tryNo++) {
        if (outOfTime()) break;

        attempts++;
        const startedAt = new Date();

        try {
          const result = await work(credential);
          await this.recordSuccess(entry, companyId, Date.now() - startedAt.getTime(), {
            attemptStartedAt: startedAt,
            result,
          });
          if (attempts > 1) {
            this.logger.log(
              `[${requestId}] ${label} answered by ${entry.provider} after ${attempts} attempts`,
            );
          }
          return result;
        } catch (error: any) {
          const verdict = classifyAiError(error);
          lastKind = verdict.kind;
          lastMessage = userFacingMessage(verdict.kind);

          this.logger.warn(
            `[${requestId}] ${label} attempt ${attempts}: ${entry.provider}` +
              `${entry.model ? '/' + entry.model : ''} gave ${verdict.kind}`,
          );

          const cooldownApplied = await this.recordFailure(entry, companyId, verdict, error);

          // The prompt is the problem, or our own deployment is, so another provider
          // gives the same answer.
          if (!verdict.fallback && !verdict.retrySame) {
            throw new AiUnavailableError(verdict.kind, attempts, lastMessage);
          }

          if (shouldRetrySame(verdict, {
            cooldownApplied,
            tryNo,
            maxAttempts: this.MAX_ATTEMPTS_PER_ENTRY,
          })) {
            await this.sleep(backoffDelay(tryNo, retryAfterSeconds(error)));
            continue;
          }
          break; // move on to the next entry in the chain
        }
      }
    }

    if (outOfTime()) {
      this.logger.error(
        `[${requestId}] ${label} ran out of time after ${attempts} attempts for company ${companyId}`,
      );
      throw new AiUnavailableError('TIMEOUT', attempts, userFacingMessage('TIMEOUT'));
    }

    this.logger.error(
      `[${requestId}] ${label} exhausted ${candidates.length} providers over ${attempts} attempts for company ${companyId}`,
    );
    throw new AiUnavailableError(lastKind, attempts, lastMessage);
  }

  /**
   * A company's chain, including the legacy single key when no chain is configured.
   *
   * Backward compatibility lives here and nowhere else. A tenant that never touched the
   * new table behaves exactly as before, expressed as a chain of one, so everything
   * downstream can assume a chain exists.
   *
   * Two queries either way, whatever the chain's length. The company row is read once
   * because its name does not change between providers, and the keys come back with
   * the configs they belong to.
   */
  private async loadChain(companyId: string): Promise<ChainContext> {
    const [company, configs] = await Promise.all([
      this.prisma.company.findUnique({
        where: { id: companyId },
        select: { name: true, aiEnabled: true, aiApiKey: true, aiProvider: true },
      }),
      this.prisma.aiProviderConfig.findMany({
        where: { companyId },
        select: {
          id: true,
          provider: true,
          model: true,
          priority: true,
          enabled: true,
          isEmergency: true,
          monthlyBudget: true,
          status: true,
          cooldownUntil: true,
          createdAt: true,
          encryptedKey: true,
        },
      }),
    ]);

    const empty: ChainContext = { entries: [], companyName: company?.name ?? '', keys: new Map() };
    if (!company) return empty;

    if (configs.length > 0) {
      const spend = await this.monthlySpend(configs.map((c) => c.id));
      return {
        companyName: company.name,
        keys: new Map(configs.map((c) => [c.id, c.encryptedKey])),
        entries: configs.map((c) => ({
          id: c.id,
          provider: c.provider,
          model: c.model,
          priority: c.priority,
          enabled: c.enabled,
          isEmergency: c.isEmergency,
          monthlyBudget: c.monthlyBudget,
          status: c.status as ChainEntry['status'],
          cooldownUntil: c.cooldownUntil,
          createdAt: c.createdAt,
          spentThisMonth: spend.get(c.id) ?? 0,
        })),
      };
    }

    if (!company.aiEnabled || !company.aiApiKey) return empty;

    return {
      companyName: company.name,
      keys: new Map([['legacy', company.aiApiKey]]),
      entries: [
        {
          id: 'legacy',
          provider: company.aiProvider || 'gemini',
          priority: 1,
          enabled: true,
          isEmergency: false,
          status: 'HEALTHY',
          createdAt: new Date(0),
        },
      ],
    };
  }

  private async monthlySpend(configIds: string[]): Promise<Map<string, number>> {
    if (configIds.length === 0) return new Map();

    const rows = await this.prisma.aiProviderUsage.groupBy({
      by: ['configId'],
      where: { configId: { in: configIds }, date: { gte: utcMonthStart() } },
      _sum: { estimatedCost: true },
    });

    return new Map(rows.map((r) => [r.configId, r._sum.estimatedCost ?? 0]));
  }

  /** Decrypted at the last possible moment, and never allowed out of this object. */
  private async credentialFor(
    entry: ChainEntry,
    companyId: string,
    chain: Pick<ChainContext, 'companyName' | 'keys'>,
  ): Promise<ResolvedCredential | null> {
    const encrypted = chain.keys.get(entry.id) ?? null;
    if (!encrypted) return null;

    const apiKey = this.companies.decryptApiKey(encrypted);
    if (!apiKey || apiKey.includes('[DECRYPTION_FAILED]')) {
      // A key that will not decrypt can never work, and the fault is ours rather than
      // the provider's. Retire it so the chain moves on and the admin sees why.
      await this.markStatus(entry, 'INVALID_KEY', 'Key could not be decrypted. Re-enter it.');
      return null;
    }

    return {
      configId: entry.id === 'legacy' ? null : entry.id,
      apiKey,
      provider: entry.provider,
      model: entry.model,
      companyId,
      companyName: chain.companyName,
    };
  }

  /**
   * Mark the entry healthy again, without undoing a decision made after we set off.
   *
   * The race: this attempt starts at t=0 against an entry that is available, a second
   * request rate-limits the same entry at t=1 and writes a cooldown, and this one comes
   * back successful at t=5. Clearing unconditionally would erase a cooldown that is
   * newer than anything we know, and leave an entry the provider is actively refusing
   * marked HEALTHY. Since an attempt only ever begins on an entry whose cooldown has
   * already passed, any cooldown still in the future was written during our attempt,
   * and it wins. Skipping the row entirely in that case is deliberate: the other
   * request's failure is the more recent truth about the entry.
   *
   * Pass no start time to clear regardless, which is what a deliberate test of an entry
   * wants: proving the key works is exactly how an admin brings one back into service.
   *
   * This is also where a call is priced. Success is the only moment the gateway holds
   * both the entry that was billed and the answer it produced, and the monthly budget
   * is worth nothing unless something writes a number down here.
   */
  private async recordSuccess(
    entry: ChainEntry,
    companyId: string,
    latencyMs: number,
    opts: { attemptStartedAt?: Date; result?: unknown } = {},
  ): Promise<void> {
    if (entry.id === 'legacy') return;
    const notBenchedSince = opts.attemptStartedAt
      ? { OR: [{ cooldownUntil: null }, { cooldownUntil: { lte: opts.attemptStartedAt } }] }
      : {};

    const cost = this.priceOf(entry, opts.result);

    try {
      await this.prisma.$transaction([
        this.prisma.aiProviderConfig.updateMany({
          where: { id: entry.id, ...notBenchedSince },
          data: {
            status: 'HEALTHY',
            cooldownUntil: null,
            lastError: null,
            failureCount: 0,
            lastSuccessAt: new Date(),
          },
        }),
        this.usageUpsert(entry.id, companyId, { latencyMs, failed: false, cost }),
      ]);
    } catch (e: any) {
      this.logger.error(`Could not record AI success: ${e.message}`);
    }
  }

  /**
   * What this call cost, or nothing if the sum itself broke.
   *
   * Pricing is arithmetic over a table and should not be able to fail, but it sits in
   * the success path of every AI request in the product. A thrown error here would turn
   * a good answer into an outage, which is a far worse failure than a missing row of
   * spend.
   *
   * The counts are estimates today: ai-service returns no token counts, so callCost
   * assumes the prompt it cannot see and derives the answer from the response length.
   * It says which it did in `basis`, and that word is logged rather than dropped so the
   * day the figures become real is visible in the logs.
   */
  private priceOf(entry: ChainEntry, result: unknown): CallCost | undefined {
    try {
      const cost = callCost(entry.provider, entry.model, result);
      if (cost.basis === 'estimated') {
        this.logger.debug(
          `Estimated $${cost.estimatedCost} for ${entry.provider}${entry.model ? '/' + entry.model : ''}`,
        );
      }
      return cost;
    } catch (e: any) {
      this.logger.error(`Could not price an AI call: ${e.message}`);
      return undefined;
    }
  }

  /**
   * Record what a failure says about the entry, and return whether it was benched.
   *
   * The caller needs the answer: an entry that has just been given a cooldown must not
   * then be retried by the very request that benched it.
   */
  private async recordFailure(
    entry: ChainEntry,
    companyId: string,
    verdict: AiErrorVerdict,
    error: any,
  ): Promise<boolean> {
    // Some failures are ours. A 404 from our own AI service never reached a provider,
    // so counting it against one is how a single undeployed route makes four healthy
    // keys look broken on the dashboard, and how their usage rows grow failures they
    // did not cause.
    if (!verdict.blameEntry) return false;
    if (entry.id === 'legacy') return false;

    // cooldownFor clamps a provider's Retry-After to MAX_COOLDOWN_SECONDS, so one bad
    // header cannot bench an entry for a day. It is applied only where the verdict
    // already calls for a rest, because cooldownFor's own default would otherwise
    // invent ninety seconds for kinds that deliberately have none, such as a timeout.
    const seconds = verdict.cooldownSeconds
      ? cooldownFor(retryAfterSeconds(error) ?? verdict.cooldownSeconds)
      : undefined;

    try {
      await this.prisma.$transaction([
        this.prisma.aiProviderConfig.update({
          where: { id: entry.id },
          data: {
            failureCount: { increment: 1 },
            ...(verdict.status ? { status: verdict.status } : {}),
            ...(seconds ? { cooldownUntil: new Date(Date.now() + seconds * 1000) } : {}),
            // The kind only. A provider's raw text can quote the prompt back at us, and
            // this column is shown in the admin UI.
            lastError: verdict.kind,
          },
        }),
        this.usageUpsert(entry.id, companyId, { latencyMs: 0, failed: true }),
      ]);
    } catch (e: any) {
      this.logger.error(`Could not record AI failure: ${e.message}`);
    }

    return seconds !== undefined;
  }

  private async markStatus(entry: ChainEntry, status: string, reason: string): Promise<void> {
    if (entry.id === 'legacy') return;
    await this.prisma.aiProviderConfig
      .update({ where: { id: entry.id }, data: { status, lastError: reason } })
      .catch(() => undefined);
  }

  /**
   * One day's counters for one entry.
   *
   * Returned rather than awaited so it can share a transaction with the status write:
   * the two are one fact about one attempt, and half of it landing is a dashboard that
   * disagrees with itself. The cost is in the same transaction for the same reason, and
   * because monthlySpend sums these rows to decide whether an entry may be used again.
   *
   * A failed attempt carries no cost. It produced no response to measure, and a
   * provider that refused before generating anything charged nothing. The gap is a
   * failure that billed for a prompt it did read; there is no way to see that from here
   * and it is not worth inventing a number for.
   */
  private usageUpsert(
    configId: string,
    companyId: string,
    opts: { latencyMs: number; failed: boolean; cost?: CallCost },
  ) {
    const date = utcDayStart();
    const inputTokens = opts.cost?.inputTokens ?? 0;
    const outputTokens = opts.cost?.outputTokens ?? 0;
    const estimatedCost = opts.cost?.estimatedCost ?? 0;

    return this.prisma.aiProviderUsage.upsert({
      where: { configId_date: { configId, date } },
      create: {
        configId,
        companyId,
        date,
        requests: 1,
        failures: opts.failed ? 1 : 0,
        totalLatencyMs: opts.latencyMs,
        inputTokens,
        outputTokens,
        estimatedCost,
      },
      update: {
        requests: { increment: 1 },
        failures: { increment: opts.failed ? 1 : 0 },
        totalLatencyMs: { increment: opts.latencyMs },
        inputTokens: { increment: inputTokens },
        outputTokens: { increment: outputTokens },
        estimatedCost: { increment: estimatedCost },
      },
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Prove one entry works, by using it.
   *
   * Deliberately narrow: it runs the given entry and only that entry, because the point
   * is to learn whether this key is good. Going through execute would let the chain
   * rescue it and report success for a key that never answered.
   *
   * Success clears the entry's health, so testing a provider after topping up a quota
   * also brings it back into service.
   *
   * A failure is reported, not punished. The button exists to tell an admin what is
   * happening, and an admin who presses it during a thirty second rate-limit spike must
   * not thereby remove a working provider from the chain for the next fifteen minutes.
   * The diagnostic causing the outage it is diagnosing is the worst kind of tool.
   */
  async testEntry(configId: string): Promise<void> {
    const row = await this.prisma.aiProviderConfig.findUnique({
      where: { id: configId },
      select: {
        id: true,
        companyId: true,
        provider: true,
        model: true,
        priority: true,
        isEmergency: true,
        createdAt: true,
        encryptedKey: true,
        company: { select: { name: true } },
      },
    });
    if (!row) throw new Error('That provider entry no longer exists.');

    const entry: ChainEntry = {
      id: row.id,
      provider: row.provider,
      model: row.model,
      priority: row.priority,
      enabled: true,
      isEmergency: row.isEmergency,
      status: 'HEALTHY',
      createdAt: row.createdAt,
    };

    const credential = await this.credentialFor(entry, row.companyId, {
      companyName: row.company.name,
      keys: new Map([[row.id, row.encryptedKey]]),
    });
    if (!credential) throw new Error('That key could not be read. Enter it again.');

    const startedAt = Date.now();
    try {
      // A probe is a real call on a real key, so it is priced like one.
      const answer = await this.probe(credential);
      await this.recordSuccess(entry, row.companyId, Date.now() - startedAt, { result: answer });
    } catch (error: any) {
      const verdict = classifyAiError(error);
      await this.recordProbeResult(entry, row.companyId, verdict);
      throw new Error(userFacingMessage(verdict.kind));
    }
  }

  /**
   * What a failed test writes down: what happened, and nothing else.
   *
   * No cooldown and no failureCount, because a probe is not traffic and the entry is
   * not at fault for being asked. A rejected key is the one exception, and it is the
   * exception on purpose: the test is the authoritative check of exactly that, waiting
   * never turns a rejected key into a good one, and leaving it HEALTHY means every real
   * request keeps being routed to a credential the provider has already refused.
   */
  private async recordProbeResult(
    entry: ChainEntry,
    companyId: string,
    verdict: AiErrorVerdict,
  ): Promise<void> {
    const retireIt = verdict.status === 'INVALID_KEY';
    try {
      await this.prisma.$transaction([
        this.prisma.aiProviderConfig.update({
          where: { id: entry.id },
          data: {
            lastError: verdict.kind,
            ...(retireIt ? { status: 'INVALID_KEY' } : {}),
          },
        }),
        this.usageUpsert(entry.id, companyId, { latencyMs: 0, failed: true }),
      ]);
    } catch (e: any) {
      this.logger.error(`Could not record AI test result: ${e.message}`);
    }
  }

  /**
   * The smallest real call that proves a credential.
   *
   * Injected by AiService at startup rather than imported, because the gateway must not
   * depend on the service that depends on it. Without one, a test reports that it
   * cannot check rather than pretending the key is fine.
   */
  private prober?: (credential: ResolvedCredential) => Promise<unknown>;

  registerProber(fn: (credential: ResolvedCredential) => Promise<unknown>): void {
    this.prober = fn;
  }

  private async probe(credential: ResolvedCredential): Promise<unknown> {
    if (!this.prober) throw new Error('Testing is unavailable right now.');
    return this.prober(credential);
  }

  /** What the admin dashboard reads. Never contains a key. */
  /**
   * Whether this company can use AI at all, and if not, why.
   *
   * The one place anything outside this service may ask that question. The status
   * endpoint used to answer it itself, from `Company.aiEnabled && Company.aiApiKey`,
   * which is the legacy single key: a company whose providers were all configured
   * through the Settings chain reported "AI is not enabled", and the chat composer
   * disabled itself for a tenant with three working providers. Anything that decides
   * whether to offer AI has to ask the thing that actually routes it.
   *
   * `configured` is "somebody has set this up", `available` is "a request would find a
   * provider right now". They differ while every entry is cooling off, which is a real
   * and temporary state that must not read as unconfigured.
   */
  async statusFor(companyId: string): Promise<{
    configured: boolean;
    available: boolean;
    reason: EmptyChainCode | null;
    provider: string | null;
  }> {
    const chain = await this.loadChain(companyId);
    const candidates = selectCandidates(chain.entries);

    if (candidates.length > 0) {
      return {
        configured: true,
        available: true,
        reason: null,
        provider: candidates[0].provider,
      };
    }

    const reason = emptyChainCode(chain.entries);
    return {
      configured: chain.entries.length > 0,
      available: false,
      reason,
      provider: chain.entries[0]?.provider ?? null,
    };
  }

  async healthFor(companyId: string) {
    const configs = await this.prisma.aiProviderConfig.findMany({
      where: { companyId },
      orderBy: [{ isEmergency: 'asc' }, { priority: 'asc' }],
      select: {
        id: true,
        provider: true,
        model: true,
        label: true,
        priority: true,
        enabled: true,
        isEmergency: true,
        monthlyBudget: true,
        status: true,
        cooldownUntil: true,
        lastError: true,
        lastSuccessAt: true,
        failureCount: true,
      },
    });

    const spend = await this.monthlySpend(configs.map((c) => c.id));
    return configs.map((c) => ({ ...c, spentThisMonth: spend.get(c.id) ?? 0 }));
  }
}
