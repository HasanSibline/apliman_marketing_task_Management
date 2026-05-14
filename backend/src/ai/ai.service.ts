import { Injectable, Logger, Inject, forwardRef, HttpException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { firstValueFrom } from 'rxjs';
import { PerformanceInsightsDto } from './dto/performance-insights.dto';
import { CompaniesService } from '../companies/companies.service';
import { AIFeature } from '@prisma/client';

/** How many minutes to wait before resetting quota for paid plans */
const QUOTA_RESET_MINUTES = 60; // 1 hour for RPM limits; adjust if daily

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

    if (!user?.companyId) {
      return { aiEnabled: false, quotaExhausted: false, quotaResetAt: null, provider: 'none', myUsage: {} };
    }

    const company = await this.prisma.company.findUnique({
      where: { id: user.companyId },
      select: {
        aiEnabled: true,
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

    // Auto-reset: if reset time has passed, clear the exhaustion flag
    if (quotaExhausted && company.aiQuotaResetAt && new Date() > company.aiQuotaResetAt) {
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

    return {
      aiEnabled: company.aiEnabled,
      quotaExhausted,
      quotaResetAt: company.aiQuotaExhausted ? company.aiQuotaResetAt : null,
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
   * Mark company quota as exhausted.
   * Free-tier: permanent (no reset time).
   * Paid plans: sets reset to +QUOTA_RESET_MINUTES minutes.
   */
  private async markQuotaExhausted(companyId: string): Promise<void> {
    try {
      const company = await this.prisma.company.findUnique({
        where: { id: companyId },
        select: { subscriptionPlan: true, aiQuotaExhausted: true },
      });
      if (!company || company.aiQuotaExhausted) return; // already flagged

      const isFreeTier = company.subscriptionPlan === 'FREE_TRIAL';
      const resetAt = isFreeTier
        ? null // no reset for free tier
        : new Date(Date.now() + QUOTA_RESET_MINUTES * 60 * 1000);

      await this.prisma.company.update({
        where: { id: companyId },
        data: { aiQuotaExhausted: true, aiQuotaResetAt: resetAt },
      });

      this.logger.warn(`⚠️ AI quota marked exhausted for company ${companyId}. Reset at: ${resetAt?.toISOString() ?? 'NEVER (free tier)'}`);
    } catch (e) {
      this.logger.error(`Failed to mark quota exhausted: ${e.message}`);
    }
  }

  /**
   * Get company's AI info for a given user.
   * Company users: only their company's key — no env fallbacks.
   * Super admins: env-level key only.
   */
  private async getCompanyAiInfo(userId?: string): Promise<{ apiKey: string; companyName: string; provider: string; companyId: string } | null> {
    if (!userId) {
      this.logger.error('❌ No userId provided - AI disabled');
      throw new Error('User ID is required for AI features');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { companyId: true, role: true, name: true },
    });

    // SUPER ADMIN: use env key only, no company key borrowing
    if (!user?.companyId) {
      const superAdminApiKey = this.configService.get<string>('AI_API_KEY');
      const superAdminProvider = this.configService.get<string>('AI_PROVIDER') || 'gemini';
      if (superAdminApiKey) {
        return { apiKey: superAdminApiKey, companyName: 'Platform', provider: superAdminProvider, companyId: 'platform' };
      }
      throw new Error('AI is not available. Please configure an AI API key for the platform.');
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

    if (!company || !company.aiEnabled || !company.aiApiKey) {
      return null;
    }

    // Auto-reset if time has passed
    if (company.aiQuotaExhausted && company.aiQuotaResetAt && new Date() > company.aiQuotaResetAt) {
      await this.prisma.company.update({
        where: { id: user.companyId },
        data: { aiQuotaExhausted: false, aiQuotaResetAt: null },
      });
      company.aiQuotaExhausted = false;
    }

    // Reject immediately if quota is exhausted
    if (company.aiQuotaExhausted) {
      const resetMsg = company.aiQuotaResetAt
        ? ` AI will be available again at ${company.aiQuotaResetAt.toISOString()}.`
        : ' Your free plan quota is permanently exhausted. Please upgrade or contact your administrator.';
      throw new Error(`AI quota exceeded for your company.${resetMsg}`);
    }

    const decryptedApiKey = this.companiesService.decryptApiKey(company.aiApiKey);

    if (!decryptedApiKey || decryptedApiKey.includes('[DECRYPTION_FAILED]')) {
      this.logger.error(`❌ Failed to decrypt AI key for company: ${company.name}`);
      return null;
    }

    return {
      apiKey: decryptedApiKey,
      companyName: company.name,
      provider: company.aiProvider || 'gemini',
      companyId: user.companyId,
    };
  }

  private async getCompanyAiApiKey(userId?: string): Promise<string | null> {
    const info = await this.getCompanyAiInfo(userId);
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

      const companyInfo = await this.getCompanyAiInfo(userId);
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
        }, {
          headers: this.aiServiceHeaders,
          timeout: 60000,
        }),
      );

      // Track usage after success (non-blocking)
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
        if (user?.companyId) await this.markQuotaExhausted(user.companyId);
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
      const companyInfo = await this.getCompanyAiInfo(userId);
      if (!companyInfo) throw new Error('AI is not enabled for your company.');

      const knowledgeSources = await this.getActiveKnowledgeSources(userId);

      const response = await firstValueFrom(
        this.httpService.post(`${this.aiServiceUrl}/generate-subtasks`, {
          ...data,
          knowledgeSources,
          api_key: companyInfo.apiKey,
          company_name: companyInfo.companyName,
          provider: companyInfo.provider,
        }, {
          headers: this.aiServiceHeaders,
          timeout: 15000,
        }),
      );

      if (companyInfo.companyId !== 'platform') {
        this.trackUsage(userId, companyInfo.companyId, AIFeature.SUBTASK_GENERATION);
      }

      return response.data;
    } catch (error) {
      this.logger.error('Error generating subtasks:', error.message);
      const httpStatus = error.response?.status || 500;
      if (httpStatus === 429 || error.message?.includes('quota')) {
        const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { companyId: true } });
        if (user?.companyId) await this.markQuotaExhausted(user.companyId);
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
      const info = await this.getCompanyAiInfo(userId);
      if (!info) return text.length > maxLength ? text.substring(0, maxLength - 3) + '...' : text;

      const response = await firstValueFrom(
        this.httpService.post(`${this.aiServiceUrl}/summarize`, {
          text,
          max_length: maxLength,
          api_key: info.apiKey,
          provider: info.provider,
        }, {
          headers: this.aiServiceHeaders,
          timeout: 10000,
        }),
      );

      if (info.companyId !== 'platform') {
        this.trackUsage(userId, info.companyId, AIFeature.MEETING_SUMMARY);
      }

      return response.data.summary;
    } catch (error) {
      this.logger.error('Error summarizing text:', error.message);
      if (error.response?.status === 429 || error.message?.includes('quota')) {
        const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { companyId: true } });
        if (user?.companyId) await this.markQuotaExhausted(user.companyId);
      }
      return text.length > maxLength ? text.substring(0, maxLength - 3) + '...' : text;
    }
  }

  async analyzePriority(taskTitle: string, taskDescription: string, userId?: string): Promise<{
    suggestedPriority: number;
    reasoning: string;
  }> {
    try {
      const info = await this.getCompanyAiInfo(userId);
      if (!info) return { suggestedPriority: 3, reasoning: 'AI not available.' };

      const response = await firstValueFrom(
        this.httpService.post(`${this.aiServiceUrl}/analyze-priority`, {
          title: taskTitle,
          description: taskDescription,
          api_key: info.apiKey,
          provider: info.provider,
        }, {
          headers: this.aiServiceHeaders,
          timeout: 10000,
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
      const info = await this.getCompanyAiInfo(userId);
      const response = await firstValueFrom(
        this.httpService.post(`${this.aiServiceUrl}/check-completeness`, {
          description: taskDescription,
          goals,
          phase: currentPhase,
          api_key: info?.apiKey,
          provider: info?.provider,
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
      const info = await this.getCompanyAiInfo(userId);
      const response = await firstValueFrom(
        this.httpService.post(`${this.aiServiceUrl}/performance-insights`, {
          analytics: analyticsData,
          api_key: info?.apiKey,
          provider: info?.provider,
        }, {
          headers: this.aiServiceHeaders,
          timeout: 15000,
        }),
      );
      return { insights: response.data.insights, recommendations: response.data.recommendations, trends: response.data.trends };
    } catch (error) {
      return { insights: ['Analysis unavailable.'], recommendations: ['Monitor performance.'], trends: ['In progress.'] };
    }
  }

  async detectTaskType(title: string, userId?: string): Promise<{ task_type: string; ai_provider: string }> {
    try {
      const info = await this.getCompanyAiInfo(userId);
      const response = await firstValueFrom(
        this.httpService.post(`${this.aiServiceUrl}/detect-task-type`, {
          title,
          api_key: info?.apiKey,
          provider: info?.provider,
        }, {
          headers: this.aiServiceHeaders,
          timeout: 10000,
        }),
      );
      return response.data;
    } catch (error) {
      return { task_type: 'GENERAL', ai_provider: 'fallback' };
    }
  }

  async extractTextFromFile(filePath: string, mimeType: string, userId?: string): Promise<string> {
    try {
      const info = await this.getCompanyAiInfo(userId);
      const response = await firstValueFrom(
        this.httpService.post(`${this.aiServiceUrl}/extract-text`, {
          file_path: filePath,
          mime_type: mimeType,
          api_key: info?.apiKey,
          provider: info?.provider,
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
      const info = await this.getCompanyAiInfo(userId);
      const response = await firstValueFrom(
        this.httpService.post(`${this.aiServiceUrl}/generate-content`, {
          title,
          type: 'task',
          api_key: info?.apiKey,
          provider: info?.provider,
        }, {
          headers: this.aiServiceHeaders,
          timeout: 15000,
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
        this.httpService.get(`${this.aiServiceUrl}/health`, { timeout: 5000 }),
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
      const info = await this.getCompanyAiInfo(userId);
      const response = await firstValueFrom(
        this.httpService.post(`${this.aiServiceUrl}/chat`, {
          message,
          user: { ...user, position: user.position, department: user.department },
          conversationHistory,
          knowledgeSources,
          additionalContext,
          api_key: info?.apiKey,
          provider: info?.provider,
          companyName: info?.companyName,
          files,
        }, {
          headers: this.aiServiceHeaders,
          timeout: 45000,
        }),
      );

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
