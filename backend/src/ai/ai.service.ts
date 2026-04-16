import { Injectable, Logger, Inject, forwardRef, HttpException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { firstValueFrom } from 'rxjs';
import { PerformanceInsightsDto } from './dto/performance-insights.dto';
import { CompaniesService } from '../companies/companies.service';

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

  /**
   * Get company's AI API key and name by user ID
   * Returns null if company has no AI key (AI will be disabled)
   * Support for SUPER_ADMIN users via environment variable fallback
   */
  private async getCompanyAiInfo(userId?: string): Promise<{ apiKey: string; companyName: string; provider: string } | null> {
    if (!userId) {
      this.logger.error('❌ No userId provided - AI disabled');
      throw new Error('User ID is required for AI features');
    }

    try {
      this.logger.log(`🔍 Looking up user: ${userId}`);

      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { companyId: true, role: true, name: true, email: true },
      });

      this.logger.log(`👤 User found: ${user?.name} (${user?.email}), Role: ${user?.role}, CompanyId: ${user?.companyId || 'none (super admin)'}`);

      // SUPER ADMIN FALLBACK: Use environment-level API key if available
      if (!user?.companyId) {
        const superAdminApiKey = this.configService.get<string>('AI_API_KEY');
        const superAdminProvider = this.configService.get<string>('AI_PROVIDER') || 'groq';
        if (superAdminApiKey) {
          this.logger.log(`✅ Super admin using platform-level AI key (${superAdminProvider})`);
          return { apiKey: superAdminApiKey, companyName: 'Platform', provider: superAdminProvider };
        }
        // No env key either — find any enabled company and use its key as a last resort
        const anyCompany = await this.prisma.company.findFirst({
          where: { aiEnabled: true, aiApiKey: { not: null } },
          select: { name: true, aiApiKey: true, aiProvider: true },
          orderBy: { createdAt: 'desc' },
        });
        if (anyCompany) {
          const decrypted = this.companiesService.decryptApiKey(anyCompany.aiApiKey);
          if (decrypted && !decrypted.includes('[DECRYPTION_FAILED]')) {
            this.logger.log(`✅ Super admin borrowing AI key from company: ${anyCompany.name}`);
            return { apiKey: decrypted, companyName: anyCompany.name, provider: anyCompany.aiProvider || 'groq' };
          }
        }
        this.logger.error(`❌ Super admin has no AI key available (no env key, no company keys)`);
        throw new Error('AI is not available. Please configure an AI API key in the admin panel.');
      }

      const company = await this.prisma.company.findUnique({
        where: { id: user.companyId },
        select: {
          name: true,
          aiApiKey: true,
          aiEnabled: true,
          aiProvider: true
        },
      });

      if (!company) {
        this.logger.warn('Company not found - AI disabled');
        return null;
      }

      if (!company.aiEnabled || !company.aiApiKey) {
        this.logger.warn(`AI disabled for company: ${company.name}`);
        return null;
      }

      this.logger.log(`Using AI (${company.aiProvider || 'gemini'}) for company: ${company.name}`);

      const decryptedApiKey = this.companiesService.decryptApiKey(company.aiApiKey);
      
      if (!decryptedApiKey || decryptedApiKey.includes('[DECRYPTION_FAILED]')) {
        this.logger.error(`❌ Failed to decrypt AI key for company: ${company.name}. Check ENCRYPTION_KEY env var on Render matches the key used when the API key was saved.`);
        return null;
      }

      return {
        apiKey: decryptedApiKey,
        companyName: company.name,
        provider: company.aiProvider || 'gemini'
      };
    } catch (error) {
      if (error instanceof Error && (
        error.message.includes('User ID is required') ||
        error.message.includes('AI is not available')
      )) {
        throw error;
      }
      this.logger.error('Error fetching company AI info:', error);
      return null;
    }
  }

  /**
   * Legacy method for backwards compatibility
   */
  private async getCompanyAiApiKey(userId?: string): Promise<string | null> {
    const info = await this.getCompanyAiInfo(userId);
    return info?.apiKey || null;
  }

  async summarizeText(text: string, maxLength: number = 150, userId?: string): Promise<string> {
    try {
      this.logger.log(`Summarizing text: ${text.length} characters`);

      const info = await this.getCompanyAiInfo(userId);

      if (!info) {
        // AI not available for this company
        this.logger.warn('AI info not available - returning truncated text');
        return text.length > maxLength
          ? text.substring(0, maxLength - 3) + '...'
          : text;
      }

      const response = await firstValueFrom(
        this.httpService.post(`${this.aiServiceUrl}/summarize`, {
          text,
          max_length: maxLength,
          api_key: info.apiKey,
          provider: info.provider,
        }, {
          headers: this.aiServiceHeaders,
          timeout: 10000, // 10 second timeout
        }),
      );

      this.logger.log(`Summarization successful: ${response.data.summary.length} characters`);
      return response.data.summary;
    } catch (error) {
      this.logger.error('Error summarizing text:', error.message);
      this.logger.error('AI Service URL:', this.aiServiceUrl);
      // Fallback: return truncated text
      return text.length > maxLength
        ? text.substring(0, maxLength - 3) + '...'
        : text;
    }
  }

  async analyzePriority(taskTitle: string, taskDescription: string, userId?: string): Promise<{
    suggestedPriority: number;
    reasoning: string;
  }> {
    try {
      this.logger.log(`Analyzing priority for: ${taskTitle}`);

      const info = await this.getCompanyAiInfo(userId);

      if (!info) {
        // AI not available - return default
        this.logger.warn('AI info not available - returning default priority');
        return {
          suggestedPriority: 3,
          reasoning: 'AI not available. Please add an AI API key to enable AI features.',
        };
      }

      const response = await firstValueFrom(
        this.httpService.post(`${this.aiServiceUrl}/analyze-priority`, {
          title: taskTitle,
          description: taskDescription,
          api_key: info.apiKey,
          provider: info.provider,
        }, {
          headers: this.aiServiceHeaders,
          timeout: 10000, // 10 second timeout
        }),
      );

      this.logger.log(`Priority analysis successful: ${response.data.priority}`);
      return {
        suggestedPriority: response.data.priority,
        reasoning: response.data.reasoning,
      };
    } catch (error) {
      this.logger.error('Error analyzing priority:', error.message);
      // Fallback: return default priority
      return {
        suggestedPriority: 3,
        reasoning: 'Unable to analyze priority. Default priority assigned.',
      };
    }
  }

  async checkTaskCompleteness(
    taskDescription: string,
    goals: string,
    currentPhase: string,
    userId?: string,
  ): Promise<{
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
      this.logger.error('Error checking task completeness:', error);
      // Fallback: return basic analysis
      return {
        completenessScore: 0.5,
        suggestions: ['Unable to analyze task completeness at this time.'],
        isComplete: false,
      };
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
          timeout: 15000, // 15 second timeout for complex analysis
        }),
      );

      return {
        insights: response.data.insights,
        recommendations: response.data.recommendations,
        trends: response.data.trends,
      };
    } catch (error) {
      this.logger.error('Error generating performance insights:', error);
      // Fallback: return basic insights
      return {
        insights: ['Performance analysis temporarily unavailable.'],
        recommendations: ['Continue monitoring task completion rates.'],
        trends: ['Data collection in progress.'],
      };
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
        }, {
          headers: this.aiServiceHeaders,
        }),
      );

      return response.data.extracted_text;
    } catch (error) {
      this.logger.error('Error extracting text from file:', error);
      return 'Unable to extract text from file.';
    }
  }

  async generateTaskDescription(title: string, userId?: string): Promise<string> {
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
          timeout: 10000, // 10 second timeout
        }),
      );

      return response.data.description.trim();
    } catch (error) {
      this.logger.error('Error generating task description:', error);
      // Generate a basic description based on the title
      const words = title.split(' ');
      const action = words[0].toLowerCase();
      const subject = words.slice(1).join(' ');
      return `This task involves ${action} ${subject}. The team member assigned to this task will need to ensure all necessary steps are taken to complete this action effectively and according to our standard procedures.`;
    }
  }

  async generateTaskGoals(title: string, userId?: string): Promise<string> {
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
          timeout: 10000, // 10 second timeout
        }),
      );

      return response.data.goals.trim();
    } catch (error) {
      this.logger.error('Error generating task goals:', error);
      // Generate basic goals based on the title
      const subject = title.toLowerCase();
      return `Goals:\n` +
        `1. Successfully complete the ${subject}\n` +
        `2. Ensure all deliverables meet quality standards\n` +
        `3. Document the process and outcomes\n\n` +
        `Success Criteria:\n` +
        `- All required components are completed\n` +
        `- Work is reviewed and approved by relevant stakeholders\n` +
        `- Documentation is clear and comprehensive`;
    }
  }

  async generateContentFromAI(title: string, type: string, userId?: string): Promise<{
    description: string;
    goals: string;
    priority?: number;
    ai_provider?: string;
  }> {
    try {
      this.logger.log(`🎯 generateContentFromAI called - Title: "${title}", Type: "${type}", UserId: ${userId}`);
      this.logger.log(`📍 AI Service URL: ${this.aiServiceUrl}/generate-content`);

      if (!userId) {
        this.logger.error('❌ No userId provided to generateContentFromAI');
        throw new Error('User ID is required for AI content generation');
      }

      this.logger.log(`🔍 Fetching company AI info for user: ${userId}`);
      const companyInfo = await this.getCompanyAiInfo(userId);

      if (!companyInfo) {
        // AI not available for this company
        this.logger.error(`❌ No company AI info found for user: ${userId}`);
        throw new Error('AI is not enabled for your company. Please ask your administrator to add an AI API key.');
      }

      this.logger.log(`✅ Company AI info retrieved: ${companyInfo.companyName}, Has API Key: ${!!companyInfo.apiKey}`);

      // Fetch active knowledge sources (company-specific)
      this.logger.log(`🔍 Fetching knowledge sources for user: ${userId}`);
      const knowledgeSources = await this.getActiveKnowledgeSources(userId);
      this.logger.log(`📚 Found ${knowledgeSources.length} knowledge sources for content generation`);

      this.logger.log(`🚀 Calling AI service POST ${this.aiServiceUrl}/generate-content`);
      this.logger.log(`📦 Request payload: ${JSON.stringify({
        title,
        type,
        knowledge_sources_count: knowledgeSources.length,
        has_api_key: !!companyInfo.apiKey,
        company_name: companyInfo.companyName
      })}`);

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
          timeout: 60000, // 60 seconds — AI service may need time for Gemini + knowledge sources
        }),
      );

      this.logger.log(`✅ AI service response received successfully`);
      this.logger.log(`📊 Response data: ${JSON.stringify({
        ai_provider: response.data.ai_provider,
        has_description: !!response.data.description,
        has_goals: !!response.data.goals,
        priority: response.data.priority
      })}`);

      return {
        description: response.data.description,
        goals: response.data.goals,
        priority: response.data.priority,
        ai_provider: response.data.ai_provider || 'gemini'
      };
    } catch (error) {
      this.logger.error('❌ Error generating content from AI:');
      this.logger.error(`   Error type: ${error.constructor.name}`);
      this.logger.error(`   Error message: ${error.message}`);

      // Provide a clear, user-friendly error
      let errorMessage = 'AI content generation failed';

      if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
        errorMessage = 'AI service timed out. The AI service may be starting up — please try again in 1-2 minutes.';
      } else if (error.code === 'ECONNREFUSED') {
        errorMessage = 'AI service is not reachable. Please check that the AI service is running.';
      } else if (error.response?.data?.detail) {
        if (typeof error.response.data.detail === 'string') {
          errorMessage = error.response.data.detail;
        } else if (error.response.data.detail.message) {
          errorMessage = error.response.data.detail.message;
        } else {
          errorMessage = JSON.stringify(error.response.data.detail);
        }
      } else {
        errorMessage = error.message || 'AI service error';
      }

      this.logger.error(`   Returning error to client: ${errorMessage}`);
      throw new HttpException(errorMessage, error.response?.status || 500);
    }
  }

  /**
   * Get active knowledge sources filtered by user's company
   * COMPANY-SPECIFIC: Only returns knowledge sources from the user's company
   */
  private async getActiveKnowledgeSources(userId?: string) {
    try {
      // Build where clause with company filter
      const where: any = { isActive: true };

      if (userId) {
        const user = await this.prisma.user.findUnique({
          where: { id: userId },
          select: { companyId: true },
        });

        if (user?.companyId) {
          where.companyId = user.companyId; // CRITICAL: Filter by company
        }
      }

      const sources = await this.prisma.knowledgeSource.findMany({
        where,
        orderBy: [
          { priority: 'desc' },
        ],
        select: {
          id: true,
          name: true,
          type: true,
          content: true,
          priority: true,
        },
      });

      return sources.map(source => ({
        id: source.id,
        name: source.name,
        type: source.type,
        content: source.content,
        isActive: true,
        priority: source.priority,
      }));
    } catch (error) {
      this.logger.error('Error fetching knowledge sources:', error);
      return []; // Return empty array on error
    }
  }

  async detectTaskType(title: string, userId?: string): Promise<{ task_type: string; ai_provider: string }> {
    try {
      this.logger.log(`Detecting task type for: ${title}`);

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

      this.logger.log(`Task type detected: ${response.data.task_type}`);
      return response.data;
    } catch (error) {
      this.logger.error('Error detecting task type:', error.message);
      return {
        task_type: 'GENERAL',
        ai_provider: 'fallback',
      };
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
    userId?: string
  ): Promise<{ subtasks: any[]; ai_provider: string }> {
    try {
      this.logger.log(`Generating subtasks for: ${data.title}`);

      // Get company AI info (API key and company name)
      const companyInfo = await this.getCompanyAiInfo(userId);

      if (!companyInfo) {
        // AI not available for this company
        this.logger.warn('AI not available - using fallback subtasks');
        throw new Error('AI is not enabled for your company. Please ask your administrator to add an AI API key.');
      }

      // Fetch active knowledge sources (company-specific)
      const knowledgeSources = await this.getActiveKnowledgeSources(userId);
      this.logger.log(`Using ${knowledgeSources.length} knowledge sources for subtask generation`);

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

      this.logger.log(`Generated ${response.data.subtasks.length} subtasks`);
      return response.data;
    } catch (error) {
      this.logger.error('Error generating subtasks:', error.message);
      return {
        subtasks: [
          {
            title: 'Planning',
            description: 'Plan execution',
            phaseName: 'Planning',
            suggestedRole: 'Project Manager',
            estimatedHours: 2,
          },
          {
            title: 'Execution',
            description: 'Complete deliverables',
            phaseName: 'In Progress',
            suggestedRole: 'Team Member',
            estimatedHours: 5,
          },
        ],
        ai_provider: 'fallback',
      };
    }
  }

  async generateContent(title: string, userId?: string): Promise<{
    description: string;
    goals: string;
    priority: number;
    ai_provider: string;
  }> {
    try {
      this.logger.log(`Generating content for: ${title}`);

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

      this.logger.log(`Content generation successful`);
      return {
        description: response.data.description,
        goals: response.data.goals,
        priority: response.data.priority || 3,
        ai_provider: response.data.ai_provider || 'gemini',
      };
    } catch (error) {
      this.logger.error('Error generating content:', error.message);
      return {
        description: `Create a comprehensive plan for: ${title}. This task requires careful planning and execution.`,
        goals: `1. Successfully complete ${title}\n2. Ensure all deliverables meet quality standards\n3. Document the process and outcomes`,
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
        this.httpService.get(`${this.aiServiceUrl}/health`, {
          timeout: 5000, // 5 second timeout
        }),
      );

      const data = response.data;
      return {
        isHealthy: data.status === 'healthy',
        provider: data.ai_provider,
        status: data.status,
        error: data[`${data.ai_provider}_error`],
      };
    } catch (error) {
      this.logger.warn('AI service health check failed:', error.message);
      this.logger.warn('AI Service URL:', this.aiServiceUrl);
      return {
        isHealthy: false,
        provider: 'unknown',
        status: 'error',
        error: error.message,
      };
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
          user: {
            ...user,
            position: user.position,
            department: user.department,
          },
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
      return response.data;
    } catch (error) {
      this.logger.error('Error in AI chat:', error);
      throw error;
    }
  }
}
