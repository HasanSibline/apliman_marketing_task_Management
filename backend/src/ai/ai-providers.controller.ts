import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Request,
  UseGuards,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../types/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { CompaniesService } from '../companies/companies.service';
import { AiGatewayService } from './ai-gateway.service';

/**
 * Managing a company's AI provider chain.
 *
 * Two rules run through every route here.
 *
 * A key goes in and never comes out. It is encrypted on arrival, and the only thing
 * ever said about it afterwards is whether one is set. Entries are told apart by their
 * label, which the admin chooses, rather than by any part of the secret.
 *
 * A super admin acts on a named company rather than on "the platform". There is no
 * platform-wide credential any more, so every route takes a companyId and a company
 * admin may only ever pass their own.
 */
@Controller('ai/providers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AiProvidersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly companies: CompaniesService,
    private readonly gateway: AiGatewayService,
  ) {}

  /** The company this request may act on, or a refusal. */
  private scopeFor(req: any, requested?: string): string {
    const role = req.user?.role;
    if (role === UserRole.SUPER_ADMIN) {
      if (!requested) throw new BadRequestException('Choose a company first.');
      return requested;
    }
    if (!req.user?.companyId) throw new ForbiddenException('You are not part of a company.');
    if (requested && requested !== req.user.companyId) {
      throw new ForbiddenException('You can only manage your own company.');
    }
    return req.user.companyId;
  }

  /** Never the key, and never a fragment of it. Only whether one exists. */
  private safe(row: any) {
    const { encryptedKey, ...rest } = row;
    return { ...rest, keySet: !!encryptedKey };
  }

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN)
  async list(@Query('companyId') companyId: string | undefined, @Request() req) {
    return this.gateway.healthFor(this.scopeFor(req, companyId));
  }

  @Get(':companyId')
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN)
  async listFor(@Param('companyId') companyId: string, @Request() req) {
    return this.gateway.healthFor(this.scopeFor(req, companyId));
  }

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN)
  async create(
    @Body()
    body: {
      companyId?: string;
      provider: string;
      model?: string;
      apiKey: string;
      label?: string;
      priority?: number;
      isEmergency?: boolean;
      monthlyBudget?: number | null;
    },
    @Request() req,
  ) {
    const companyId = this.scopeFor(req, body.companyId);

    if (!body.provider || !body.apiKey?.trim()) {
      throw new BadRequestException('A provider and an API key are both needed.');
    }

    const KNOWN = ['groq', 'anthropic', 'gemini', 'openai'];
    if (!KNOWN.includes(body.provider)) {
      throw new BadRequestException(`Unknown provider. Choose one of: ${KNOWN.join(', ')}.`);
    }

    // A paid entry without a ceiling is how one tenant runs up an unbounded bill.
    if (body.isEmergency && !body.monthlyBudget) {
      throw new BadRequestException('An emergency provider needs a monthly budget.');
    }

    const created = await this.prisma.aiProviderConfig.create({
      data: {
        companyId,
        provider: body.provider,
        model: body.model || null,
        encryptedKey: this.companies.encryptApiKey(body.apiKey.trim()),
        label: body.label || null,
        priority: body.priority ?? 100,
        isEmergency: !!body.isEmergency,
        monthlyBudget: body.monthlyBudget ?? null,
      },
    });

    return this.safe(created);
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN)
  async update(
    @Param('id') id: string,
    @Body()
    body: {
      model?: string | null;
      apiKey?: string;
      label?: string | null;
      priority?: number;
      enabled?: boolean;
      isEmergency?: boolean;
      monthlyBudget?: number | null;
    },
    @Request() req,
  ) {
    const existing = await this.prisma.aiProviderConfig.findUnique({
      where: { id },
      select: { companyId: true },
    });
    if (!existing) throw new BadRequestException('That provider entry no longer exists.');
    this.scopeFor(req, existing.companyId);

    const updated = await this.prisma.aiProviderConfig.update({
      where: { id },
      data: {
        ...(body.model !== undefined ? { model: body.model || null } : {}),
        ...(body.label !== undefined ? { label: body.label || null } : {}),
        ...(body.priority !== undefined ? { priority: body.priority } : {}),
        ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
        ...(body.isEmergency !== undefined ? { isEmergency: body.isEmergency } : {}),
        ...(body.monthlyBudget !== undefined ? { monthlyBudget: body.monthlyBudget } : {}),
        // A new key is a new chance: clear the health that the old one earned, or a
        // replacement for a rejected key stays retired and nobody can see why.
        ...(body.apiKey?.trim()
          ? {
              encryptedKey: this.companies.encryptApiKey(body.apiKey.trim()),
              status: 'HEALTHY',
              cooldownUntil: null,
              lastError: null,
              failureCount: 0,
            }
          : {}),
      },
    });

    return this.safe(updated);
  }

  /**
   * Put an entry back into service by hand.
   *
   * The breaker half-opens on its own, so this is only for the impatient case: an admin
   * who has just topped up a quota and does not want to wait out a cooldown set for a
   * condition that no longer holds.
   */
  @Post(':id/reset')
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN)
  async reset(@Param('id') id: string, @Request() req) {
    const existing = await this.prisma.aiProviderConfig.findUnique({
      where: { id },
      select: { companyId: true },
    });
    if (!existing) throw new BadRequestException('That provider entry no longer exists.');
    this.scopeFor(req, existing.companyId);

    const updated = await this.prisma.aiProviderConfig.update({
      where: { id },
      data: { status: 'HEALTHY', cooldownUntil: null, lastError: null, failureCount: 0 },
    });
    return this.safe(updated);
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN)
  async remove(@Param('id') id: string, @Request() req) {
    const existing = await this.prisma.aiProviderConfig.findUnique({
      where: { id },
      select: { companyId: true },
    });
    if (!existing) throw new BadRequestException('That provider entry no longer exists.');
    this.scopeFor(req, existing.companyId);

    await this.prisma.aiProviderConfig.delete({ where: { id } });
    return { deleted: true };
  }
}
