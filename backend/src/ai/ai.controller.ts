import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AiService } from './ai.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SummarizeTextDto } from './dto/summarize-text.dto';
import { AnalyzePriorityDto } from './dto/analyze-priority.dto';
import { CheckCompletenessDto } from './dto/check-completeness.dto';
import { PerformanceInsightsDto } from './dto/performance-insights.dto';

@ApiTags('AI Services')
@Controller('ai')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AiController {
  private readonly logger = new Logger(AiController.name);
  
  constructor(private readonly aiService: AiService) {}

  @Get('health')
  @ApiOperation({ summary: 'Check AI service health' })
  @ApiResponse({ status: 200, description: 'AI service health status' })
  async checkHealth() {
    const healthStatus = await this.aiService.isAiServiceHealthy();
    return {
      status: healthStatus.status,
      isHealthy: healthStatus.isHealthy,
      provider: healthStatus.provider,
      error: healthStatus.error,
      timestamp: new Date().toISOString(),
    };
  }

  @Post('summarize')
  @ApiOperation({ summary: 'Summarize text using AI' })
  @ApiResponse({ status: 200, description: 'Text summarized successfully' })
  async summarizeText(@Body() summarizeTextDto: SummarizeTextDto) {
    const summary = await this.aiService.summarizeText(
      summarizeTextDto.text,
      summarizeTextDto.maxLength,
    );
    
    return {
      originalText: summarizeTextDto.text,
      summary,
      originalLength: summarizeTextDto.text.length,
      summaryLength: summary.length,
    };
  }

  @Post('analyze-priority')
  @ApiOperation({ summary: 'Analyze task priority using AI' })
  @ApiResponse({ status: 200, description: 'Priority analyzed successfully' })
  async analyzePriority(@Body() analyzePriorityDto: AnalyzePriorityDto) {
    const analysis = await this.aiService.analyzePriority(
      analyzePriorityDto.title,
      analyzePriorityDto.description,
    );
    
    return analysis;
  }

  @Post('check-completeness')
  @ApiOperation({ summary: 'Check task completeness using AI' })
  @ApiResponse({ status: 200, description: 'Completeness checked successfully' })
  async checkCompleteness(@Body() checkCompletenessDto: CheckCompletenessDto) {
    const analysis = await this.aiService.checkTaskCompleteness(
      checkCompletenessDto.description,
      checkCompletenessDto.goals,
      checkCompletenessDto.phase,
    );
    
    return analysis;
  }

  @Post('performance-insights')
  @ApiOperation({ summary: 'Generate performance insights using AI' })
  @ApiResponse({ status: 200, description: 'Insights generated successfully' })
  async generateInsights(@Body() analyticsData: PerformanceInsightsDto) {
    const insights = await this.aiService.generatePerformanceInsights(analyticsData);
    return insights;
  }

  @Post('generate-content')
  @ApiOperation({ summary: 'Generate content suggestions using AI' })
  @ApiResponse({ status: 200, description: 'Content generated successfully' })
  async generateContent(@Body() data: { title: string; type: string }) {
    try {
      const { title, type } = data;
      
      // Call the AI service once to get all content
      const response = await this.aiService.generateContentFromAI(title, type);
      
      return {
        description: response.description,
        goals: response.goals,
        priority: response.priority || 3 // Default priority if not provided
      };
    } catch (error) {
      this.logger.error('Error generating content:', error);
      throw error;
    }
  }
}
