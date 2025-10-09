import { Injectable, Logger } from '@nestjs/common';
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
  ) {
    this.aiServiceUrl = this.configService.get<string>('AI_SERVICE_URL', 'http://localhost:8001');
  }

  async summarizeText(text: string, maxLength: number = 150): Promise<string> {
    try {
      this.logger.log(`Summarizing text: ${text.length} characters`);
      
      const response = await firstValueFrom(
        this.httpService.post(`${this.aiServiceUrl}/summarize`, {
          text,
          max_length: maxLength,
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

  async analyzePriority(taskTitle: string, taskDescription: string): Promise<{
    suggestedPriority: number;
    reasoning: string;
  }> {
    try {
      this.logger.log(`Analyzing priority for: ${taskTitle}`);
      
      const response = await firstValueFrom(
        this.httpService.post(`${this.aiServiceUrl}/analyze-priority`, {
          title: taskTitle,
          description: taskDescription,
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

  async generateContentFromAI(title: string, type: string): Promise<{
    description: string;
    goals: string;
    priority?: number;
    ai_provider?: string;
  }> {
    try {
      this.logger.log(`Calling AI service at: ${this.aiServiceUrl}/generate-content`);
      this.logger.log(`Request data: ${JSON.stringify({ title, type })}`);
      
      const response = await firstValueFrom(
        this.httpService.post(`${this.aiServiceUrl}/generate-content`, {
          title,
          type
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
      throw new Error(`AI content generation failed: ${error.message}`);
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

  async generateSubtasks(data: {
    title: string;
    description: string;
    taskType: string;
    workflowPhases: string[];
    availableUsers?: { id: string; name: string; position: string; role: string }[];
  }): Promise<{ subtasks: any[]; ai_provider: string }> {
    try {
      this.logger.log(`Generating subtasks for: ${data.title}`);
      
      const response = await firstValueFrom(
        this.httpService.post(`${this.aiServiceUrl}/generate-subtasks`, data, {
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
