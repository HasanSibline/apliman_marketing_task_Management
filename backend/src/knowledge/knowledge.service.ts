import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { CreateKnowledgeSourceDto, UpdateKnowledgeSourceDto } from './dto/knowledge-source.dto';

@Injectable()
export class KnowledgeService {
  private readonly logger = new Logger(KnowledgeService.name);
  private readonly aiServiceUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.aiServiceUrl = this.configService.get<string>('AI_SERVICE_URL', 'http://localhost:8001');
  }

  /**
   * Get user's companyId for filtering
   */
  private async getUserCompanyId(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { companyId: true, role: true },
    });
    
    if (user?.role === 'SUPER_ADMIN') {
      return null;
    }
    
    return user?.companyId || null;
  }

  async findAll(userId?: string) {
    let companyId: string | null = null;
    if (userId) {
      companyId = await this.getUserCompanyId(userId);
    }

    return this.prisma.knowledgeSource.findMany({
      where: companyId ? { companyId } : {},
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: [
        { priority: 'desc' },
        { createdAt: 'desc' },
      ],
    });
  }

  async findActive(userId?: string) {
    let companyId: string | null = null;
    if (userId) {
      companyId = await this.getUserCompanyId(userId);
    }

    return this.prisma.knowledgeSource.findMany({
      where: {
        isActive: true,
        ...(companyId && { companyId }),
      },
      orderBy: [
        { priority: 'desc' },
        { createdAt: 'desc' },
      ],
    });
  }

  async findOne(id: string) {
    return this.prisma.knowledgeSource.findUnique({
      where: { id },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  }

  async create(createDto: CreateKnowledgeSourceDto, userId: string) {
    // Get user's company
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { companyId: true },
    });

    const source = await this.prisma.knowledgeSource.create({
      data: {
        ...createDto,
        createdById: userId,
        companyId: user?.companyId,
      },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    // Automatically scrape content if URL is provided
    if (source.url) {
      this.scrapeSource(source.id).catch((error) => {
        this.logger.error(`Failed to scrape source ${source.id} after creation:`, error);
      });
    }

    return source;
  }

  async update(id: string, updateDto: UpdateKnowledgeSourceDto) {
    const source = await this.prisma.knowledgeSource.update({
      where: { id },
      data: updateDto,
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    // Re-scrape if URL was changed
    if (updateDto.url && updateDto.url !== source.url) {
      this.scrapeSource(id).catch((error) => {
        this.logger.error(`Failed to scrape source ${id} after update:`, error);
      });
    }

    return source;
  }

  async delete(id: string) {
    return this.prisma.knowledgeSource.delete({
      where: { id },
    });
  }

  async scrapeSource(id: string) {
    const source = await this.findOne(id);
    if (!source) {
      throw new Error('Knowledge source not found');
    }

    try {
      this.logger.log(`Scraping content from: ${source.url}`);

      // Call AI service to scrape URL
      const response = await firstValueFrom(
        this.httpService.post(`${this.aiServiceUrl}/scrape-url`, {
          url: source.url,
        }, {
          timeout: 30000, // 30 second timeout
        }),
      );

      const scrapedData = response.data;

      if (scrapedData.success) {
        // Update source with scraped content
        const updated = await this.prisma.knowledgeSource.update({
          where: { id },
          data: {
            content: scrapedData.content,
            metadata: scrapedData.metadata,
            lastScraped: new Date(),
            scrapingError: null,
          },
        });

        this.logger.log(`Successfully scraped ${source.name}: ${scrapedData.content?.length || 0} characters`);
        return updated;
      } else {
        // Update with error
        const updated = await this.prisma.knowledgeSource.update({
          where: { id },
          data: {
            scrapingError: scrapedData.error,
            lastScraped: new Date(),
          },
        });

        throw new Error(`Scraping failed: ${scrapedData.error}`);
      }
    } catch (error) {
      this.logger.error(`Error scraping source ${source.name}:`, error.message);

      // Update with error
      await this.prisma.knowledgeSource.update({
        where: { id },
        data: {
          scrapingError: error.message,
          lastScraped: new Date(),
        },
      });

      throw error;
    }
  }

  async scrapeAll() {
    const sources = await this.prisma.knowledgeSource.findMany({
      where: {
        isActive: true,
      },
    });

    const results = [];
    for (const source of sources) {
      try {
        await this.scrapeSource(source.id);
        results.push({
          id: source.id,
          name: source.name,
          success: true,
        });
      } catch (error) {
        results.push({
          id: source.id,
          name: source.name,
          success: false,
          error: error.message,
        });
      }
    }

    return {
      total: sources.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results,
    };
  }

  async getActiveKnowledgeForAI() {
    const sources = await this.findActive();
    return sources.map(source => ({
      id: source.id,
      name: source.name,
      type: source.type,
      content: source.content,
      isActive: source.isActive,
      priority: source.priority,
    }));
  }
}

