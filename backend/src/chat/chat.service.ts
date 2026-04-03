import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { Inject, forwardRef } from '@nestjs/common';
import { CompaniesService } from '../companies/companies.service';
import { SendMessageDto, CreateSessionDto, UpdateContextDto, ChatQueryDto } from './dto/chat.dto';

import { ConfigService } from '@nestjs/config';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private readonly aiServiceUrl: string;

  constructor(
    private prisma: PrismaService,
    private httpService: HttpService,
    private configService: ConfigService,
    @Inject(forwardRef(() => CompaniesService))
    private companiesService: CompaniesService,
  ) {
    this.aiServiceUrl = this.configService.get<string>('AI_SERVICE_URL', 'http://localhost:8001');
  }

  /** Authorization headers sent with every AI service request */
  private get aiServiceHeaders(): Record<string, string> {
    const secret = this.configService.get<string>('AI_SERVICE_SECRET', '');
    return secret ? { Authorization: `Bearer ${secret}` } : {};
  }

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
  async sendMessage(userId: string, dto: SendMessageDto, userToken?: string) {
    try {
      // Get or create session
      const session = await this.getOrCreateSession(userId, dto.sessionId);

      // Get user context
      const userContext = await this.getUserContext(userId);

      // Get user details (including companyId for filtering)
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { 
          id: true, 
          name: true, 
          email: true, 
          role: true, 
          position: true, 
          companyId: true,
          department: { select: { name: true } },
          manager: { select: { name: true } },
        },
      });

      // Save user message with file metadata included
      const userMessage = await this.prisma.chatMessage.create({
        data: {
          sessionId: session.id,
          role: 'user',
          content: dto.message,
          metadata: {
            ...dto.metadata,
            files: dto.files || [],
          },
        },
      });

      // Process mentions, task references, and ticket references
      const mentions = this.extractMentions(dto.message);
      const taskRefs = this.extractTaskReferences(dto.message);
      const ticketRefs = this.extractTicketReferences(dto.message);
      const isDeepAnalysis = /\b(deep|details|detailed|explain|elaborate)\b/i.test(dto.message);

      // Get user's company ID for filtering
      const userCompanyId = user.companyId;

      this.logger.log(`🏢 User company ID: ${userCompanyId}`);

      if (!userCompanyId) {
        this.logger.error(`❌ User ${user.name} has no companyId!`);
        throw new Error('Your account is not associated with a company. Please contact support.');
      }

      // Get company's AI API key and provider info
      const company = await this.prisma.company.findUnique({
        where: { id: userCompanyId },
        select: {
          aiApiKey: true,
          aiEnabled: true,
          aiProvider: true,
          name: true
        },
      });

      this.logger.log(`🏢 Company found: ${company?.name}, AI Enabled: ${company?.aiEnabled}, Provider: ${company?.aiProvider}`);

      if (!company || !company.aiEnabled || !company.aiApiKey) {
        throw new Error('AI is not enabled for your company. Please ask your administrator to add an AI API key.');
      }

      // CRITICAL: Decrypt the AI API key using centralized decryption
      const aiApiKey = this.companiesService.decryptApiKey(company.aiApiKey);
      
      if (!aiApiKey || aiApiKey.includes('[DECRYPTION_FAILED]')) {
        this.logger.error(`❌ Failed to decrypt AI key for company: ${company.name}`);
        throw new Error('Internal error decrypting your AI key. Please contact support.');
      }

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

      this.logger.log(`📚 Found ${knowledgeSources.length} knowledge sources for company ${company.name}`);
      knowledgeSources.forEach(ks => {
        this.logger.log(`  - ${ks.name} (${ks.type}): ${ks.content ? `${ks.content.length} chars` : 'NO CONTENT'}`);
      });

      // Fetch additional context based on mentions, task references, and ticket references
      const additionalContext = await this.fetchAdditionalContext(
        userId,
        mentions,
        taskRefs,
        ticketRefs
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

      // Normalize file URLs to absolute paths so the AI service can fetch them
      const backendUrlConfig = this.configService.get<string>('BACKEND_URL', 'http://localhost:3001');
      const backendUrl = backendUrlConfig.replace(/\/$/, '');
      
      const normalizedFiles = (dto.files || []).map(file => {
        if (file.url && (file.url.startsWith('/') || !file.url.startsWith('http'))) {
          const prefix = file.url.startsWith('/') ? '' : '/';
          const fullUrl = `${backendUrl}${prefix}${file.url}`;
          this.logger.log(`🔗 Normalizing file URL: ${file.url} -> ${fullUrl}`);
          return { ...file, url: fullUrl };
        }
        return file;
      });

      this.logger.log(`📦 Payload DTO files: ${dto.files?.length || 0}`);
      this.logger.log(`📦 Normalized files to send to AI: ${normalizedFiles.length}`);

      // Call AI service with company name
      const aiResponse = await this.callAiChatService({
        message: dto.message,
        userContext: userContext.context,
        user,
        conversationHistory,
        knowledgeSources,
        additionalContext,
        isDeepAnalysis,
        api_key: aiApiKey, // CRITICAL: Pass company-specific API key (snake_case for Python)
        provider: company.aiProvider || 'gemini', // CRITICAL: Pass company provider
        companyName: company.name, // CRITICAL: Pass actual company name
        files: normalizedFiles, // Pass absolute URL files for multimodal support
        userToken, // Pass user's access token for file fetching
      });

      // Save assistant message (Safety first: ensure content is a string)
      const assistantContent = typeof aiResponse === 'string' 
        ? aiResponse 
        : (aiResponse?.message || aiResponse?.content || "I encountered an error processing your request.");

      const assistantMessage = await this.prisma.chatMessage.create({
        data: {
          sessionId: session.id,
          role: 'assistant',
          content: String(assistantContent),
          metadata: {
            mentions,
            taskRefs,
            ticketRefs,
            contextUsed: !!aiResponse?.contextUsed,
            files: aiResponse?.files || [], // For future AI return assets
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
    
    // Also find codes like TSK-1001
    const tskRegex = /\bTSK-(\d+)\b/gi;
    while ((match = tskRegex.exec(message)) !== null) {
      tasks.push(match[0].toUpperCase());
    }

    return tasks;
  }

  /**
   * Extract #ticket references from message
   */
  private extractTicketReferences(message: string): string[] {
    const ticketRegex = /#([^\s]+)/g;
    const tickets: string[] = [];
    let match;

    while ((match = ticketRegex.exec(message)) !== null) {
      tickets.push(match[1]);
    }
    
    // Also find codes like TKT-1001
    const tktRegex = /\bTKT-(\d+)\b/gi;
    while ((match = tktRegex.exec(message)) !== null) {
      tickets.push(match[0].toUpperCase());
    }

    return tickets;
  }

  /**
   * Fetch additional context based on mentions and task references
   * COMPANY-SPECIFIC: Only fetch data from the user's company
   */
  private async fetchAdditionalContext(
    userId: string,
    mentions: string[],
    taskRefs: string[],
    ticketRefs: string[],
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

    // ALWAYS fetch the user's active tasks
    const activeTasks = await this.prisma.task.findMany({
      where: {
        companyId: user.companyId,
        completedAt: null,
        OR: [
          { assignedToId: userId },
          { assignments: { some: { userId } } },
        ]
      },
      select: {
        id: true,
        title: true,
        priority: true,
        dueDate: true,
        currentPhase: { select: { name: true } },
      },
      take: 20
    });
    context.userActiveTasks = activeTasks;

    // ALWAYS fetch the user's latest stats (optional but helpful)
    const completedTasksCount = await this.prisma.task.count({
      where: {
        companyId: user.companyId,
        completedAt: { not: null },
        OR: [
          { assignedToId: userId },
          { assignments: { some: { userId } } },
        ]
      }
    });

    context.userAnalytics = {
      activeTaskCount: activeTasks.length,
      completedTaskCount: completedTasksCount
    };

    // ALWAYS fetch company active Objectives (for general queries about goals)
    const activeObjectives = await this.prisma.objective.findMany({
      where: {
        companyId: user.companyId,
        status: { in: ['ON_TRACK', 'AT_RISK', 'OFF_TRACK'] }
      },
      select: {
        id: true,
        title: true,
        status: true,
      },
      take: 10
    });
    context.companyObjectives = activeObjectives;

    // ALWAYS fetch active/upcoming quarters
    const activeQuarters = await this.prisma.quarter.findMany({
      where: {
        companyId: user.companyId,
        status: { in: ['ACTIVE', 'UPCOMING'] }
      },
      select: {
        id: true,
        name: true,
        year: true,
        status: true,
        startDate: true,
        endDate: true,
      },
      take: 4
    });
    context.companyQuarters = activeQuarters;

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
      // Split into number codes (TSK-1001) and text slugs
      const codes = taskRefs.filter(r => r.startsWith('TSK-'));
      const ticketCodes = taskRefs.filter(r => r.startsWith('TKT-'));
      const slugs = taskRefs.filter(r => !r.includes('-'));

      const tasks = await this.prisma.task.findMany({
        where: {
          companyId: user.companyId,
          OR: [
            ...(codes.length > 0 ? [{ taskNumber: { in: codes } }] : []),
            ...(slugs.length > 0 ? slugs.map(ref => ({ title: { contains: ref, mode: Prisma.QueryMode.insensitive } })) : []),
          ],
        },
        include: {
          assignedTo: { select: { id: true, name: true, email: true } },
          currentPhase: { select: { id: true, name: true } },
        },
      });
      context.referencedTasks = tasks;

      // Also fetch referenced tickets
      if (ticketCodes.length > 0) {
        const tickets = await this.prisma.ticket.findMany({
          where: {
            companyId: user.companyId,
            ticketNumber: { in: ticketCodes },
          },
          include: {
            requester: { select: { name: true } },
            receiverDept: { select: { name: true } },
            assignee: { select: { name: true } },
          },
        });
        context.referencedTickets = tickets;
      }
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
          headers: this.aiServiceHeaders,
          timeout: 45000, // Slightly longer timeout since multimodal processing might take longer
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
        }),
      );

      return response.data;
    } catch (error: any) {
      const statusCode = error.response?.status;
      const detail = error.response?.data?.detail;
      const detailedError = detail
        ? (typeof detail === 'string' ? detail : JSON.stringify(detail))
        : error.message || 'Unknown error';

      this.logger.error('Error calling AI chat service:', detailedError);

      // Distinguish between connection failure vs AI service returning an error
      const isConnectionError =
        error.code === 'ECONNREFUSED' ||
        error.code === 'ENOTFOUND' ||
        error.code === 'ECONNRESET' ||
        error.code === 'ECONNABORTED' ||
        error.code === 'ETIMEDOUT' ||
        error.message?.includes('timeout') ||
        error.message?.includes('connect');

      if (isConnectionError) {
        // AI service is down — friendly fallback
        return {
          message: "I'm having trouble connecting to my AI brain right now. Please try again in a moment.",
          contextUsed: false,
          learnedContext: null,
        };
      }

       // API-level error (bad key, quota, etc.) — surface it clearly
      const userFacingMessage = statusCode === 401 || statusCode === 403
        ? 'AI authentication failed. Please check the API key in your company settings.'
        : detailedError.includes('API_KEY_INVALID') || detailedError.includes('API key not valid')
          ? 'The AI API key is invalid. Please update it in your company settings.'
          : (detailedError && detailedError !== 'Unknown error' ? detailedError : 'The AI service encountered an error.');

      return {
        message: `⚠️ ${userFacingMessage}`,
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
        {
          headers: this.aiServiceHeaders,
          timeout: 30000
        }
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
        {
          headers: this.aiServiceHeaders,
          timeout: 30000
        }
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

