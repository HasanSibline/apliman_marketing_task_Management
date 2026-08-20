import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CompaniesService } from '../companies/companies.service';
import { classifyAiError, userFacingMessage, AiErrorKind, AiErrorVerdict } from './ai-error';
import { ChainEntry, selectCandidates, explainEmptyChain } from './provider-chain';
import { backoffDelay } from './backoff';
import { retryAfterSeconds } from './quota-cooldown';

/** What one attempt needs in order to call a provider. */
export interface ResolvedCredential {
  configId: string | null;
  apiKey: string;
  provider: string;
  model?: string | null;
  companyId: string;
  companyName: string;
}

export class AiUnavailableError extends Error {
  constructor(
    readonly kind: AiErrorKind,
    readonly attempts: number,
    message: string,
  ) {
    super(message);
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
    opts: { label?: string } = {},
  ): Promise<T> {
    const requestId = Math.random().toString(36).slice(2, 10);
    const label = opts.label ?? 'ai';
    const entries = await this.loadChain(companyId);
    const candidates = selectCandidates(entries);

    if (candidates.length === 0) {
      const why = explainEmptyChain(entries);
      this.logger.warn(`[${requestId}] ${label} for company ${companyId}: ${why}`);
      throw new AiUnavailableError('UNKNOWN', 0, userFacingMessage('UNKNOWN'));
    }

    let attempts = 0;
    let lastKind: AiErrorKind = 'UNKNOWN';
    let lastMessage = userFacingMessage('UNKNOWN');

    for (const entry of candidates) {
      const credential = await this.credentialFor(entry, companyId);
      if (!credential) continue;

      for (let tryNo = 1; tryNo <= this.MAX_ATTEMPTS_PER_ENTRY; tryNo++) {
        attempts++;
        const startedAt = Date.now();

        try {
          const result = await work(credential);
          await this.recordSuccess(entry, Date.now() - startedAt);
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

          await this.recordFailure(entry, verdict, error);

          // The prompt is the problem, so another provider gives the same answer.
          if (!verdict.fallback && !verdict.retrySame) {
            throw new AiUnavailableError(verdict.kind, attempts, lastMessage);
          }

          if (verdict.retrySame && tryNo < this.MAX_ATTEMPTS_PER_ENTRY) {
            await this.sleep(backoffDelay(tryNo, retryAfterSeconds(error)));
            continue;
          }
          break; // move on to the next entry in the chain
        }
      }
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
   */
  private async loadChain(companyId: string): Promise<ChainEntry[]> {
    const configs = await this.prisma.aiProviderConfig.findMany({ where: { companyId } });

    if (configs.length > 0) {
      const spend = await this.monthlySpend(configs.map((c) => c.id));
      return configs.map((c) => ({
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
      }));
    }

    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { aiEnabled: true, aiApiKey: true, aiProvider: true },
    });
    if (!company?.aiEnabled || !company.aiApiKey) return [];

    return [
      {
        id: 'legacy',
        provider: company.aiProvider || 'gemini',
        priority: 1,
        enabled: true,
        isEmergency: false,
        status: 'HEALTHY',
        createdAt: new Date(0),
      },
    ];
  }

  private async monthlySpend(configIds: string[]): Promise<Map<string, number>> {
    if (configIds.length === 0) return new Map();

    const since = new Date();
    since.setDate(1);
    since.setHours(0, 0, 0, 0);

    const rows = await this.prisma.aiProviderUsage.groupBy({
      by: ['configId'],
      where: { configId: { in: configIds }, date: { gte: since } },
      _sum: { estimatedCost: true },
    });

    return new Map(rows.map((r) => [r.configId, r._sum.estimatedCost ?? 0]));
  }

  /** Decrypted at the last possible moment, and never allowed out of this object. */
  private async credentialFor(
    entry: ChainEntry,
    companyId: string,
  ): Promise<ResolvedCredential | null> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true, aiApiKey: true },
    });
    if (!company) return null;

    let encrypted: string | null = null;
    if (entry.id === 'legacy') {
      encrypted = company.aiApiKey;
    } else {
      const row = await this.prisma.aiProviderConfig.findUnique({
        where: { id: entry.id },
        select: { encryptedKey: true },
      });
      encrypted = row?.encryptedKey ?? null;
    }
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
      companyName: company.name,
    };
  }

  private async recordSuccess(entry: ChainEntry, latencyMs: number): Promise<void> {
    if (entry.id === 'legacy') return;
    try {
      await this.prisma.aiProviderConfig.update({
        where: { id: entry.id },
        data: {
          status: 'HEALTHY',
          cooldownUntil: null,
          lastError: null,
          failureCount: 0,
          lastSuccessAt: new Date(),
        },
      });
      await this.bumpUsage(entry, { latencyMs, failed: false });
    } catch (e: any) {
      this.logger.error(`Could not record AI success: ${e.message}`);
    }
  }

  private async recordFailure(
    entry: ChainEntry,
    verdict: AiErrorVerdict,
    error: any,
  ): Promise<void> {
    if (entry.id === 'legacy') return;
    try {
      const seconds = retryAfterSeconds(error) ?? verdict.cooldownSeconds;

      await this.prisma.aiProviderConfig.update({
        where: { id: entry.id },
        data: {
          failureCount: { increment: 1 },
          ...(verdict.status ? { status: verdict.status } : {}),
          ...(seconds ? { cooldownUntil: new Date(Date.now() + seconds * 1000) } : {}),
          // The kind only. A provider's raw text can quote the prompt back at us, and
          // this column is shown in the admin UI.
          lastError: verdict.kind,
        },
      });
      await this.bumpUsage(entry, { latencyMs: 0, failed: true });
    } catch (e: any) {
      this.logger.error(`Could not record AI failure: ${e.message}`);
    }
  }

  private async markStatus(entry: ChainEntry, status: string, reason: string): Promise<void> {
    if (entry.id === 'legacy') return;
    await this.prisma.aiProviderConfig
      .update({ where: { id: entry.id }, data: { status, lastError: reason } })
      .catch(() => undefined);
  }

  private async bumpUsage(
    entry: ChainEntry,
    opts: { latencyMs: number; failed: boolean },
  ): Promise<void> {
    if (entry.id === 'legacy') return;

    const date = new Date();
    date.setHours(0, 0, 0, 0);

    const config = await this.prisma.aiProviderConfig.findUnique({
      where: { id: entry.id },
      select: { companyId: true },
    });
    if (!config) return;

    await this.prisma.aiProviderUsage.upsert({
      where: { configId_date: { configId: entry.id, date } },
      create: {
        configId: entry.id,
        companyId: config.companyId,
        date,
        requests: 1,
        failures: opts.failed ? 1 : 0,
        totalLatencyMs: opts.latencyMs,
      },
      update: {
        requests: { increment: 1 },
        failures: { increment: opts.failed ? 1 : 0 },
        totalLatencyMs: { increment: opts.latencyMs },
      },
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /** What the admin dashboard reads. Never contains a key. */
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
