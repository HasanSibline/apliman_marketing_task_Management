import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

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
      const response = await firstValueFrom(
        this.httpService.post(`${this.aiServiceUrl}/summarize`, {
          text,
          max_length: maxLength,
        }),
      );

      return response.data.summary;
    } catch (error) {
      this.logger.error('Error summarizing text:', error);
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
      const response = await firstValueFrom(
        this.httpService.post(`${this.aiServiceUrl}/analyze-priority`, {
          title: taskTitle,
          description: taskDescription,
        }),
      );

      return {
        suggestedPriority: response.data.priority,
        reasoning: response.data.reasoning,
      };
    } catch (error) {
      this.logger.error('Error analyzing priority:', error);
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

  async generatePerformanceInsights(analyticsData: any): Promise<{
    insights: string[];
    recommendations: string[];
    trends: string[];
  }> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.aiServiceUrl}/performance-insights`, {
          analytics: analyticsData,
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

  async isAiServiceHealthy(): Promise<boolean> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.aiServiceUrl}/health`),
      );
      return response.status === 200;
    } catch (error) {
      this.logger.warn('AI service health check failed:', error.message);
      return false;
    }
  }
}
