import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  Request,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ChatService } from './chat.service';
import { SendMessageDto, CreateSessionDto } from './dto/chat.dto';

@ApiTags('Chat (AuraAssist)')
@ApiBearerAuth()
@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  /**
   * Send a message to AuraAssist
   */
  @Post('message')
  @ApiOperation({ summary: 'Send a message to AuraAssist and get its reply' })
  async sendMessage(@Request() req, @Body() dto: SendMessageDto) {
    return this.chatService.sendMessage(req.user.id, dto, req.headers.authorization);
  }

  /**
   * Get or create a chat session
   */
  @Post('session')
  @ApiOperation({ summary: 'Get the current user\'s active chat session, or create one' })
  async createSession(@Request() req, @Body() dto: CreateSessionDto) {
    return this.chatService.getOrCreateSession(req.user.id);
  }

  /**
   * Get chat history
   */
  @Get('history')
  @ApiOperation({ summary: 'Get the current user\'s recent chat sessions' })
  async getChatHistory(@Request() req, @Query('limit') limit?: string) {
    const limitNum = limit ? parseInt(limit, 10) : 10;
    return this.chatService.getChatHistory(req.user.id, limitNum);
  }

  /**
   * Get specific session
   */
  @Get('session/:sessionId')
  @ApiOperation({ summary: 'Get a specific chat session with its messages' })
  async getSession(@Request() req, @Param('sessionId') sessionId: string) {
    return this.chatService.getSession(req.user.id, sessionId);
  }

  /**
   * End a chat session
   */
  @Post('session/:sessionId/end')
  @ApiOperation({ summary: 'Mark a chat session as inactive' })
  async endSession(@Request() req, @Param('sessionId') sessionId: string) {
    return this.chatService.endSession(req.user.id, sessionId);
  }

  /**
   * Get user's chat context
   */
  /**
   * A one-line, true observation about this person's work. Counted, never generated,
   * so it costs nothing and is right even when the AI service is unreachable.
   */
  @Get('nudge')
  @ApiOperation({ summary: 'Get a short, counted (not AI-generated) observation about the user\'s current work' })
  async getNudge(@Request() req) {
    return this.chatService.getNudge(req.user.id);
  }

  /**
   * Everything waiting on this person today, and a written brief of it.
   *
   * A GET, because it changes nothing and two people asking twice should get the same
   * answer. The facts are counted from the database and are always returned; the prose
   * is written by the AI when one is configured and composed here when it is not, so
   * the brief never simply fails to appear because a provider is rate limited.
   */
  @Get('day-brief')
  @ApiOperation({ summary: 'Get today\'s counted work items for the user, with an AI-written or composed summary' })
  async getDayBrief(@Request() req) {
    return this.chatService.getDayBrief(req.user.id);
  }

  @Get('context')
  @ApiOperation({ summary: 'Get the user\'s learned chat context, creating an empty one if none exists' })
  async getUserContext(@Request() req) {
    return this.chatService.getUserContext(req.user.id);
  }

  /**
   * Manually trigger learning from task history
   */
  @Post('learn-from-tasks')
  @ApiOperation({ summary: 'Manually trigger learning chat context from the user\'s recent completed tasks' })
  async learnFromTasks(@Request() req) {
    const learnedContext = await this.chatService.learnFromTaskHistory(req.user.id);
    return {
      success: true,
      learnedContext,
      message: learnedContext 
        ? 'Successfully learned from your task history!' 
        : 'No new insights to learn at this time.',
    };
  }
}

