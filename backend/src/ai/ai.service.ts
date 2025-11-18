import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { firstValueFrom } from 'rxjs';
import { PerformanceInsightsDto } from './dto/performance-insights.dto';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly aiServiceUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.aiServiceUrl = this.configService.get<string>('AI_SERVICE_URL', 'http://localhost:8001');
  }

  /**
   * Get company's AI API key and name by user ID
   * Returns null if company has no AI key (AI will be disabled)
   */
  private async getCompanyAiInfo(userId?: string): Promise<{ apiKey: string; companyName: string } | null> {
    if (!userId) {
      // No user context - AI disabled
      this.logger.error('❌ No userId provided - AI disabled');
      throw new Error('User ID is required for AI features');
    }

    try {
      this.logger.log(`🔍 Looking up user: ${userId}`);
      
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { companyId: true, role: true, name: true, email: true },
      });

      this.logger.log(`👤 User found: ${user?.name} (${user?.email}), Role: ${user?.role}, CompanyId: ${user?.companyId}`);

      if (!user?.companyId) {
        // Super admin or no company - AI disabled
        this.logger.error(`❌ User ${user?.name} has no company - AI disabled`);
        throw new Error('AI is not available for users without a company. Please contact your administrator.');
      }

      const company = await this.prisma.company.findUnique({
        where: { id: user.companyId },
        select: { 
          name: true,
          aiApiKey: true, 
          aiEnabled: true 
        },
      });

      if (!company) {
        this.logger.warn('Company not found - AI disabled');
        return null;
      }

      if (!company.aiEnabled || !company.aiApiKey) {
        // Company AI not enabled or no key provided - AI disabled
        this.logger.warn(`AI disabled for company: ${company.name}`);
        return null;
      }

      this.logger.log(`Using AI for company: ${company.name}`);
      
      // CRITICAL: Decrypt the API key before using it
      const decryptedApiKey = Buffer.from(company.aiApiKey, 'base64').toString('utf-8');
      
      return {
        apiKey: decryptedApiKey,
        companyName: company.name
      };
    } catch (error) {
      this.logger.error('Error fetching company AI info:', error);
      return null; // AI disabled on error
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
      
      const apiKey = await this.getCompanyAiApiKey(userId);
      
      if (!apiKey) {
        // AI not available for this company
        this.logger.warn('AI key not available - returning truncated text');
        return text.length > maxLength 
          ? text.substring(0, maxLength - 3) + '...'
          : text;
      }
      
      const response = await firstValueFrom(
        this.httpService.post(`${this.aiServiceUrl}/summarize`, {
          text,
          max_length: maxLength,
          api_key: apiKey, // Pass company-specific API key
        }, {
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
      
      const apiKey = await this.getCompanyAiApiKey(userId);
      
      if (!apiKey) {
        // AI not available - return default
        this.logger.warn('AI key not available - returning default priority');
        return {
          suggestedPriority: 3,
          reasoning: 'AI not available. Please add an AI API key to enable AI features.',
        };
      }
      
      const response = await firstValueFrom(
        this.httpService.post(`${this.aiServiceUrl}/analyze-priority`, {
          title: taskTitle,
          description: taskDescription,
          api_key: apiKey, // Pass company-specific API key
        }, {
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
      const response = await firstValueFrom(
        this.httpService.post(`${this.aiServiceUrl}/check-completeness`, {
          description: taskDescription,
          goals,
          phase: currentPhase,
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

  async generatePerformanceInsights(analyticsData: PerformanceInsightsDto): Promise<{
    insights: string[];
    recommendations: string[];
    trends: string[];
  }> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.aiServiceUrl}/performance-insights`, {
          analytics: analyticsData,
        }, {
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

  async extractTextFromFile(filePath: string, mimeType: string): Promise<string> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.aiServiceUrl}/extract-text`, {
          file_path: filePath,
          mime_type: mimeType,
        }),
      );

      return response.data.extracted_text;
    } catch (error) {
      this.logger.error('Error extracting text from file:', error);
      return 'Unable to extract text from file.';
    }
  }

  async generateTaskDescription(title: string): Promise<string> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.aiServiceUrl}/generate-content`, {
          title,
          type: 'task'
        }, {
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

  async generateTaskGoals(title: string): Promise<string> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.aiServiceUrl}/generate-content`, {
          title,
          type: 'task'
        }, {
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
      
      const response = await firstValueFrom(
        this.httpService.post(`${this.aiServiceUrl}/generate-content`, {
          title,
          type,
          knowledge_sources: knowledgeSources,
          api_key: companyInfo.apiKey, // Pass company-specific API key
          company_name: companyInfo.companyName, // CRITICAL: Pass actual company name
        }, {
          timeout: 30000, // Increased timeout for better AI generation
        }),
      );
      
      this.logger.log(`AI service response received: ${JSON.stringify({ ai_provider: response.data.ai_provider })}`);
      
      return {
        description: response.data.description,
        goals: response.data.goals,
        priority: response.data.priority,
        ai_provider: response.data.ai_provider || 'gemini'
      };
    } catch (error) {
      this.logger.error('Error generating content from AI:');
      this.logger.error(`Error message: ${error.message}`);
      this.logger.error(`Error stack: ${error.stack}`);
      if (error.response) {
        this.logger.error(`Response status: ${error.response.status}`);
        this.logger.error(`Response data: ${JSON.stringify(error.response.data)}`);
      }
      
      // Don't provide fallback - let the frontend handle the error
      throw new Error(error.message || 'AI content generation failed');
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

  async detectTaskType(title: string): Promise<{ task_type: string; ai_provider: string }> {
    try {
      this.logger.log(`Detecting task type for: ${title}`);
      
      const response = await firstValueFrom(
        this.httpService.post(`${this.aiServiceUrl}/detect-task-type`, {
          title,
        }, {
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
          api_key: companyInfo.apiKey, // Pass company-specific API key
          company_name: companyInfo.companyName, // Pass actual company name
        }, {
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

  async generateContent(title: string): Promise<{
    description: string;
    goals: string;
    priority: number;
    ai_provider: string;
  }> {
    try {
      this.logger.log(`Generating content for: ${title}`);
      
      const response = await firstValueFrom(
        this.httpService.post(`${this.aiServiceUrl}/generate-content`, {
          title,
          type: 'task',
        }, {
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
}
