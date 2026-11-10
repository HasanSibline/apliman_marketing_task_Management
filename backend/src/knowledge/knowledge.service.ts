import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { CreateKnowledgeSourceDto, UpdateKnowledgeSourceDto } from './dto/knowledge-source.dto';
import { classifyAiError, userFacingMessage } from '../ai/ai-error';

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

  /** Authorization headers sent with every AI service request */
  private get aiServiceHeaders(): Record<string, string> {
    const secret = this.configService.get<string>('AI_SERVICE_SECRET', '');
    return secret ? { Authorization: `Bearer ${secret}` } : {};
  }

  /**
   * Get user's companyId for filtering
   * Knowledge sources are company-specific only
   */
  private async getUserCompanyId(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { companyId: true, role: true },
    });

    // A 403, not a plain Error: the controllers used to turn this into a 500, so the
    // super administrator and any admin without a company saw "could not be loaded"
    // with no reason, and saving a source tried to write a null companyId.
    if (!user?.companyId) {
      throw new ForbiddenException(
        'Knowledge sources belong to a company. Sign in with an account that belongs to one to manage them.',
      );
    }

    return user.companyId;
  }

  async findAll(userId: string) {
    const companyId = await this.getUserCompanyId(userId);

    return this.prisma.knowledgeSource.findMany({
      where: { companyId },
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
    // If userId provided, filter by company
    // Otherwise return all active (for AI service)
    let where: any = { isActive: true };

    if (userId) {
      const companyId = await this.getUserCompanyId(userId);
      where.companyId = companyId;
    }

    return this.prisma.knowledgeSource.findMany({
      where,
      orderBy: [
        { priority: 'desc' },
        { createdAt: 'desc' },
      ],
    });
  }

  async findOne(id: string, userId: string) {
    const companyId = await this.getUserCompanyId(userId);

    return this.prisma.knowledgeSource.findFirst({
      where: {
        id,
        companyId, // Ensure user can only access their company's sources
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
  }

  async create(createDto: CreateKnowledgeSourceDto, userId: string) {
    const companyId = await this.getUserCompanyId(userId);

    const source = await this.prisma.knowledgeSource.create({
      data: {
        name: createDto.name,
        url: createDto.url,
        type: createDto.type,
        description: createDto.description,
        isActive: createDto.isActive,
        priority: createDto.priority,
        createdById: userId,
        companyId,
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
      this.scrapeSource(source.id, userId).catch((error) => {
        this.logger.error(`Failed to scrape source ${source.id} after creation:`, error);
      });
    }

    return source;
  }

  async update(id: string, updateDto: UpdateKnowledgeSourceDto, userId: string) {
    const companyId = await this.getUserCompanyId(userId);

    // Verify user has access to this source
    const existing = await this.prisma.knowledgeSource.findFirst({
      where: { id, companyId },
    });

    if (!existing) {
      throw new NotFoundException('Knowledge source not found');
    }

    const source = await this.prisma.knowledgeSource.update({
      where: { id },
      data: {
        ...(updateDto.name && { name: updateDto.name }),
        ...(updateDto.url && { url: updateDto.url }),
        ...(updateDto.type && { type: updateDto.type }),
        ...(updateDto.description !== undefined && { description: updateDto.description }),
        ...(updateDto.isActive !== undefined && { isActive: updateDto.isActive }),
        ...(updateDto.priority !== undefined && { priority: updateDto.priority }),
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

    // Re-scrape if URL was changed
    if (updateDto.url && updateDto.url !== existing.url) {
      this.scrapeSource(id, userId).catch((error) => {
        this.logger.error(`Failed to scrape source ${id} after update:`, error);
      });
    }

    return source;
  }

  async delete(id: string, userId: string) {
    const companyId = await this.getUserCompanyId(userId);

    // Verify user has access to this source
    const existing = await this.prisma.knowledgeSource.findFirst({
      where: { id, companyId },
    });

    if (!existing) {
      throw new NotFoundException('Knowledge source not found');
    }

    return this.prisma.knowledgeSource.delete({
      where: { id },
    });
  }

  async scrapeSource(id: string, userId: string) {
    const source = await this.findOne(id, userId);
    if (!source) {
      throw new NotFoundException('Knowledge source not found');
    }

    try {
      this.logger.log(`Scraping content from: ${source.url}`);

      // Call AI service to scrape URL
      const response = await firstValueFrom(
        this.httpService.post(`${this.aiServiceUrl}/scrape-url`, {
          url: source.url,
        }, {
          headers: this.aiServiceHeaders,
          timeout: 90000, // 90 second timeout for browser scraping
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
      const failure = this.describeScrapeFailure(error);
      this.logger.error(`Error scraping source ${source.name}: ${failure.stored}`);

      // Update with error
      await this.prisma.knowledgeSource.update({
        where: { id },
        data: {
          scrapingError: failure.stored,
          lastScraped: new Date(),
        },
      });

      throw failure.exception;
    }
  }

  /**
   * Why a scrape failed, for the source card and for the person who pressed the button.
   *
   * axios reports only "Request failed with status code 401" and drops the AI service's
   * own `detail`, which is the part that says what went wrong. A refused service token
   * is our configuration, not the page, so it gets the gateway's wording and kind.
   */
  private describeScrapeFailure(error: any): { stored: string; exception: HttpException } {
    const { kind } = classifyAiError(error);
    const status: number | undefined = error?.response?.status;
    const detail = error?.response?.data?.detail;

    if (kind === 'SERVICE_MISCONFIGURED') {
      // The server log names AI_SERVICE_SECRET; the tenant's source card does not.
      this.logger.error('AI service refused the service token: check AI_SERVICE_SECRET on both services');
      return {
        stored: 'The AI service refused the request because the server is misconfigured. Report it to the platform administrator.',
        exception: new HttpException(
          { statusCode: HttpStatus.INTERNAL_SERVER_ERROR, kind, message: userFacingMessage(kind) },
          HttpStatus.INTERNAL_SERVER_ERROR,
        ),
      };
    }
    // Our own 90 s wait ran out. Only axios's code says so: a scraper error that merely
    // mentions a timeout carries its own, more precise, wording below.
    if (error?.code === 'ECONNABORTED') {
      const stored = 'Reading the page took longer than 90 seconds. The AI service may be starting up, or the page is heavy; try again.';
      return { stored, exception: new HttpException(stored, HttpStatus.GATEWAY_TIMEOUT) };
    }
    // Unreachable, or a hosting proxy answering for it (502/503/504 with no FastAPI
    // detail) while the service restarts or sleeps.
    if (kind === 'NETWORK_ERROR' || ((status === 502 || status === 503 || status === 504) && !detail)) {
      const stored = 'Could not reach the AI service. It may be starting up; try again in a minute.';
      return { stored, exception: new HttpException(stored, HttpStatus.BAD_GATEWAY) };
    }

    const reason: string =
      (typeof detail === 'string' ? detail : detail?.message) ||
      (typeof error?.response?.data?.message === 'string' ? error.response.data.message : undefined) ||
      error?.message ||
      'Scraping failed';
    return { stored: reason, exception: new HttpException(reason, HttpStatus.BAD_GATEWAY) };
  }

  /** Companies with a scrape-all running, so a second click does not start another. */
  private readonly scrapingCompanies = new Set<string>();

  /**
   * Start reading every active source, and return at once.
   *
   * This used to read them one after another inside the request. Each source can take
   * most of a minute, so with two or three of them the browser gave up at 120 seconds
   * while the work carried on unseen. Now the request only starts the work; each
   * source records its own result (content, or the reason it failed) on its card as it
   * finishes, and the page refreshes the cards until they have all reported.
   *
   * One at a time on purpose: a page that needs the headless browser takes a few
   * hundred MB, and the AI service runs one browser at a time anyway.
   */
  async scrapeAll(userId: string) {
    const companyId = await this.getUserCompanyId(userId);

    const sources = await this.prisma.knowledgeSource.findMany({
      where: {
        isActive: true,
        companyId, // Only scrape sources from user's company
      },
      select: { id: true, name: true },
    });

    const startedAt = new Date().toISOString();
    if (this.scrapingCompanies.has(companyId)) {
      return { started: false, alreadyRunning: true, total: sources.length, startedAt };
    }
    if (sources.length === 0) {
      return { started: false, alreadyRunning: false, total: 0, startedAt };
    }

    this.scrapingCompanies.add(companyId);
    void (async () => {
      try {
        for (const source of sources) {
          // scrapeSource writes the outcome to the source itself, success or failure,
          // so there is nothing to collect here; a failure must not stop the rest.
          await this.scrapeSource(source.id, userId).catch(() => undefined);
        }
      } finally {
        this.scrapingCompanies.delete(companyId);
      }
    })();

    return { started: true, alreadyRunning: false, total: sources.length, startedAt };
  }

}

