import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { ExtendSubscriptionDto } from './dto/extend-subscription.dto';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

@Injectable()
export class CompaniesService {
  constructor(private prisma: PrismaService) {}

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
    const subscriptionEnd = createCompanyDto.subscriptionDays
      ? new Date(Date.now() + createCompanyDto.subscriptionDays * 24 * 60 * 60 * 1000)
      : null;

    // Set plan-based limits
    const limits = this.getPlanLimits(createCompanyDto.subscriptionPlan);

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
          subscriptionEnd,
          monthlyPrice: limits.price,
          maxUsers: createCompanyDto.maxUsers || limits.maxUsers,
          maxTasks: createCompanyDto.maxTasks || limits.maxTasks,
          maxStorage: createCompanyDto.maxStorage || limits.maxStorage,
          aiApiKey,
          aiProvider: createCompanyDto.aiProvider || 'gemini',
          aiEnabled: !!createCompanyDto.aiApiKey,
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

      console.log(`✅ Company admin created: ${adminUser.email} (${adminUser.name})`);
      console.log(`   Company: ${newCompany.name} (${newCompany.slug})`);
      console.log(`   Password hash length: ${hashedPassword.length}`);

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
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Get AI usage for each company
    const companiesWithStats = await Promise.all(
      companies.map(async (company) => {
        const aiUsage = await this.getAIUsageStats(company.id);
        return {
          ...company,
          aiApiKey: company.aiApiKey ? '[ENCRYPTED]' : null, // Never expose the actual key
          stats: {
            usersCount: company._count.users,
            tasksCount: company._count.tasks,
            workflowsCount: company._count.workflows,
            chatSessionsCount: company._count.chatSessions,
            aiMessagesCount: aiUsage.totalMessages,
            aiTokensUsed: aiUsage.totalTokens,
            aiCost: aiUsage.totalCost,
          },
          _count: undefined, // Remove raw count
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

    const aiUsage = await this.getAIUsageStats(company.id);

    return {
      ...company,
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
   * Get plan-based limits
   */
  private getPlanLimits(plan: string) {
    const plans = {
      FREE: { maxUsers: 5, maxTasks: 100, maxStorage: 1, price: 0 },
      PRO: { maxUsers: 25, maxTasks: 5000, maxStorage: 10, price: 99 },
      ENTERPRISE: { maxUsers: -1, maxTasks: -1, maxStorage: 100, price: 299 },
    };
    return plans[plan] || plans.FREE;
  }

  /**
   * Generate random password
   */
  private generatePassword(): string {
    return crypto.randomBytes(12).toString('base64').slice(0, 16);
  }

  /**
   * Encrypt API key (simple encryption - use proper encryption in production)
   */
  private encryptApiKey(apiKey: string): string {
    // TODO: Implement proper encryption with process.env.ENCRYPTION_KEY
    return Buffer.from(apiKey).toString('base64');
  }

  /**
   * Decrypt API key
   */
  decryptApiKey(encryptedKey: string): string {
    // TODO: Implement proper decryption
    return Buffer.from(encryptedKey, 'base64').toString('utf-8');
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


