import { Injectable, NotFoundException, BadRequestException, ConflictException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { ExtendSubscriptionDto } from './dto/extend-subscription.dto';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

@Injectable()
export class CompaniesService {
  private readonly logger = new Logger(CompaniesService.name);
  constructor(private prisma: PrismaService) { }

  /**
   * Create a new company with admin user
   * Only accessible by SUPER_ADMIN
   */
  async create(createCompanyDto: CreateCompanyDto, superAdminId: string) {
    // Check if company name or slug already exists
    const existing = await this.prisma.company.findFirst({
      where: {
        OR: [
          { name: createCompanyDto.name },
          { slug: createCompanyDto.slug },
        ],
      },
    });

    if (existing) {
      throw new ConflictException('Company name or slug already exists');
    }

    // Generate password if not provided
    const adminPassword = createCompanyDto.adminPassword || this.generatePassword();
    const hashedPassword = await bcrypt.hash(adminPassword, 10);

    // Determine subscription end date
    let subscriptionEnd = createCompanyDto.subscriptionDays
      ? new Date(Date.now() + createCompanyDto.subscriptionDays * 24 * 60 * 60 * 1000)
      : null;

    // MANDATORY: If Plan is FREE_TRIAL, force 7 days only
    if (createCompanyDto.subscriptionPlan === 'FREE_TRIAL') {
      subscriptionEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    }

    // Set plan-based limits
    const limits = await this.getPlanLimits(createCompanyDto.subscriptionPlan);

    // Encrypt AI API key if provided
    const aiApiKey = createCompanyDto.aiApiKey
      ? this.encryptApiKey(createCompanyDto.aiApiKey)
      : null;

    // Create company with admin user in transaction
    const company = await this.prisma.$transaction(async (prisma) => {
      // Create company
      const newCompany = await prisma.company.create({
        data: {
          name: createCompanyDto.name,
          slug: createCompanyDto.slug,
          logo: createCompanyDto.logo,
          primaryColor: createCompanyDto.primaryColor || '#3B82F6',
          subscriptionPlan: createCompanyDto.subscriptionPlan,
          subscriptionStatus: subscriptionEnd ? 'ACTIVE' : 'TRIAL',
          subscriptionEnd,
          monthlyPrice: limits.price,
          maxUsers: createCompanyDto.maxUsers, // Nullable override
          maxTasks: createCompanyDto.maxTasks, // Nullable override
          maxStorage: createCompanyDto.maxStorage, // Nullable override
          aiApiKey,
          aiProvider: createCompanyDto.aiProvider || 'gemini',
          aiEnabled: !!createCompanyDto.aiApiKey,
          billingEmail: createCompanyDto.billingEmail,
          createdBy: superAdminId,
        },
      });

      // Create default company settings
      await prisma.companySettings.create({
        data: {
          companyId: newCompany.id,
        },
      });

      // Create company admin user
      const adminUser = await prisma.user.create({
        data: {
          companyId: newCompany.id,
          email: createCompanyDto.adminEmail,
          name: createCompanyDto.adminName,
          password: hashedPassword,
          role: 'COMPANY_ADMIN',
          position: 'Company Administrator',
          status: 'ACTIVE', // Ensure the user is active
        },
      });

      this.logger.log(`Company created: ${newCompany.name} (${newCompany.slug}), admin: ${adminUser.email}`);

      // Log subscription history
      await prisma.subscriptionHistory.create({
        data: {
          companyId: newCompany.id,
          action: 'CREATED',
          toPlan: createCompanyDto.subscriptionPlan,
          amount: limits.price,
          performedBy: superAdminId,
        },
      });

      return newCompany;
    });

    return {
      company,
      adminCredentials: {
        email: createCompanyDto.adminEmail,
        password: adminPassword, // Return plain password only on creation
      },
    };
  }

  /**
   * Get all companies with statistics
   * IMPORTANT: Super admin can see stats but NOT actual data
   */
  async findAll() {
    const companies = await this.prisma.company.findMany({
      include: {
        _count: {
          select: {
            users: true,
            tasks: true,
            workflows: true,
            chatSessions: true,
            aiUsageStats: true,
          },
        },
        settings: true,
        users: {
          where: { role: 'COMPANY_ADMIN' },
          select: { id: true, email: true, name: true },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Get AI usage for each company
    const companiesWithStats = await Promise.all(
      companies.map(async (company) => {
        const aiUsage = await this.getAIUsageStats(company.id);
        const adminUser = (company as any).users?.[0] ?? null;
        return {
          ...company,
          users: undefined,          // remove the raw array
          adminEmail: adminUser?.email ?? null,
          adminName: adminUser?.name ?? null,
          aiApiKey: company.aiApiKey ? '[ENCRYPTED]' : null,
          stats: {
            usersCount: company._count.users,
            tasksCount: company._count.tasks,
            workflowsCount: company._count.workflows,
            chatSessionsCount: company._count.chatSessions,
            aiMessagesCount: aiUsage.totalMessages,
            aiTokensUsed: aiUsage.totalTokens,
            aiCost: aiUsage.totalCost,
          },
          _count: undefined,
        };
      }),
    );

    return companiesWithStats;
  }

  /**
   * Get single company with statistics
   */
  async findOne(id: string) {
    const company = await this.prisma.company.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            users: true,
            tasks: true,
            workflows: true,
            chatSessions: true,
          },
        },
        settings: true,
      },
    });

    if (!company) {
      throw new NotFoundException('Company not found');
    }

    // Get AI usage stats
    const aiUsage = await this.getAIUsageStats(company.id);

    // Count active and completed tasks using workflow end phases
    const endPhaseIds = await this.prisma.phase
      .findMany({
        where: { isEndPhase: true, workflow: { companyId: id } },
        select: { id: true },
      })
      .then((phases) => phases.map((p) => p.id));

    const activeTasks = await this.prisma.task.count({
      where: {
        companyId: id,
        taskType: { not: 'SUBTASK' },
        currentPhaseId: { notIn: endPhaseIds },
      },
    });

    const completedTasks = await this.prisma.task.count({
      where: {
        companyId: id,
        taskType: { not: 'SUBTASK' },
        currentPhaseId: { in: endPhaseIds },
      },
    });

    return {
      ...company,
      aiApiKey: company.aiApiKey ? this.decryptApiKey(company.aiApiKey) : null, // Decrypt for editing
      stats: {
        totalUsers: company._count.users,
        activeTasks: activeTasks,
        completedTasks: completedTasks,
        aiMessagesCount: aiUsage.totalMessages,
        aiTokensUsed: aiUsage.totalTokens,
        aiTotalCost: aiUsage.totalCost,
      },
      _count: undefined, // Remove raw count from response
    };
  }

  /**
   * Public endpoint: Get company branding by slug
   * Used for company-specific login pages
   */
  async findBySlug(slug: string) {
    const company = await this.prisma.company.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        slug: true,
        logo: true,
        primaryColor: true,
        isActive: true,
        subscriptionStatus: true,
      },
    });

    if (!company) {
      throw new NotFoundException('Company not found');
    }

    return company;
  }

  /**
   * Get company by slug (public endpoint for login pages)
   */
  async getCompanyBySlug(slug: string) {
    return this.prisma.company.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        slug: true,
        logo: true,
        primaryColor: true,
        isActive: true,
        subscriptionStatus: true,
        subscriptionEnd: true,
      },
    });
  }

  /**
   * Update company details
   */
  async update(id: string, updateCompanyDto: UpdateCompanyDto, superAdminId: string) {
    const company = await this.prisma.company.findUnique({ where: { id } });
    if (!company) {
      throw new NotFoundException('Company not found');
    }

    // Encrypt new AI API key if provided
    if (updateCompanyDto.aiApiKey) {
      updateCompanyDto.aiApiKey = this.encryptApiKey(updateCompanyDto.aiApiKey);
      updateCompanyDto.aiEnabled = true;
    }

    // Log subscription changes
    if (updateCompanyDto.subscriptionPlan && updateCompanyDto.subscriptionPlan !== company.subscriptionPlan) {
      await this.prisma.subscriptionHistory.create({
        data: {
          companyId: id,
          action: updateCompanyDto.subscriptionPlan > company.subscriptionPlan ? 'UPGRADED' : 'DOWNGRADED',
          fromPlan: company.subscriptionPlan,
          toPlan: updateCompanyDto.subscriptionPlan,
          performedBy: superAdminId,
        },
      });
    }

    return this.prisma.company.update({
      where: { id },
      data: updateCompanyDto,
    });
  }

  /**
   * Extend subscription
   */
  async extendSubscription(id: string, extendDto: ExtendSubscriptionDto, superAdminId: string) {
    const company = await this.prisma.company.findUnique({ where: { id } });
    if (!company) {
      throw new NotFoundException('Company not found');
    }

    const currentEnd = company.subscriptionEnd || new Date();
    const newEnd = new Date(currentEnd.getTime() + extendDto.days * 24 * 60 * 60 * 1000);

    await this.prisma.subscriptionHistory.create({
      data: {
        companyId: id,
        action: 'RENEWED',
        toPlan: company.subscriptionPlan,
        reason: extendDto.reason,
        performedBy: superAdminId,
      },
    });

    return this.prisma.company.update({
      where: { id },
      data: {
        subscriptionEnd: newEnd,
        subscriptionStatus: 'ACTIVE',
      },
    });
  }

  /**
   * Suspend company
   */
  async suspend(id: string, reason: string, superAdminId: string) {
    await this.prisma.subscriptionHistory.create({
      data: {
        companyId: id,
        action: 'SUSPENDED',
        toPlan: (await this.prisma.company.findUnique({ where: { id } })).subscriptionPlan,
        reason,
        performedBy: superAdminId,
      },
    });

    return this.prisma.company.update({
      where: { id },
      data: {
        subscriptionStatus: 'SUSPENDED',
        isActive: false,
      },
    });
  }

  /**
   * Reactivate company
   */
  async reactivate(id: string, superAdminId: string) {
    await this.prisma.subscriptionHistory.create({
      data: {
        companyId: id,
        action: 'REACTIVATED',
        toPlan: (await this.prisma.company.findUnique({ where: { id } })).subscriptionPlan,
        performedBy: superAdminId,
      },
    });

    return this.prisma.company.update({
      where: { id },
      data: {
        subscriptionStatus: 'ACTIVE',
        isActive: true,
      },
    });
  }

  /**
   * Reset company admin password
   */
  async resetAdminPassword(companyId: string, adminEmail: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        companyId,
        email: adminEmail,
        role: 'COMPANY_ADMIN',
      },
    });

    if (!user) {
      throw new NotFoundException('Company admin not found');
    }

    const newPassword = this.generatePassword();
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword },
    });

    return {
      email: adminEmail,
      newPassword, // Return for super admin to share with client
    };
  }

  /**
   * Get AI usage statistics for a company
   */
  private async getAIUsageStats(companyId: string) {
    const stats = await this.prisma.companyAIUsage.aggregate({
      where: { companyId },
      _sum: {
        messageCount: true,
        tokensUsed: true,
        cost: true,
      },
    });

    return {
      totalMessages: stats._sum.messageCount || 0,
      totalTokens: stats._sum.tokensUsed || 0,
      totalCost: stats._sum.cost || 0,
    };
  }

  /**
   * Get current user's company information
   * Used by company users to fetch their own company details
   */
  async getMyCompany(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { companyId: true },
    });

    if (!user?.companyId) {
      throw new NotFoundException('User is not associated with any company');
    }

    const company = await this.prisma.company.findUnique({
      where: { id: user.companyId },
      select: {
        id: true,
        name: true,
        slug: true,
        logo: true,
        primaryColor: true,
        isActive: true,
        subscriptionStatus: true,
        subscriptionPlan: true,
        aiEnabled: true,
        aiProvider: true,
      },
    });

    if (!company) {
      throw new NotFoundException('Company not found');
    }

    return company;
  }

  /**
   * Get platform-wide statistics
   * Used for System Admin analytics dashboard
   */
  async getPlatformStats() {
    const [
      totalCompanies,
      activeCompanies,
      suspendedCompanies,
      totalUsers,
      totalTasks,
      totalAIMessages,
      companiesOnTrial,
      companiesExpired,
    ] = await Promise.all([
      this.prisma.company.count(),
      this.prisma.company.count({ where: { isActive: true, subscriptionStatus: 'ACTIVE' } }),
      this.prisma.company.count({ where: { subscriptionStatus: 'SUSPENDED' } }),
      this.prisma.user.count({ where: { companyId: { not: null } } }), // Exclude SUPER_ADMIN
      this.prisma.task.count(),
      this.prisma.chatMessage.count(),
      this.prisma.company.count({ where: { subscriptionStatus: 'TRIAL' } }),
      this.prisma.company.count({ where: { subscriptionStatus: 'EXPIRED' } }),
    ]);

    return {
      totalCompanies,
      activeCompanies,
      suspendedCompanies,
      totalUsers,
      totalTasks,
      totalAIMessages,
      companiesOnTrial,
      companiesExpired,
    };
  }

  /**
   * Get plan-based limits directly from database
   */
  private async getPlanLimits(planName: string): Promise<{ maxUsers: number, maxTasks: number, maxStorage: number, price: number }> {
    const plan = await (this.prisma as any).plan.findUnique({
      where: { name: planName },
    });

    if (plan) {
      return {
        maxUsers: Number(plan.maxUsers),
        maxTasks: Number(plan.maxTasks),
        maxStorage: Number(plan.maxStorage),
        price: Number(plan.price),
      };
    }

    // Fallback and default for FREE_TRIAL if not found
    return {
      maxUsers: 10,
      maxTasks: 500,
      maxStorage: 2,
      price: 0,
    };
  }

  /**
   * Get effective resource limits for a company (handles overrides)
   */
  async getCompanyResourceLimits(companyId: string): Promise<{ maxUsers: number, maxTasks: number, maxStorage: number } | null> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: {
        subscriptionPlan: true,
        maxUsers: true,
        maxTasks: true,
        maxStorage: true,
      },
    });

    if (!company) return null;

    const planLimits = await this.getPlanLimits(company.subscriptionPlan);

    return {
      maxUsers: company.maxUsers !== null ? Number(company.maxUsers) : planLimits.maxUsers,
      maxTasks: company.maxTasks !== null ? Number(company.maxTasks) : planLimits.maxTasks,
      maxStorage: company.maxStorage !== null ? Number(company.maxStorage) : planLimits.maxStorage,
    };
  }

  /**
   * Generate random password using cryptographically secure random bytes
   */
  private generatePassword(): string {
    return crypto.randomBytes(12).toString('base64').slice(0, 16);
  }

  /**
   * Encrypt API key using AES-256-CBC
   */
  private encryptApiKey(apiKey: string): string {
    try {
      const encryptionKey = process.env.ENCRYPTION_KEY;
      if (!encryptionKey) {
        this.logger.warn('ENCRYPTION_KEY not found in environment, falling back to Base64 (INSECURE)');
        return Buffer.from(apiKey).toString('base64');
      }

      // Key must be exactly 32 bytes for aes-256-cbc
      const key = crypto.scryptSync(encryptionKey, 'salt', 32);
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
      
      let encrypted = cipher.update(apiKey, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      // Store IV with encrypted data (iv:encryptedContent)
      return `${iv.toString('hex')}:${encrypted}`;
    } catch (error) {
      this.logger.error(`Encryption failed: ${error.message}`);
      return Buffer.from(apiKey).toString('base64'); // Emergency fallback
    }
  }

  /**
   * Decrypt API key
   */
  decryptApiKey(encryptedKey: string): string {
    try {
      if (!encryptedKey) return null;

      // Handle legacy Base64 or non-IV format
      if (!encryptedKey.includes(':')) {
        return Buffer.from(encryptedKey, 'base64').toString('utf-8');
      }

      const encryptionKey = process.env.ENCRYPTION_KEY;
      if (!encryptionKey) {
        this.logger.error('ENCRYPTION_KEY missing during decryption');
        return '[DECRYPTION_FAILED_MISSING_KEY]';
      }

      const [ivHex, encryptedText] = encryptedKey.split(':');
      const iv = Buffer.from(ivHex, 'hex');
      const key = crypto.scryptSync(encryptionKey, 'salt', 32);
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
      
      let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      this.logger.error(`Decryption failed: ${error.message}`);
      // If decryption fails, it might be a legacy Base64 key that looks like it has a colon 
      // or just genuine failure. For safety, return indicator.
      return '[DECRYPTION_FAILED]';
    }
  }

  /**
   * Toggle AI for a company
   */
  async toggleAI(companyId: string, enabled: boolean, superAdminId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
    });

    if (!company) {
      throw new NotFoundException('Company not found');
    }

    // If enabling AI, require an API key
    if (enabled && !company.aiApiKey) {
      throw new BadRequestException('Cannot enable AI: No API key configured for this company');
    }

    const updated = await this.prisma.company.update({
      where: { id: companyId },
      data: { aiEnabled: enabled },
      select: {
        id: true,
        name: true,
        aiEnabled: true,
      },
    });

    return {
      ...updated,
      message: `AI ${enabled ? 'enabled' : 'disabled'} successfully`,
    };
  }

  /**
   * Delete a company and all its data
   * DANGEROUS: This will delete all company data including users, tasks, etc.
   */
  async delete(companyId: string, superAdminId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      include: {
        _count: {
          select: {
            users: true,
            tasks: true,
            workflows: true,
          },
        },
      },
    });

    if (!company) {
      throw new NotFoundException('Company not found');
    }

    // Perform deletion in transaction
    await this.prisma.$transaction(async (prisma) => {
      // Delete all company-related data
      // Prisma will handle cascade deletes based on schema

      await prisma.company.delete({
        where: { id: companyId },
      });
    });

    return {
      message: `Company "${company.name}" and all associated data deleted successfully`,
      deletedCounts: {
        users: company._count.users,
        tasks: company._count.tasks,
        workflows: company._count.workflows,
      },
    };
  }
}


