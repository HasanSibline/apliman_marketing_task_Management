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

    // Get user's companyId
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { companyId: true },
    });

    // Create new session
    return this.prisma.chatSession.create({
      data: {
        userId,
        companyId: user?.companyId,
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
   * Intelligently merges new context with existing context
   */
  async updateUserContext(userId: string, newContext: any) {
    const existing = await this.getUserContext(userId);
    
    // Intelligently merge contexts - new values override old ones (for corrections)
    const updatedContext = this.mergeContextIntelligently(
      existing.context as any,
      newContext
    );

    updatedContext.lastUpdated = new Date().toISOString();

    return this.prisma.userChatContext.update({
      where: { userId },
      data: { context: updatedContext },
    });
  }

  /**
   * Intelligently merge new context with existing context
   * Handles corrections, updates, and array merging
   */
  private mergeContextIntelligently(existing: any, newContext: any): any {
    const merged = { ...existing };

    for (const [key, value] of Object.entries(newContext)) {
      if (key === 'lastUpdated') continue;

      // If the key doesn't exist, just add it
      if (!(key in merged)) {
        merged[key] = value;
        continue;
      }

      // If both are arrays, merge and deduplicate
      if (Array.isArray(value) && Array.isArray(merged[key])) {
        merged[key] = [...new Set([...merged[key], ...value])];
      }
      // If both are objects, merge recursively
      else if (
        typeof value === 'object' &&
        value !== null &&
        typeof merged[key] === 'object' &&
        merged[key] !== null &&
        !Array.isArray(value)
      ) {
        merged[key] = this.mergeContextIntelligently(merged[key], value);
      }
      // For primitive values, new value replaces old (handles corrections)
      else {
        merged[key] = value;
      }
    }

    return merged;
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

      // Get user details (including companyId for filtering)
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, email: true, role: true, position: true, companyId: true },
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

      // Get user's company ID for filtering
      const userCompanyId = user.companyId;

      // Get company's AI API key
      const company = await this.prisma.company.findUnique({
        where: { id: userCompanyId },
        select: { 
          aiApiKey: true, 
          aiEnabled: true,
          name: true 
        },
      });

      if (!company || !company.aiEnabled || !company.aiApiKey) {
        throw new Error('AI is not enabled for your company. Please ask your administrator to add an AI API key.');
      }

      // Decrypt the AI API key
      const aiApiKey = Buffer.from(company.aiApiKey, 'base64').toString('utf-8');

      // Get knowledge sources (COMPANY-SPECIFIC ONLY)
      const knowledgeSources = await this.prisma.knowledgeSource.findMany({
        where: { 
          isActive: true,
          companyId: userCompanyId // CRITICAL: Only get this company's knowledge sources
        },
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
        apiKey: aiApiKey, // CRITICAL: Pass company-specific API key
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
        this.logger.log(`✅ Updated context for user ${userId}: ${JSON.stringify(aiResponse.learnedContext)}`);
      }

      // Track domain questions for learning
      await this.trackDomainQuestion(userId, dto.message);

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
   * COMPANY-SPECIFIC: Only fetch data from the user's company
   */
  private async fetchAdditionalContext(
    userId: string,
    mentions: string[],
    taskRefs: string[],
  ) {
    const context: any = {};

    // Get user's company for filtering
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { companyId: true },
    });

    if (!user?.companyId) {
      return context; // No company, no context
    }

    // Fetch mentioned users (SAME COMPANY ONLY)
    if (mentions.length > 0) {
      const users = await this.prisma.user.findMany({
        where: {
          companyId: user.companyId, // CRITICAL: Same company only
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

    // Fetch referenced tasks (SAME COMPANY ONLY)
    if (taskRefs.length > 0) {
      const tasks = await this.prisma.task.findMany({
        where: {
          companyId: user.companyId, // CRITICAL: Same company only
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

  /**
   * Learn from user's task history
   * Analyzes completed and active tasks to extract insights
   * COMPANY-SPECIFIC: Only learns from the user's company data
   */
  async learnFromTaskHistory(userId: string) {
    try {
      // Get user context
      const userContext = await this.getUserContext(userId);

      // Get user's company for filtering
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { companyId: true },
      });

      if (!user?.companyId) {
        this.logger.warn('User has no company - skipping task history learning');
        return;
      }

      // Get completed tasks (last 10, COMPANY-SPECIFIC)
      const completedTasks = await this.prisma.task.findMany({
        where: {
          companyId: user.companyId, // CRITICAL: Same company only
          OR: [
            { createdById: userId },
            { assignedToId: userId },
            { assignments: { some: { userId } } },
          ],
          completedAt: { not: null },
        },
        orderBy: { completedAt: 'desc' },
        take: 10,
        select: {
          id: true,
          title: true,
          description: true,
          taskType: true,
          priority: true,
          completedAt: true,
          goals: true,
        },
      });

      // Get active tasks (up to 5, COMPANY-SPECIFIC)
      const activeTasks = await this.prisma.task.findMany({
        where: {
          companyId: user.companyId, // CRITICAL: Same company only
          OR: [
            { createdById: userId },
            { assignedToId: userId },
            { assignments: { some: { userId } } },
          ],
          completedAt: null,
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          title: true,
          description: true,
          taskType: true,
          priority: true,
          dueDate: true,
          goals: true,
        },
      });

      // Call AI service to learn from tasks
      const aiResponse = await this.httpService.axiosRef.post(
        `${this.aiServiceUrl}/learn-from-tasks`,
        {
          userContext: userContext.context,
          completedTasks,
          activeTasks,
        },
        { timeout: 30000 }
      );

      // Update user context with learned insights
      if (aiResponse.data?.learnedContext) {
        await this.updateUserContext(userId, aiResponse.data.learnedContext);
        this.logger.log(`✅ Learned from task history for user ${userId}`);
        return aiResponse.data.learnedContext;
      }

      return null;
    } catch (error) {
      this.logger.error(`Error learning from task history: ${error.message}`);
      return null;
    }
  }

  /**
   * Track domain-specific questions to learn user interests
   */
  async trackDomainQuestion(userId: string, message: string) {
    try {
      const userContext = await this.getUserContext(userId);
      const context = userContext.context as any;

      // Detect domain topics (generic company/industry terms)
      const domains = ['company', 'competitor', 'service', 'product', 'feature'];
      const messageLower = message.toLowerCase();

      for (const domain of domains) {
        if (messageLower.includes(domain)) {
          // Track question
          const questionsKey = `${domain}_questions`;
          const questions = context[questionsKey] || [];
          questions.push({
            question: message,
            timestamp: new Date().toISOString(),
          });

          // Keep only last 10 questions per domain
          const recentQuestions = questions.slice(-10);

          await this.updateUserContext(userId, {
            [questionsKey]: recentQuestions,
          });

          // If enough questions accumulated, trigger learning
          if (recentQuestions.length >= 3) {
            await this.learnDomainInterests(
              userId,
              domain,
              recentQuestions.map(q => q.question)
            );
          }

          break; // Only track for first matched domain
        }
      }
    } catch (error) {
      this.logger.error(`Error tracking domain question: ${error.message}`);
    }
  }

  /**
   * Learn what user is interested in regarding specific domains
   */
  private async learnDomainInterests(
    userId: string,
    domain: string,
    questions: string[]
  ) {
    try {
      const userContext = await this.getUserContext(userId);

      const aiResponse = await this.httpService.axiosRef.post(
        `${this.aiServiceUrl}/learn-domain-interests`,
        {
          domainTopic: domain,
          userQuestions: questions,
          existingKnowledge: userContext.context,
        },
        { timeout: 30000 }
      );

      if (aiResponse.data?.learnedInterests) {
        await this.updateUserContext(userId, aiResponse.data.learnedInterests);
        this.logger.log(`✅ Learned ${domain} interests for user ${userId}`);
      }
    } catch (error) {
      this.logger.error(`Error learning domain interests: ${error.message}`);
    }
  }
}

