import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { SendMessageDto, CreateSessionDto, UpdateContextDto, ChatQueryDto } from './dto/chat.dto';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private readonly aiServiceUrl = process.env.AI_SERVICE_URL || 'http://localhost:8000';

  constructor(
    private prisma: PrismaService,
    private httpService: HttpService,
  ) {}

  /**
   * Get or create a chat session for a user
   */
  async getOrCreateSession(userId: string, sessionId?: string) {
    if (sessionId) {
      const session = await this.prisma.chatSession.findFirst({
        where: {
          id: sessionId,
          userId,
          isActive: true,
        },
        include: {
          messages: {
            orderBy: { createdAt: 'asc' },
            take: 50, // Last 50 messages for context
          },
        },
      });

      if (session) return session;
    }

    // Create new session
    return this.prisma.chatSession.create({
      data: {
        userId,
        title: 'New Chat',
        isActive: true,
      },
      include: {
        messages: true,
      },
    });
  }

  /**
   * Get user's chat context (learned information)
   */
  async getUserContext(userId: string) {
    let context = await this.prisma.userChatContext.findUnique({
      where: { userId },
    });

    if (!context) {
      context = await this.prisma.userChatContext.create({
        data: {
          userId,
          context: {},
        },
      });
    }

    return context;
  }

  /**
   * Update user's chat context with learned information
   */
  async updateUserContext(userId: string, newContext: any) {
    const existing = await this.getUserContext(userId);
    
    const updatedContext = {
      ...existing.context as any,
      ...newContext,
      lastUpdated: new Date().toISOString(),
    };

    return this.prisma.userChatContext.update({
      where: { userId },
      data: { context: updatedContext },
    });
  }

  /**
   * Send a message and get AI response
   */
  async sendMessage(userId: string, dto: SendMessageDto) {
    try {
      // Get or create session
      const session = await this.getOrCreateSession(userId, dto.sessionId);

      // Get user context
      const userContext = await this.getUserContext(userId);

      // Get user details
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, email: true, role: true, position: true },
      });

      // Save user message
      const userMessage = await this.prisma.chatMessage.create({
        data: {
          sessionId: session.id,
          role: 'user',
          content: dto.message,
          metadata: dto.metadata,
        },
      });

      // Process mentions and task references
      const mentions = this.extractMentions(dto.message);
      const taskRefs = this.extractTaskReferences(dto.message);
      const isDeepAnalysis = /\b(deep|details|detailed|explain|elaborate)\b/i.test(dto.message);

      // Get knowledge sources
      const knowledgeSources = await this.prisma.knowledgeSource.findMany({
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          url: true,
          type: true,
          description: true,
          content: true,
          metadata: true,
        },
      });

      // Fetch additional context based on mentions and task references
      const additionalContext = await this.fetchAdditionalContext(
        userId,
        mentions,
        taskRefs,
      );

      // Prepare conversation history
      const conversationHistory = await this.prisma.chatMessage.findMany({
        where: { sessionId: session.id },
        orderBy: { createdAt: 'asc' },
        take: 20, // Last 20 messages
        select: {
          role: true,
          content: true,
          createdAt: true,
        },
      });

      // Call AI service
      const aiResponse = await this.callAiChatService({
        message: dto.message,
        userContext: userContext.context,
        user,
        conversationHistory,
        knowledgeSources,
        additionalContext,
        isDeepAnalysis,
      });

      // Save assistant message
      const assistantMessage = await this.prisma.chatMessage.create({
        data: {
          sessionId: session.id,
          role: 'assistant',
          content: aiResponse.message,
          metadata: {
            mentions,
            taskRefs,
            contextUsed: aiResponse.contextUsed,
          },
        },
      });

      // Update user context if AI learned something new
      if (aiResponse.learnedContext) {
        await this.updateUserContext(userId, aiResponse.learnedContext);
      }

      // Update session title if it's the first real conversation
      if (conversationHistory.length <= 2 && session.title === 'New Chat') {
        const title = this.generateSessionTitle(dto.message);
        await this.prisma.chatSession.update({
          where: { id: session.id },
          data: { title },
        });
      }

      return {
        sessionId: session.id,
        message: assistantMessage,
        typing: false,
      };
    } catch (error) {
      this.logger.error('Error sending message:', error);
      throw error;
    }
  }

  /**
   * End a chat session
   */
  async endSession(userId: string, sessionId: string) {
    const session = await this.prisma.chatSession.findFirst({
      where: { id: sessionId, userId },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    return this.prisma.chatSession.update({
      where: { id: sessionId },
      data: {
        isActive: false,
        endedAt: new Date(),
      },
    });
  }

  /**
   * Get chat history for a user
   */
  async getChatHistory(userId: string, limit = 10) {
    return this.prisma.chatSession.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      take: limit,
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }

  /**
   * Get specific session
   */
  async getSession(userId: string, sessionId: string) {
    const session = await this.prisma.chatSession.findFirst({
      where: { id: sessionId, userId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    return session;
  }

  /**
   * Extract @mentions from message
   */
  private extractMentions(message: string): string[] {
    const mentionRegex = /@(\w+)/g;
    const mentions: string[] = [];
    let match;

    while ((match = mentionRegex.exec(message)) !== null) {
      mentions.push(match[1]);
    }

    return mentions;
  }

  /**
   * Extract /task references from message
   */
  private extractTaskReferences(message: string): string[] {
    const taskRegex = /\/([^\s]+)/g;
    const tasks: string[] = [];
    let match;

    while ((match = taskRegex.exec(message)) !== null) {
      tasks.push(match[1]);
    }

    return tasks;
  }

  /**
   * Fetch additional context based on mentions and task references
   */
  private async fetchAdditionalContext(
    userId: string,
    mentions: string[],
    taskRefs: string[],
  ) {
    const context: any = {};

    // Fetch mentioned users
    if (mentions.length > 0) {
      const users = await this.prisma.user.findMany({
        where: {
          name: {
            in: mentions,
            mode: 'insensitive',
          },
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          position: true,
          assignedTasks: {
            where: {
              completedAt: null,
            },
            select: {
              id: true,
              title: true,
              priority: true,
              dueDate: true,
            },
          },
        },
      });
      context.mentionedUsers = users;
    }

    // Fetch referenced tasks
    if (taskRefs.length > 0) {
      const tasks = await this.prisma.task.findMany({
        where: {
          OR: taskRefs.map(ref => ({
            title: {
              contains: ref,
              mode: 'insensitive',
            },
          })),
        },
        include: {
          assignedTo: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          assignments: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
            },
          },
          workflow: {
            select: {
              id: true,
              name: true,
            },
          },
          currentPhase: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });
      context.referencedTasks = tasks;
    }

    return context;
  }

  /**
   * Call AI chat service
   */
  private async callAiChatService(data: any) {
    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.aiServiceUrl}/chat`, data, {
          timeout: 30000,
        }),
      );

      return response.data;
    } catch (error) {
      this.logger.error('Error calling AI chat service:', error.message);
      
      // Fallback response if AI service is unavailable
      return {
        message: "I'm having trouble connecting to my AI brain right now. Please try again in a moment.",
        contextUsed: false,
        learnedContext: null,
      };
    }
  }

  /**
   * Generate a session title from the first message
   */
  private generateSessionTitle(firstMessage: string): string {
    const words = firstMessage.split(' ').slice(0, 5);
    let title = words.join(' ');
    if (title.length > 50) {
      title = title.substring(0, 47) + '...';
    }
    return title || 'New Chat';
  }
}

