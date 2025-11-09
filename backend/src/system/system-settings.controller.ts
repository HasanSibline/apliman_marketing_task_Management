import { Controller, Get, Put, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../types/prisma';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('System Settings')
@ApiBearerAuth()
@Controller('system/settings')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
export class SystemSettingsController {
  constructor(private readonly prisma: PrismaService) {}

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
        allowedFileTypes: 'image/jpeg,image/png,image/webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document',
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
    @Body() data: {
      maxFileSize?: number;
      allowedFileTypes?: string;
      sessionTimeout?: number;
    },
  ) {
    const settings = await this.prisma.systemSettings.upsert({
      where: { id: 'default' },
      update: data,
      create: {
        id: 'default',
        ...data,
      },
    });

    return {
      maxFileSize: settings.maxFileSize,
      allowedFileTypes: settings.allowedFileTypes,
      sessionTimeout: settings.sessionTimeout,
    };
  }
}

