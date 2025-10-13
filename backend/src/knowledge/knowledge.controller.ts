import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../types/prisma';
import { KnowledgeService } from './knowledge.service';
import { CreateKnowledgeSourceDto, UpdateKnowledgeSourceDto } from './dto/knowledge-source.dto';

@Controller('knowledge-sources')
@UseGuards(JwtAuthGuard, RolesGuard)
export class KnowledgeController {
  private readonly logger = new Logger(KnowledgeController.name);

  constructor(private readonly knowledgeService: KnowledgeService) {}

  @Get('debug')
  async debugPrismaClient() {
    try {
      const { PrismaClient } = require('@prisma/client');
      const prisma = new PrismaClient();
      
      const hasModel = !!prisma.knowledgeSource;
      const models = Object.keys(prisma).filter(k => !k.startsWith('$') && !k.startsWith('_'));
      
      await prisma.$disconnect();
      
      return {
        hasKnowledgeSourceModel: hasModel,
        availableModels: models,
        prismaVersion: require('@prisma/client/package.json').version,
      };
    } catch (error) {
      return {
        error: error.message,
        stack: error.stack,
      };
    }
  }

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  async getAllKnowledgeSources(@Request() req) {
    try {
      return await this.knowledgeService.findAll();
    } catch (error) {
      this.logger.error('Error fetching knowledge sources:', error);
      this.logger.error('Error stack:', error.stack);
      throw new HttpException(
        'Failed to fetch knowledge sources',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('active')
  async getActiveKnowledgeSources() {
    try {
      return await this.knowledgeService.findActive();
    } catch (error) {
      this.logger.error('Error fetching active knowledge sources:', error);
      this.logger.error('Error stack:', error.stack);
      throw new HttpException(
        'Failed to fetch active knowledge sources',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  async getKnowledgeSource(@Param('id') id: string) {
    try {
      const source = await this.knowledgeService.findOne(id);
      if (!source) {
        throw new HttpException('Knowledge source not found', HttpStatus.NOT_FOUND);
      }
      return source;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`Error fetching knowledge source ${id}:`, error);
      this.logger.error('Error stack:', error.stack);
      throw new HttpException(
        'Failed to fetch knowledge source',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  async createKnowledgeSource(
    @Body() createDto: CreateKnowledgeSourceDto,
    @Request() req,
  ) {
    try {
      this.logger.log('Creating knowledge source...');
      this.logger.log('Request body:', JSON.stringify(createDto));
      this.logger.log('User from request:', JSON.stringify(req.user));
      this.logger.log('User ID:', req.user.id);
      
      const userId = req.user.id;
      const result = await this.knowledgeService.create(createDto, userId);
      
      this.logger.log('Knowledge source created successfully');
      return result;
    } catch (error) {
      this.logger.error('Error creating knowledge source:', error.message);
      this.logger.error('Error stack:', error.stack);
      this.logger.error('Error name:', error.name);
      this.logger.error('Error code:', error.code);
      
      throw new HttpException(
        {
          message: error.message || 'Failed to create knowledge source',
          errorName: error.name,
          errorCode: error.code,
          details: error.meta || {},
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Put(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  async updateKnowledgeSource(
    @Param('id') id: string,
    @Body() updateDto: UpdateKnowledgeSourceDto,
  ) {
    try {
      return await this.knowledgeService.update(id, updateDto);
    } catch (error) {
      this.logger.error(`Error updating knowledge source ${id}:`, error);
      this.logger.error('Error stack:', error.stack);
      throw new HttpException(
        error.message || 'Failed to update knowledge source',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  async deleteKnowledgeSource(@Param('id') id: string) {
    try {
      await this.knowledgeService.delete(id);
      return { message: 'Knowledge source deleted successfully' };
    } catch (error) {
      this.logger.error(`Error deleting knowledge source ${id}:`, error);
      this.logger.error('Error stack:', error.stack);
      throw new HttpException(
        'Failed to delete knowledge source',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post(':id/scrape')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  async scrapeKnowledgeSource(@Param('id') id: string) {
    try {
      return await this.knowledgeService.scrapeSource(id);
    } catch (error) {
      this.logger.error(`Error scraping knowledge source ${id}:`, error);
      this.logger.error('Error stack:', error.stack);
      throw new HttpException(
        error.message || 'Failed to scrape knowledge source',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('scrape-all')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  async scrapeAllKnowledgeSources() {
    try {
      return await this.knowledgeService.scrapeAll();
    } catch (error) {
      this.logger.error('Error scraping all knowledge sources:', error);
      this.logger.error('Error stack:', error.stack);
      throw new HttpException(
        'Failed to scrape knowledge sources',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
