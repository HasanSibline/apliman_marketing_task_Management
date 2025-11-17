import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  Logger,
  Request,
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
@ApiBearerAuth()
export class AiController {
  private readonly logger = new Logger(AiController.name);
  
  constructor(private readonly aiService: AiService) {}

  @Get('health')
  @ApiOperation({ summary: 'Check AI service health' })
  @ApiResponse({ status: 200, description: 'AI service health status' })
  @UseGuards(JwtAuthGuard)
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
  @UseGuards(JwtAuthGuard)
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
  @UseGuards(JwtAuthGuard)
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
  @UseGuards(JwtAuthGuard)
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
  @UseGuards(JwtAuthGuard)
  async generateInsights(@Body() analyticsData: PerformanceInsightsDto) {
    const insights = await this.aiService.generatePerformanceInsights(analyticsData);
    return insights;
  }

  @Post('generate-content')
  @ApiOperation({ summary: 'Generate content suggestions using AI' })
  @ApiResponse({ status: 200, description: 'Content generated successfully' })
  @UseGuards(JwtAuthGuard)
  async generateContent(
    @Body() data: { title: string; type: string },
    @Request() request: any,
  ) {
    try {
      const { title, type } = data;
      const userId = request.user?.id;
      
      // Call the AI service once to get all content
      const response = await this.aiService.generateContentFromAI(title, type, userId);
      
      return {
        description: response.description,
        goals: response.goals,
        priority: response.priority || 3, // Default priority if not provided
        ai_provider: response.ai_provider || 'fallback'
      };
    } catch (error) {
      this.logger.error('Error generating content:', error);
      throw error;
    }
  }

  @Post('detect-task-type')
  @ApiOperation({ summary: 'Detect task type using AI' })
  @ApiResponse({ status: 200, description: 'Task type detected successfully' })
  @UseGuards(JwtAuthGuard)
  async detectTaskType(@Body() data: { title: string }) {
    try {
      const result = await this.aiService.detectTaskType(data.title);
      return result;
    } catch (error) {
      this.logger.error('Error detecting task type:', error);
      throw error;
    }
  }

  @Post('generate-subtasks')
  @ApiOperation({ summary: 'Generate subtasks using AI' })
  @ApiResponse({ status: 200, description: 'Subtasks generated successfully' })
  @UseGuards(JwtAuthGuard)
  async generateSubtasks(
    @Body() data: {
      title: string;
      description: string;
      taskType: string;
      workflowPhases: string[];
      availableUsers?: { id: string; name: string; position: string; role: string }[];
    },
    @Request() request: any,
  ) {
    try {
      const userId = request.user?.id;
      const result = await this.aiService.generateSubtasks(data, userId);
      return result;
    } catch (error) {
      this.logger.error('Error generating subtasks:', error);
      throw error;
    }
  }
}
