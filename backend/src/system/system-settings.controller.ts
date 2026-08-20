import { Controller, Get, Put, Post, Body, UseGuards, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../types/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { CompaniesService } from '../companies/companies.service';

/** Providers a super admin may pick for the platform-wide AI key. */

/** Sent back instead of the real key so it is never returned to the browser. */

@ApiTags('System Settings')
@ApiBearerAuth()
@Controller('system/settings')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
export class SystemSettingsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly companiesService: CompaniesService,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get system settings' })
  async getSettings() {
    const settings = await this.prisma.systemSettings.findUnique({
      where: { id: 'default' },
    });

    if (!settings) {
      // Return defaults if not found
      return {
        maxFileSize: 5242880, // 5MB
        allowedFileTypes:
          'image/jpeg,image/png,image/webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        sessionTimeout: 480, // 8 hours
      };
    }

    return {
      maxFileSize: settings.maxFileSize,
      allowedFileTypes: settings.allowedFileTypes,
      sessionTimeout: settings.sessionTimeout,
    };
  }

  @Put()
  @ApiOperation({ summary: 'Update system settings' })
  async updateSettings(
    @Body()
    data: {
      maxFileSize?: number;
      allowedFileTypes?: string;
      sessionTimeout?: number;
    },
  ) {
    const {
      maxFileSize,
      allowedFileTypes,
      sessionTimeout,
    } = data;

    // Build the update from an explicit allowlist rather than spreading the request
    // body. The settings page round-trips the whole GET response back on save, which
    // includes read-only fields, and spreading those into Prisma fails the query with
    // an unknown-argument error.
    const update: Record<string, unknown> = {};

    if (typeof maxFileSize === 'number' && Number.isFinite(maxFileSize)) {
      update.maxFileSize = Math.round(maxFileSize);
    }
    if (typeof allowedFileTypes === 'string') {
      update.allowedFileTypes = allowedFileTypes;
    }
    if (typeof sessionTimeout === 'number' && Number.isFinite(sessionTimeout)) {
      update.sessionTimeout = Math.round(sessionTimeout);
    }

    const settings = await this.prisma.systemSettings.upsert({
      where: { id: 'default' },
      update,
      create: { id: 'default', ...update },
    });

    return {
      maxFileSize: settings.maxFileSize,
      allowedFileTypes: settings.allowedFileTypes,
      sessionTimeout: settings.sessionTimeout,
    };
  }

}
