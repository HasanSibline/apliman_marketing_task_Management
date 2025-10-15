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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ChatService } from './chat.service';
import { SendMessageDto, CreateSessionDto } from './dto/chat.dto';

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  /**
   * Send a message to ApliChat
   */
  @Post('message')
  async sendMessage(@Request() req, @Body() dto: SendMessageDto) {
    return this.chatService.sendMessage(req.user.id, dto);
  }

  /**
   * Get or create a chat session
   */
  @Post('session')
  async createSession(@Request() req, @Body() dto: CreateSessionDto) {
    return this.chatService.getOrCreateSession(req.user.id);
  }

  /**
   * Get chat history
   */
  @Get('history')
  async getChatHistory(@Request() req, @Query('limit') limit?: string) {
    const limitNum = limit ? parseInt(limit, 10) : 10;
    return this.chatService.getChatHistory(req.user.id, limitNum);
  }

  /**
   * Get specific session
   */
  @Get('session/:sessionId')
  async getSession(@Request() req, @Param('sessionId') sessionId: string) {
    return this.chatService.getSession(req.user.id, sessionId);
  }

  /**
   * End a chat session
   */
  @Post('session/:sessionId/end')
  async endSession(@Request() req, @Param('sessionId') sessionId: string) {
    return this.chatService.endSession(req.user.id, sessionId);
  }

  /**
   * Get user's chat context
   */
  @Get('context')
  async getUserContext(@Request() req) {
    return this.chatService.getUserContext(req.user.id);
  }
}

