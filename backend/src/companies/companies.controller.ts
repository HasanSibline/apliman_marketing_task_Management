import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { CompaniesService } from './companies.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { ExtendSubscriptionDto } from './dto/extend-subscription.dto';
import { ResetCompanyAdminPasswordDto } from './dto/reset-admin-password.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../types/prisma';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Companies (Super Admin Only)')
@ApiBearerAuth()
@Controller('companies')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new company with admin user' })
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.SUPER_ADMIN)
  create(@Body() createCompanyDto: CreateCompanyDto, @Req() req) {
    return this.companiesService.create(createCompanyDto, req.user.id);
  }

  @Get('platform-stats')
  @ApiOperation({ summary: 'Get platform-wide statistics' })
  @Roles(UserRole.SUPER_ADMIN)
  getPlatformStats() {
    return this.companiesService.getPlatformStats();
  }

  @Get('my-company')
  @ApiOperation({ summary: 'Get current user\'s company information' })
  @Roles(UserRole.COMPANY_ADMIN, UserRole.ADMIN, UserRole.EMPLOYEE)
  getMyCompany(@Req() req) {
    return this.companiesService.getMyCompany(req.user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Get all companies with statistics (NO actual data)' })
  @Roles(UserRole.SUPER_ADMIN)
  findAll() {
    return this.companiesService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get single company with statistics' })
  @Roles(UserRole.SUPER_ADMIN)
  findOne(@Param('id') id: string) {
    return this.companiesService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update company details' })
  @Roles(UserRole.SUPER_ADMIN)
  update(@Param('id') id: string, @Body() updateCompanyDto: UpdateCompanyDto, @Req() req) {
    return this.companiesService.update(id, updateCompanyDto, req.user.id);
  }

  @Post(':id/extend-subscription')
  @ApiOperation({ summary: 'Extend company subscription' })
  @Roles(UserRole.SUPER_ADMIN)
  extendSubscription(
    @Param('id') id: string,
    @Body() extendDto: ExtendSubscriptionDto,
    @Req() req,
  ) {
    return this.companiesService.extendSubscription(id, extendDto, req.user.id);
  }

  @Post(':id/suspend')
  @ApiOperation({ summary: 'Suspend company (disable access)' })
  @Roles(UserRole.SUPER_ADMIN)
  suspend(@Param('id') id: string, @Body('reason') reason: string, @Req() req) {
    return this.companiesService.suspend(id, reason, req.user.id);
  }

  @Post(':id/reactivate')
  @ApiOperation({ summary: 'Reactivate suspended company' })
  @Roles(UserRole.SUPER_ADMIN)
  reactivate(@Param('id') id: string, @Req() req) {
    return this.companiesService.reactivate(id, req.user.id);
  }

  @Post(':id/reset-admin-password')
  @ApiOperation({ summary: 'Reset company admin password' })
  @Roles(UserRole.SUPER_ADMIN)
  resetAdminPassword(
    @Param('id') id: string,
    @Body() resetDto: ResetCompanyAdminPasswordDto,
  ) {
    return this.companiesService.resetAdminPassword(id, resetDto.adminEmail);
  }

  @Post(':id/toggle-ai')
  @ApiOperation({ summary: 'Enable or disable AI for a company' })
  @Roles(UserRole.SUPER_ADMIN)
  toggleAI(
    @Param('id') id: string,
    @Body('enabled') enabled: boolean,
    @Req() req,
  ) {
    return this.companiesService.toggleAI(id, enabled, req.user.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a company and all its data' })
  @Roles(UserRole.SUPER_ADMIN)
  delete(@Param('id') id: string, @Req() req) {
    return this.companiesService.delete(id, req.user.id);
  }
}

