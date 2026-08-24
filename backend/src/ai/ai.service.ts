import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { firstValueFrom } from 'rxjs';
import { PerformanceInsightsDto } from './dto/performance-insights.dto';
import { CompaniesService } from '../companies/companies.service';
import { AIFeature } from '@prisma/client';
import { AiGatewayService } from './ai-gateway.service';

// The rate-limit constants that lived here are gone with the company-level breaker
// they served. Cooldowns are per provider entry now, held on AiProviderConfig and
// applied by AiGatewayService, so one company hitting a per-minute limit on one
// provider no longer stands between that company and its other providers.


@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly aiServiceUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => CompaniesService))
    private readonly companiesService: CompaniesService,
    private readonly gateway: AiGatewayService,
  ) {
    this.aiServiceUrl = this.configService.get<string>('AI_SERVICE_URL', 'http://localhost:8001');

    /**
     * Teach the gateway how to prove a key works.
     *
     * Registered rather than imported, because the gateway cannot depend on this
     * service: this service already depends on it, and a circular provider is a
     * runtime failure at startup rather than a compile error.
     */
    this.gateway.registerProber(async (credential) => {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.aiServiceUrl}/test-ai`,
          {
            api_key: credential.apiKey,
            provider: credential.provider,
            model: credential.model ?? undefined,
            text: 'Reply with the single word: ready',
          },
          { headers: this.aiServiceHeaders, timeout: 30000 },
        ),
      );
      return response.data;
    });
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

    /**
     * Asked of the gateway, not inferred from the legacy key.
     *
     * This read `company.aiEnabled && company.aiApiKey`, which is the single key the
     * provider chain replaced. A company that configured its providers through Settings
     * and never set a legacy key reported aiEnabled: false, and the chat composer
     * disabled itself with "AI is not enabled" for a tenant with three healthy
     * providers. The gateway is the only thing that knows what a request would actually
     * find, so it is the only thing entitled to answer.
     *
     * `configured` rather than `available` drives the flag on purpose: every provider
     * being briefly in cooldown is a passing state, and locking the composer for it
     * would take the feature away for a minute at a time with no way to tell why.
     */
    const status = await this.gateway.statusFor(user.companyId);

    return {
      aiEnabled: status.configured,
      quotaExhausted: quotaExhausted || status.reason === 'BUDGET_EXHAUSTED',
      quotaResetAt: quotaExhausted ? company.aiQuotaResetAt : null,
      provider: status.provider ?? company.aiProvider ?? 'gemini',
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

  // ─────────────────────────────────────────────────────────────────────────
  // CREDENTIALS
  // ─────────────────────────────────────────────────────────────────────────
  //
  // There is no credential resolver here any more, deliberately.
  //
  // Three things used to live in this space and all three are gone:
  //
  //   resolveAiCredential   read a single Company.aiApiKey and knew nothing about
  //                         AiProviderConfig. Chat, the day brief, ticket checks and
  //                         both learning calls used it, so the provider chain applied
  //                         to every AI feature except the ones people actually used.
  //   getPlatformAiCredential  a stub returning null, left over from the shared
  //                         platform key that was removed on purpose.
  //   recordQuotaStrike / clearQuotaStrikes
  //                         a company-level circuit breaker with no callers. Nothing
  //                         ever populated quotaStrikes, so clearQuotaStrikes returned
  //                         early every time and never cleared aiQuotaExhausted. Its
  //                         debounce and clamp helpers in quota-cooldown.ts were tested
  //                         and unreachable, which is the worst combination: a green
  //                         suite over code wired to nothing.
  //
  // Cooldowns are per provider entry now and live in AiGatewayService, which is the
  // only thing that reads or writes them. Everything reaching the AI service goes
  // through callAiService below.


  // ─────────────────────────────────────────────────────────────────────────
  // AI OPERATIONS (with usage tracking and quota enforcement)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Send one AI-service call through the provider chain.
   *
   * This is the only way to reach the AI service. Callers used to resolve a credential
   * themselves, post once, and treat any failure as the end of the matter, so a rate
   * limit on the first provider was an error the user read rather than an attempt on
   * the second. None of them needed to learn what a provider is.
   *
   * It is public because ChatService and TicketsService call it too. There was briefly
   * a second resolver serving those, which meant chat ignored the chain entirely: the
   * priority order, the cooldowns and the usage figures all applied to everything
   * except the feature people actually used. One path, no exceptions.
   *
   * The payload's api_key, provider and model are filled in per attempt, because each
   * attempt may be a different provider entirely.
   */
  async callAiService<T>(
    userId: string | undefined,
    endpoint: string,
    payload: Record<string, any>,
    opts: {
      timeout?: number;
      feature?: AIFeature;
      /** Chat posts attached files inline, which exceeds axios's default body cap. */
      unboundedBody?: boolean;
      /** Extra fields naming the company, for endpoints whose prompts use it. */
      companyNameField?: string;
      /**
       * Wall-clock ceiling for the whole chain walk. Set it when a person is waiting,
       * so a run of hanging providers cannot outlive the browser holding the request.
       */
      deadlineMs?: number;
    } = {},
  ): Promise<T> {
    if (!userId) throw new Error('User ID is required for AI features');

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { companyId: true },
    });
    if (!user?.companyId) {
      throw new Error('AI is not enabled for your company. Ask your administrator to add a provider.');
    }

    return this.gateway.execute<T>(
      user.companyId,
      async (credential) => {
        const response = await firstValueFrom(
          this.httpService.post(
            `${this.aiServiceUrl}${endpoint}`,
            {
              ...payload,
              api_key: credential.apiKey,
              company_name: credential.companyName,
              provider: credential.provider,
              model: credential.model ?? undefined,
              ...(opts.companyNameField ? { [opts.companyNameField]: credential.companyName } : {}),
            },
            {
              headers: this.aiServiceHeaders,
              timeout: opts.timeout ?? 60000,
              ...(opts.unboundedBody
                ? { maxBodyLength: Infinity, maxContentLength: Infinity }
                : {}),
            },
          ),
        );

        if (opts.feature) {
          this.trackUsage(userId, credential.companyId, opts.feature);
        }
        return response.data as T;
      },
      { label: endpoint.replace('/', ''), deadlineMs: opts.deadlineMs },
    );
  }

  async generateContentFromAI(title: string, type: string, userId: string): Promise<{
    description: string;
    goals: string;
    priority?: number;
    ai_provider?: string;
  }> {
    const knowledgeSources = await this.getActiveKnowledgeSources(userId);

    const data = await this.callAiService<any>(
      userId,
      '/generate-content',
      { title, type, knowledge_sources: knowledgeSources },
      { timeout: 60000, feature: AIFeature.TASK_GENERATION },
    );

    return {
      description: data.description,
      goals: data.goals,
      priority: data.priority,
      ai_provider: data.ai_provider || 'unknown',
    };
  }

  async generateSubtasks(
    data: {
      title: string;
      description: string;
      taskType: string;
      workflowPhases: string[];
      availableUsers?: { id: string; name: string; position: string; role: string }[];
    },
    userId: string,
  ): Promise<{ subtasks: any[]; ai_provider: string }> {
    const knowledgeSources = await this.getActiveKnowledgeSources(userId);

    try {
      return await this.callAiService<{ subtasks: any[]; ai_provider: string }>(
        userId,
        '/generate-subtasks',
        { ...data, knowledgeSources },
        { timeout: 45000, feature: AIFeature.SUBTASK_GENERATION },
      );
    } catch (error: any) {
      // Only reached once the gateway has exhausted every provider. A generic pair of
      // subtasks is a worse answer than a real one and a much better answer than a
      // failed task creation, so the task still gets made.
      this.logger.warn(`Subtask generation fell back to a stub: ${error.message}`);
      return {
        subtasks: [
          { title: 'Planning', description: 'Plan execution', phaseName: 'Planning', suggestedRole: 'Project Manager', estimatedHours: 2 },
          { title: 'Execution', description: 'Complete deliverables', phaseName: 'In Progress', suggestedRole: 'Team Member', estimatedHours: 5 },
        ],
        ai_provider: 'fallback',
      };
    }
  }

  async summarizeText(text: string, maxLength: number = 150, userId: string): Promise<string> {
    try {
      const data = await this.callAiService<{ summary: string }>(
        userId,
        '/summarize',
        { text, max_length: maxLength },
        { timeout: 45000, feature: AIFeature.MEETING_SUMMARY },
      );
      return data.summary;
    } catch (error: any) {
      // Truncation is a poor summary but an honest one, and it never fails.
      this.logger.warn(`Summarise fell back to truncation: ${error.message}`);
      return text.length > maxLength ? text.substring(0, maxLength - 3) + '...' : text;
    }
  }

  async analyzePriority(taskTitle: string, taskDescription: string, userId: string): Promise<{
    suggestedPriority: number;
    reasoning: string;
  }> {
    try {
      const data = await this.callAiService<any>(
        userId,
        '/analyze-priority',
        { title: taskTitle, description: taskDescription },
        { timeout: 45000 },
      );
      return {
        suggestedPriority: data.suggested_priority ?? data.suggestedPriority ?? 3,
        reasoning: data.reasoning ?? '',
      };
    } catch (error: any) {
      // A middling priority somebody can change beats blocking the form.
      this.logger.warn(`Priority analysis unavailable: ${error.message}`);
      return { suggestedPriority: 3, reasoning: 'AI not available.' };
    }
  }

  async checkTaskCompleteness(taskDescription: string, goals: string, currentPhase: string, userId: string): Promise<{
    completenessScore: number;
    suggestions: string[];
    isComplete: boolean;
  }> {
    try {
      const data = await this.callAiService<any>(
        userId,
        '/check-completeness',
        { description: taskDescription, goals, phase: currentPhase },
        { timeout: 45000 },
      );
      return {
        completenessScore: data.completeness_score,
        suggestions: data.suggestions,
        isComplete: data.is_complete,
      };
    } catch (error: any) {
      this.logger.warn(`Completeness check unavailable: ${error.message}`);
      return { completenessScore: 0.5, suggestions: ['Unable to analyze task completeness.'], isComplete: false };
    }
  }

  async generatePerformanceInsights(analyticsData: PerformanceInsightsDto, userId: string): Promise<{
    insights: string[];
    recommendations: string[];
    trends: string[];
  }> {
    try {
      const data = await this.callAiService<any>(
        userId,
        '/performance-insights',
        { analytics: analyticsData },
        { timeout: 45000 },
      );
      return { insights: data.insights, recommendations: data.recommendations, trends: data.trends };
    } catch (error: any) {
      this.logger.warn(`Performance insights unavailable: ${error.message}`);
      return { insights: ['Analysis unavailable.'], recommendations: ['Monitor performance.'], trends: ['In progress.'] };
    }
  }

  async detectTaskType(title: string, userId: string): Promise<{ task_type: string; ai_provider: string }> {
    try {
      return await this.callAiService<{ task_type: string; ai_provider: string }>(
        userId,
        '/detect-task-type',
        { title },
        { timeout: 45000 },
      );
    } catch (error: any) {
      // GENERAL is a defensible guess and the task still gets created. Log it, though:
      // this used to be silent, so every task on the platform was typed GENERAL for
      // months and nothing said why.
      this.logger.warn(`Task type detection unavailable, defaulting to GENERAL: ${error.message}`);
      return { task_type: 'GENERAL', ai_provider: 'fallback' };
    }
  }

  // extractTextFromFile was removed here. It posted to /extract-text, which the AI
  // service has never declared, and nothing in the repository called it, so it could
  // only ever have returned its own failure string. Text extraction from uploads lives
  // in ai-service/services/text_extractor.py and is reached another way.

  async generateContent(title: string, userId: string): Promise<{
    description: string;
    goals: string;
    priority: number;
    ai_provider: string;
  }> {
    try {
      const data = await this.callAiService<any>(
        userId,
        '/generate-content',
        { title, type: 'task' },
        { timeout: 45000, feature: AIFeature.TASK_GENERATION },
      );
      return {
        description: data.description,
        goals: data.goals,
        priority: data.priority || 3,
        ai_provider: data.ai_provider || 'gemini',
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

  // AiService.chat() was removed here. ChatService posts to /chat itself, so this
  // had no callers, and it was the last thing holding the company-level strike
  // counter alive.

  // ─────────────────────────────────────────────────────────────────────────
  // KNOWLEDGE SOURCES
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Knowledge sources for the prompt, always confined to one company.
   *
   * Returns nothing when no company can be resolved. The filter used to be applied only
   * when a userId and a companyId happened to be present, so a caller without either,
   * a SUPER_ADMIN for instance, whose companyId is null by design, pulled every
   * tenant's knowledge into the prompt. No tenant must never mean all tenants.
   */
  private async getActiveKnowledgeSources(userId: string) {
    try {
      if (!userId) return [];

      const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { companyId: true } });
      if (!user?.companyId) return [];

      const sources = await this.prisma.knowledgeSource.findMany({
        where: { isActive: true, companyId: user.companyId },
        orderBy: [{ priority: 'desc' }],
        select: { id: true, name: true, type: true, content: true, priority: true },
      });

      return sources.map(s => ({ id: s.id, name: s.name, type: s.type, content: s.content, isActive: true, priority: s.priority }));
    } catch (error) {
      return [];
    }
  }
}
