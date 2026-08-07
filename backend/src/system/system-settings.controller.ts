import { Controller, Get, Put, Post, Body, UseGuards } from '@nestjs/common';
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
const SUPPORTED_PROVIDERS = ['anthropic', 'gemini', 'groq', 'openai'] as const;

/** Sent back instead of the real key so it is never returned to the browser. */
const MASKED_KEY = '••••••••';

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
        platformAiEnabled: false,
        platformAiProvider: 'anthropic',
        platformAiModel: null,
        platformAiKeySet: false,
        platformAiApiKey: '',
      };
    }

    return {
      maxFileSize: settings.maxFileSize,
      allowedFileTypes: settings.allowedFileTypes,
      sessionTimeout: settings.sessionTimeout,
      platformAiEnabled: settings.platformAiEnabled,
      platformAiProvider: settings.platformAiProvider,
      platformAiModel: settings.platformAiModel,
      // The key itself never leaves the server — the UI only needs to know one exists.
      platformAiKeySet: !!settings.platformAiApiKey,
      platformAiApiKey: settings.platformAiApiKey ? MASKED_KEY : '',
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
      platformAiEnabled?: boolean;
      platformAiProvider?: string;
      platformAiModel?: string | null;
      platformAiApiKey?: string;
    },
  ) {
    const {
      platformAiApiKey,
      platformAiProvider,
      platformAiEnabled,
      platformAiModel,
      ...rest
    } = data;

    const update: Record<string, unknown> = { ...rest };

    if (typeof platformAiEnabled === 'boolean') {
      update.platformAiEnabled = platformAiEnabled;
    }

    if (platformAiProvider) {
      if (!SUPPORTED_PROVIDERS.includes(platformAiProvider as (typeof SUPPORTED_PROVIDERS)[number])) {
        throw new Error(`Unsupported AI provider: ${platformAiProvider}`);
      }
      update.platformAiProvider = platformAiProvider;
    }

    if (platformAiModel !== undefined) {
      update.platformAiModel = platformAiModel?.trim() || null;
    }

    // An empty string or the mask means "leave the stored key alone"; an explicit
    // null clears it.
    if (platformAiApiKey === null) {
      update.platformAiApiKey = null;
    } else if (platformAiApiKey && platformAiApiKey !== MASKED_KEY) {
      update.platformAiApiKey = this.companiesService.encryptApiKey(platformAiApiKey.trim());
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
      platformAiEnabled: settings.platformAiEnabled,
      platformAiProvider: settings.platformAiProvider,
      platformAiModel: settings.platformAiModel,
      platformAiKeySet: !!settings.platformAiApiKey,
      platformAiApiKey: settings.platformAiApiKey ? MASKED_KEY : '',
    };
  }

  /**
   * Send one throwaway prompt through the stored platform key so a super admin can
   * confirm it works before handing the app to users.
   */
  @Post('platform-ai/test')
  @ApiOperation({ summary: 'Verify the platform AI key by making one live call' })
  async testPlatformAi(): Promise<{ ok: boolean; provider?: string; model?: string; message: string }> {
    const settings = await this.prisma.systemSettings.findUnique({
      where: { id: 'default' },
      select: { platformAiApiKey: true, platformAiProvider: true, platformAiModel: true },
    });

    if (!settings?.platformAiApiKey) {
      return { ok: false, message: 'No platform AI key is saved yet.' };
    }

    const apiKey = this.companiesService.decryptApiKey(settings.platformAiApiKey);
    if (!apiKey || apiKey.includes('[DECRYPTION_FAILED]')) {
      return {
        ok: false,
        message: 'The saved key could not be decrypted. Check that ENCRYPTION_KEY matches the one used when saving.',
      };
    }

    const aiServiceUrl = this.configService.get<string>('AI_SERVICE_URL', 'http://localhost:8001');
    const secret = this.configService.get<string>('AI_SERVICE_SECRET', '');

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${aiServiceUrl}/test-ai`,
          {
            api_key: apiKey,
            provider: settings.platformAiProvider,
            model: settings.platformAiModel ?? undefined,
            text: 'Reply with the single word: ready',
          },
          {
            headers: secret ? { Authorization: `Bearer ${secret}` } : {},
            timeout: 30000,
          },
        ),
      );

      return {
        ok: true,
        provider: response.data?.ai_provider ?? settings.platformAiProvider,
        model: response.data?.model ?? settings.platformAiModel ?? undefined,
        message: 'Key verified — the AI responded successfully.',
      };
    } catch (error: any) {
      const detail = error.response?.data?.detail;
      const message =
        (typeof detail === 'string' ? detail : detail?.message) || error.message || 'Unknown error';
      return { ok: false, provider: settings.platformAiProvider, message };
    }
  }
}
