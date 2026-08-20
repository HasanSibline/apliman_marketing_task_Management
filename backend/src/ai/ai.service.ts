import { Injectable, Logger, Inject, forwardRef, HttpException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { firstValueFrom } from 'rxjs';
import { PerformanceInsightsDto } from './dto/performance-insights.dto';
import { CompaniesService } from '../companies/companies.service';
import { AIFeature } from '@prisma/client';
import {
  retryAfterSeconds,
  cooldownFor,
  isSameIncident,
  STRIKE_DEBOUNCE_SECONDS,
} from './quota-cooldown';

/**
 * How long a rate-limit lockout lasts, when the provider does not tell us.
 *
 * This was an hour, which is what made AI unusable after a couple of prompts. Free
 * tiers limit requests per *minute*: Gemini free allows about fifteen, Groq similar.
 * That limit clears in sixty seconds, so answering it with a sixty minute lockout was
 * sixty times longer than the thing it was protecting against, and the company spent
 * the other fifty-nine minutes locked out of a provider that would have answered.
 *
 * Providers usually say how long to wait. That is honoured when present, and this is
 * only the floor for when it is not.
 */

/**
 * Rate-limit errors arriving closer together than this are one incident.
 *
 * Creating a single task fires generateContentFromAI and generateSubtasks back to
 * back, and a chat message costs two upstream calls. On a per-minute limit those all
 * fail together, which counted as several strikes for what the user experienced as
 * one action. Five strikes then arrived in about two prompts, and the hour began.
 */

/** Window over which strikes accumulate before a lockout is considered. */
const QUOTA_RESET_MINUTES = 15;

/**
 * How many upstream rate-limit errors a company may hit inside QUOTA_RESET_MINUTES
 * before AI is disabled for the rest of the window.
 *
 * A single 429 is normal on free provider tiers (Gemini free is ~15 requests/min and
 * one chat message costs 2+ calls). Tripping the company-wide breaker on the first
 * one is what made AI unusable after a single message. We only stop serving after
 * repeated failures, and the window always expires.
 */
const QUOTA_STRIKES_BEFORE_LOCKOUT = 5;

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly aiServiceUrl: string;

  /** Rolling per-company rate-limit strike counter (see recordQuotaStrike). */
  private readonly quotaStrikes = new Map<string, { count: number; windowStart: number; lastAt: number }>();

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => CompaniesService))
    private readonly companiesService: CompaniesService,
  ) {
    this.aiServiceUrl = this.configService.get<string>('AI_SERVICE_URL', 'http://localhost:8001');
  }

  /** Authorization headers sent with every AI service request */
  private get aiServiceHeaders(): Record<string, string> {
    const secret = this.configService.get<string>('AI_SERVICE_SECRET', '');
    return secret ? { Authorization: `Bearer ${secret}` } : {};
  }

  // ─────────────────────────────────────────────────────────────────────────
  // QUOTA STATUS
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get the current AI quota status for the user's company.
   * If quota was exhausted but the reset time has passed, auto-clear the flag.
   */
  async getQuotaStatus(userId: string): Promise<{
    aiEnabled: boolean;
    quotaExhausted: boolean;
    quotaResetAt: Date | null;
    provider: string;
    myUsage: Record<string, number>;
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { companyId: true },
    });

    // No company, no AI. There is no shared credential to report on any more.
    if (!user?.companyId) {
      return { aiEnabled: false, quotaExhausted: false, quotaResetAt: null, provider: 'none', myUsage: {} };
    }

    const company = await this.prisma.company.findUnique({
      where: { id: user.companyId },
      select: {
        aiEnabled: true,
        aiApiKey: true,
        aiProvider: true,
        aiQuotaExhausted: true,
        aiQuotaResetAt: true,
        subscriptionPlan: true,
      },
    });

    if (!company) {
      return { aiEnabled: false, quotaExhausted: false, quotaResetAt: null, provider: 'none', myUsage: {} };
    }

    let quotaExhausted = company.aiQuotaExhausted;

    // Auto-reset: clear the flag once its window passed, or if it never had one
    // (a legacy row written by the old permanent-lockout logic).
    if (quotaExhausted && (!company.aiQuotaResetAt || new Date() > company.aiQuotaResetAt)) {
      await this.prisma.company.update({
        where: { id: user.companyId },
        data: { aiQuotaExhausted: false, aiQuotaResetAt: null },
      });
      quotaExhausted = false;
    }

    // Per-user usage this month
    const monthYear = this.currentMonthYear();
    const usageRows = await this.prisma.userAIUsage.findMany({
      where: { userId, monthYear },
    });
    const myUsage: Record<string, number> = {};
    for (const row of usageRows) {
      myUsage[row.feature] = row.count;
    }

    const hasCompanyKey = company.aiEnabled && !!company.aiApiKey;

    return {
      aiEnabled: hasCompanyKey,
      quotaExhausted,
      quotaResetAt: quotaExhausted ? company.aiQuotaResetAt : null,
      provider: company.aiProvider || 'gemini',
      myUsage,
    };
  }

  /**
   * Admin-only: Get per-user AI usage for the current month for the calling admin's company.
   */
  async getCompanyUsage(userId: string): Promise<{ users: any[] }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { companyId: true },
    });

    if (!user?.companyId) return { users: [] };

    const monthYear = this.currentMonthYear();

    const rows = await this.prisma.userAIUsage.findMany({
      where: { companyId: user.companyId, monthYear },
      include: {
        user: { select: { id: true, name: true, position: true, avatar: true } },
      },
      orderBy: { count: 'desc' },
    });

    // Group by user
    const byUser: Record<string, any> = {};
    for (const row of rows) {
      if (!byUser[row.userId]) {
        byUser[row.userId] = {
          userId: row.userId,
          name: row.user.name,
          position: row.user.position,
          avatar: row.user.avatar,
          CHAT: 0,
          TASK_GENERATION: 0,
          SUBTASK_GENERATION: 0,
          MEETING_SUMMARY: 0,
          total: 0,
        };
      }
      byUser[row.userId][row.feature] = row.count;
      byUser[row.userId].total += row.count;
    }

    return { users: Object.values(byUser) };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // INTERNAL HELPERS
  // ─────────────────────────────────────────────────────────────────────────

  private currentMonthYear(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  /**
   * Increment a user's usage counter for a feature (fire-and-forget).
   */
  private async trackUsage(userId: string, companyId: string, feature: AIFeature): Promise<void> {
    try {
      const monthYear = this.currentMonthYear();
      await this.prisma.userAIUsage.upsert({
        where: { userId_feature_monthYear: { userId, feature, monthYear } },
        update: { count: { increment: 1 } },
        create: { userId, companyId, feature, count: 1, monthYear },
      });
    } catch (e) {
      this.logger.warn(`Failed to track AI usage for user ${userId}: ${e.message}`);
    }
  }

  /**
   * Record an upstream rate-limit hit for a company.
   *
   * Only after QUOTA_STRIKES_BEFORE_LOCKOUT strikes inside one window do we flag the
   * company, and the flag ALWAYS carries a reset time so it expires on its own. The
   * previous behaviour, flag on the first 429, with a null reset for FREE_TRIAL , 
   * meant one rate-limited message permanently disabled AI for the whole company.
   */

  private async recordQuotaStrike(companyId: string, retryHintSeconds?: number): Promise<void> {
    try {
      const now = Date.now();
      const windowMs = QUOTA_RESET_MINUTES * 60 * 1000;
      const entry = this.quotaStrikes.get(companyId);
      const inWindow = entry && now - entry.windowStart < windowMs;

      // One action, one strike. Creating a task fires two AI calls and a chat message
      // fires two more; on a per-minute limit they fail together, and counting each as
      // its own strike reached the lockout in about two prompts.
      if (inWindow && isSameIncident(entry.lastAt, now)) {
        this.logger.warn(
          `AI rate limit for company ${companyId}, within ${STRIKE_DEBOUNCE_SECONDS}s of the last one. Same incident, not counted again.`,
        );
        return;
      }

      const strikes = inWindow ? entry.count + 1 : 1;
      const windowStart = inWindow ? entry.windowStart : now;
      this.quotaStrikes.set(companyId, { count: strikes, windowStart, lastAt: now });

      if (strikes < QUOTA_STRIKES_BEFORE_LOCKOUT) {
        this.logger.warn(
          `AI rate limit for company ${companyId} (strike ${strikes}/${QUOTA_STRIKES_BEFORE_LOCKOUT}). Still serving.`,
        );
        return;
      }

      const company = await this.prisma.company.findUnique({
        where: { id: companyId },
        select: { aiQuotaExhausted: true },
      });
      if (!company || company.aiQuotaExhausted) return; // already flagged

      // Long enough to let the limit clear, short enough that the company is not
      // locked out of a provider that would answer. The provider's own figure wins
      // when it sent one.
      const cooldownSeconds = cooldownFor(retryHintSeconds);
      const resetAt = new Date(now + cooldownSeconds * 1000);

      await this.prisma.company.update({
        where: { id: companyId },
        data: { aiQuotaExhausted: true, aiQuotaResetAt: resetAt },
      });

      this.logger.warn(
        `⚠️ AI quota marked exhausted for company ${companyId} after ${strikes} strikes. Resets at ${resetAt.toISOString()}.`,
      );
    } catch (e) {
      this.logger.error(`Failed to record quota strike: ${e.message}`);
    }
  }

  /** Clear the strike counter and any DB lockout after a successful AI call. */
  private clearQuotaStrikes(companyId: string): void {
    if (!this.quotaStrikes.has(companyId)) return;
    this.quotaStrikes.delete(companyId);
    this.prisma.company
      .updateMany({
        where: { id: companyId, aiQuotaExhausted: true },
        data: { aiQuotaExhausted: false, aiQuotaResetAt: null },
      })
      .catch((e) => this.logger.warn(`Failed to clear quota flag: ${e.message}`));
  }

  /**
   * Removed: there is no platform-wide AI key any more.
   *
   * A shared super-admin key meant one company's traffic exhausted a quota that every
   * other company then found missing, and a tenant could be served by a credential
   * nobody in that tenant had configured or could see the usage of. AI is now either
   * set up for a company or it is off, which is the only state anybody can reason
   * about.
   *
   * Kept as a stub returning null so nothing that still calls it breaks while the last
   * references are removed.
   */
  async getPlatformAiCredential(): Promise<null> {
    return null;
  }

  /**
   * Resolve which AI credential to use for a request.
   *
   * Order:
   *   1. The company's own key, when a super admin assigned one and AI is enabled.
   *   2. The platform-wide key from Settings → AI Platform (shared by every company).
   *   3. None: AI is unavailable.
   *
   * Users without a company (super admins) can still use the platform key.
   */
  async resolveAiCredential(userId?: string): Promise<{
    apiKey: string;
    companyName: string;
    provider: string;
    companyId: string;
    model?: string | null;
  } | null> {
    if (!userId) {
      this.logger.error('❌ No userId provided - AI disabled');
      throw new Error('User ID is required for AI features');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { companyId: true, role: true, name: true },
    });

    // No company means no AI. Super admins configure it for tenants; they do not
    // borrow a shared credential of their own.
    if (!user?.companyId) {
      this.logger.warn('AI requested by a user with no company. There is no platform key to fall back to.');
      return null;
    }

    const company = await this.prisma.company.findUnique({
      where: { id: user.companyId },
      select: {
        name: true,
        aiApiKey: true,
        aiEnabled: true,
        aiProvider: true,
        aiQuotaExhausted: true,
        aiQuotaResetAt: true,
        subscriptionPlan: true,
      },
    });

    if (!company) return null;

    // Auto-reset once the lockout window has passed.
    //
    // A null aiQuotaResetAt on an exhausted company is a legacy row: the old logic
    // flagged FREE_TRIAL companies with no reset time, which no expiry check could
    // ever clear. Every lockout we write now carries an expiry, so treat a missing
    // one as stale and release it. Production applies schema with `prisma db push`,
    // which does not run migration SQL, so this is what actually heals those rows
    // there rather than the UPDATE in the migration.
    const lockoutExpired =
      company.aiQuotaExhausted && (!company.aiQuotaResetAt || new Date() > company.aiQuotaResetAt);

    if (lockoutExpired) {
      await this.prisma.company.update({
        where: { id: user.companyId },
        data: { aiQuotaExhausted: false, aiQuotaResetAt: null },
      });
      this.quotaStrikes.delete(user.companyId);
      company.aiQuotaExhausted = false;
    }

    const companyKey =
      company.aiEnabled && company.aiApiKey ? this.companiesService.decryptApiKey(company.aiApiKey) : null;
    const hasUsableCompanyKey = !!companyKey && !companyKey.includes('[DECRYPTION_FAILED]');

    if (company.aiApiKey && company.aiEnabled && !hasUsableCompanyKey) {
      this.logger.error(`❌ Failed to decrypt AI key for company: ${company.name}`);
    }

    // The company's own key, blocked only by its own cooldown.
    if (hasUsableCompanyKey && !company.aiQuotaExhausted) {
      return {
        apiKey: companyKey,
        companyName: company.name,
        provider: company.aiProvider || 'gemini',
        companyId: user.companyId,
      };
    }

    if (company.aiQuotaExhausted) {
      const resetMsg = company.aiQuotaResetAt
        ? ` AI will be available again at ${company.aiQuotaResetAt.toISOString()}.`
        : '';
      throw new Error(`AI quota exceeded for your company.${resetMsg}`);
    }

    return null;
  }

  private async getCompanyAiApiKey(userId?: string): Promise<string | null> {
    const info = await this.resolveAiCredential(userId);
    return info?.apiKey || null;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // AI OPERATIONS (with usage tracking and quota enforcement)
  // ─────────────────────────────────────────────────────────────────────────

  async generateContentFromAI(title: string, type: string, userId?: string): Promise<{
    description: string;
    goals: string;
    priority?: number;
    ai_provider?: string;
  }> {
    try {
      if (!userId) throw new Error('User ID is required for AI content generation');

      const companyInfo = await this.resolveAiCredential(userId);
      if (!companyInfo) throw new Error('AI is not enabled for your company. Please ask your administrator to add an AI API key.');

      const knowledgeSources = await this.getActiveKnowledgeSources(userId);

      const response = await firstValueFrom(
        this.httpService.post(`${this.aiServiceUrl}/generate-content`, {
          title,
          type,
          knowledge_sources: knowledgeSources,
          api_key: companyInfo.apiKey,
          company_name: companyInfo.companyName,
          provider: companyInfo.provider,
          model: companyInfo.model ?? undefined,
        }, {
          headers: this.aiServiceHeaders,
          timeout: 60000,
        }),
      );

      // Track usage after success (non-blocking)
      this.clearQuotaStrikes(companyInfo.companyId);
      if (companyInfo.companyId !== 'platform') {
        this.trackUsage(userId, companyInfo.companyId, AIFeature.TASK_GENERATION);
      }

      return {
        description: response.data.description,
        goals: response.data.goals,
        priority: response.data.priority,
        ai_provider: response.data.ai_provider || 'gemini',
      };
    } catch (error) {
      this.logger.error('❌ Error generating content from AI:', error.message);

      const detail = error.response?.data?.detail;
      const detailMessage = typeof detail === 'string' ? detail : detail?.message ?? JSON.stringify(detail ?? {});
      const httpStatus = error.response?.status || 500;

      const isQuota =
        httpStatus === 429 ||
        detailMessage?.includes('429') ||
        error.message?.includes('quota') ||
        detailMessage?.toLowerCase().includes('quota') ||
        detailMessage?.toLowerCase().includes('rate limit') ||
        detailMessage?.toLowerCase().includes('resource_exhausted');

      // Mark quota exhausted in DB so UI can gray out buttons
      if (isQuota) {
        const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { companyId: true } });
        if (user?.companyId) await this.recordQuotaStrike(user.companyId, retryAfterSeconds(error));
        throw new HttpException('AI quota exceeded. The API key has reached its usage limit. Please contact your administrator.', 429);
      }

      const isInvalidKey =
        detailMessage?.toLowerCase().includes('api key not valid') ||
        detailMessage?.toLowerCase().includes('api_key_invalid') ||
        detailMessage?.toLowerCase().includes('api key expired');

      if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
        throw new HttpException('AI service timed out. Please try again in a moment.', 504);
      } else if (isInvalidKey) {
        throw new HttpException('The AI API key is invalid or has been revoked. Please contact your administrator.', 503);
      } else if (error.message?.includes('quota')) {
        throw new HttpException(error.message, 429);
      } else {
        throw new HttpException(detailMessage || error.message || 'AI service error', httpStatus);
      }
    }
  }

  async generateSubtasks(
    data: {
      title: string;
      description: string;
      taskType: string;
      workflowPhases: string[];
      availableUsers?: { id: string; name: string; position: string; role: string }[];
    },
    userId?: string,
  ): Promise<{ subtasks: any[]; ai_provider: string }> {
    try {
      const companyInfo = await this.resolveAiCredential(userId);
      if (!companyInfo) throw new Error('AI is not enabled for your company.');

      const knowledgeSources = await this.getActiveKnowledgeSources(userId);

      const response = await firstValueFrom(
        this.httpService.post(`${this.aiServiceUrl}/generate-subtasks`, {
          ...data,
          knowledgeSources,
          api_key: companyInfo.apiKey,
          company_name: companyInfo.companyName,
          provider: companyInfo.provider,
          model: companyInfo.model ?? undefined,
        }, {
          headers: this.aiServiceHeaders,
          timeout: 45000,
        }),
      );

      this.clearQuotaStrikes(companyInfo.companyId);
      if (companyInfo.companyId !== 'platform') {
        this.trackUsage(userId, companyInfo.companyId, AIFeature.SUBTASK_GENERATION);
      }

      return response.data;
    } catch (error) {
      this.logger.error('Error generating subtasks:', error.message);
      const httpStatus = error.response?.status || 500;
      if (httpStatus === 429 || error.message?.includes('quota')) {
        const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { companyId: true } });
        if (user?.companyId) await this.recordQuotaStrike(user.companyId, retryAfterSeconds(error));
        throw new HttpException('AI quota exceeded.', 429);
      }
      return {
        subtasks: [
          { title: 'Planning', description: 'Plan execution', phaseName: 'Planning', suggestedRole: 'Project Manager', estimatedHours: 2 },
          { title: 'Execution', description: 'Complete deliverables', phaseName: 'In Progress', suggestedRole: 'Team Member', estimatedHours: 5 },
        ],
        ai_provider: 'fallback',
      };
    }
  }

  async summarizeText(text: string, maxLength: number = 150, userId?: string): Promise<string> {
    try {
      const info = await this.resolveAiCredential(userId);
      if (!info) return text.length > maxLength ? text.substring(0, maxLength - 3) + '...' : text;

      const response = await firstValueFrom(
        this.httpService.post(`${this.aiServiceUrl}/summarize`, {
          text,
          max_length: maxLength,
          api_key: info.apiKey,
          provider: info.provider,
          model: info.model ?? undefined,
        }, {
          headers: this.aiServiceHeaders,
          timeout: 45000,
        }),
      );

      this.clearQuotaStrikes(info.companyId);
      if (info.companyId !== 'platform') {
        this.trackUsage(userId, info.companyId, AIFeature.MEETING_SUMMARY);
      }

      return response.data.summary;
    } catch (error) {
      this.logger.error('Error summarizing text:', error.message);
      if (error.response?.status === 429 || error.message?.includes('quota')) {
        const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { companyId: true } });
        if (user?.companyId) await this.recordQuotaStrike(user.companyId, retryAfterSeconds(error));
      }
      return text.length > maxLength ? text.substring(0, maxLength - 3) + '...' : text;
    }
  }

  async analyzePriority(taskTitle: string, taskDescription: string, userId?: string): Promise<{
    suggestedPriority: number;
    reasoning: string;
  }> {
    try {
      const info = await this.resolveAiCredential(userId);
      if (!info) return { suggestedPriority: 3, reasoning: 'AI not available.' };

      const response = await firstValueFrom(
        this.httpService.post(`${this.aiServiceUrl}/analyze-priority`, {
          title: taskTitle,
          description: taskDescription,
          api_key: info.apiKey,
          provider: info.provider,
          model: info.model ?? undefined,
        }, {
          headers: this.aiServiceHeaders,
          timeout: 45000,
        }),
      );

      return { suggestedPriority: response.data.priority, reasoning: response.data.reasoning };
    } catch (error) {
      this.logger.error('Error analyzing priority:', error.message);
      return { suggestedPriority: 3, reasoning: 'Unable to analyze priority.' };
    }
  }

  async checkTaskCompleteness(taskDescription: string, goals: string, currentPhase: string, userId?: string): Promise<{
    completenessScore: number;
    suggestions: string[];
    isComplete: boolean;
  }> {
    try {
      const info = await this.resolveAiCredential(userId);
      if (!info) return { completenessScore: 0.5, suggestions: ['AI is not enabled for your company.'], isComplete: false };
      const response = await firstValueFrom(
        this.httpService.post(`${this.aiServiceUrl}/check-completeness`, {
          description: taskDescription,
          goals,
          phase: currentPhase,
          api_key: info?.apiKey,
          provider: info?.provider,
          model: info?.model ?? undefined,
        }, {
          headers: this.aiServiceHeaders,
        }),
      );
      return {
        completenessScore: response.data.completeness_score,
        suggestions: response.data.suggestions,
        isComplete: response.data.is_complete,
      };
    } catch (error) {
      return { completenessScore: 0.5, suggestions: ['Unable to analyze task completeness.'], isComplete: false };
    }
  }

  async generatePerformanceInsights(analyticsData: PerformanceInsightsDto, userId?: string): Promise<{
    insights: string[];
    recommendations: string[];
    trends: string[];
  }> {
    try {
      const info = await this.resolveAiCredential(userId);
      if (!info) return { insights: ['AI is not enabled for your company.'], recommendations: ['Ask your administrator to add an AI API key.'], trends: [] };
      const response = await firstValueFrom(
        this.httpService.post(`${this.aiServiceUrl}/performance-insights`, {
          analytics: analyticsData,
          api_key: info?.apiKey,
          provider: info?.provider,
          model: info?.model ?? undefined,
        }, {
          headers: this.aiServiceHeaders,
          timeout: 45000,
        }),
      );
      return { insights: response.data.insights, recommendations: response.data.recommendations, trends: response.data.trends };
    } catch (error) {
      return { insights: ['Analysis unavailable.'], recommendations: ['Monitor performance.'], trends: ['In progress.'] };
    }
  }

  async detectTaskType(title: string, userId?: string): Promise<{ task_type: string; ai_provider: string }> {
    try {
      const info = await this.resolveAiCredential(userId);
      if (!info) return { task_type: 'GENERAL', ai_provider: 'fallback' };
      const response = await firstValueFrom(
        this.httpService.post(`${this.aiServiceUrl}/detect-task-type`, {
          title,
          api_key: info?.apiKey,
          provider: info?.provider,
          model: info?.model ?? undefined,
        }, {
          headers: this.aiServiceHeaders,
          timeout: 45000,
        }),
      );
      return response.data;
    } catch (error) {
      return { task_type: 'GENERAL', ai_provider: 'fallback' };
    }
  }

  async extractTextFromFile(filePath: string, mimeType: string, userId?: string): Promise<string> {
    try {
      const info = await this.resolveAiCredential(userId);
      if (!info) return 'Unable to extract text from file.';
      const response = await firstValueFrom(
        this.httpService.post(`${this.aiServiceUrl}/extract-text`, {
          file_path: filePath,
          mime_type: mimeType,
          api_key: info?.apiKey,
          provider: info?.provider,
          model: info?.model ?? undefined,
        }, { headers: this.aiServiceHeaders }),
      );
      return response.data.extracted_text;
    } catch (error) {
      return 'Unable to extract text from file.';
    }
  }

  async generateContent(title: string, userId?: string): Promise<{
    description: string;
    goals: string;
    priority: number;
    ai_provider: string;
  }> {
    try {
      const info = await this.resolveAiCredential(userId);
      if (!info) {
        return {
          description: `Create a comprehensive plan for: ${title}.`,
          goals: `1. Successfully complete ${title}\n2. Ensure quality\n3. Document outcomes`,
          priority: 3,
          ai_provider: 'fallback',
        };
      }
      const response = await firstValueFrom(
        this.httpService.post(`${this.aiServiceUrl}/generate-content`, {
          title,
          type: 'task',
          api_key: info.apiKey,
          provider: info.provider,
          model: info.model ?? undefined,
        }, {
          headers: this.aiServiceHeaders,
          timeout: 45000,
        }),
      );
      return {
        description: response.data.description,
        goals: response.data.goals,
        priority: response.data.priority || 3,
        ai_provider: response.data.ai_provider || 'gemini',
      };
    } catch (error) {
      return {
        description: `Create a comprehensive plan for: ${title}.`,
        goals: `1. Successfully complete ${title}\n2. Ensure quality\n3. Document outcomes`,
        priority: 3,
        ai_provider: 'fallback',
      };
    }
  }

  async isAiServiceHealthy(): Promise<{
    isHealthy: boolean;
    provider: string;
    status: string;
    error?: string;
  }> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.aiServiceUrl}/health`, { timeout: 40000 }),
      );
      const data = response.data;
      return {
        isHealthy: data.status === 'healthy',
        provider: data.ai_provider,
        status: data.status,
        error: data[`${data.ai_provider}_error`],
      };
    } catch (error) {
      return { isHealthy: false, provider: 'unknown', status: 'error', error: error.message };
    }
  }

  async chat(
    message: string,
    user: any,
    conversationHistory: any[],
    knowledgeSources: any[],
    additionalContext: any,
    userId: string,
    files?: any[],
  ): Promise<any> {
    try {
      const info = await this.resolveAiCredential(userId);
      if (!info) {
        throw new HttpException('AI is not enabled for your company. Please ask your administrator to add an AI API key.', 403);
      }
      const response = await firstValueFrom(
        this.httpService.post(`${this.aiServiceUrl}/chat`, {
          message,
          user: { ...user, position: user.position, department: user.department },
          conversationHistory,
          knowledgeSources,
          additionalContext,
          api_key: info.apiKey,
          provider: info.provider,
          model: info.model ?? undefined,
          companyName: info.companyName,
          files,
        }, {
          headers: this.aiServiceHeaders,
          timeout: 45000,
        }),
      );

      if (info?.companyId) this.clearQuotaStrikes(info.companyId);
      if (info?.companyId && info.companyId !== 'platform') {
        this.trackUsage(userId, info.companyId, AIFeature.CHAT);
      }

      return response.data;
    } catch (error) {
      this.logger.error('Error in AI chat:', error);
      throw error;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // KNOWLEDGE SOURCES
  // ─────────────────────────────────────────────────────────────────────────

  private async getActiveKnowledgeSources(userId?: string) {
    try {
      const where: any = { isActive: true };
      if (userId) {
        const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { companyId: true } });
        if (user?.companyId) where.companyId = user.companyId;
      }

      const sources = await this.prisma.knowledgeSource.findMany({
        where,
        orderBy: [{ priority: 'desc' }],
        select: { id: true, name: true, type: true, content: true, priority: true },
      });

      return sources.map(s => ({ id: s.id, name: s.name, type: s.type, content: s.content, isActive: true, priority: s.priority }));
    } catch (error) {
      return [];
    }
  }
}
