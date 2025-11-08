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
} from '@nestjs/swagger';
import { CompaniesService } from './companies.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { ExtendSubscriptionDto } from './dto/extend-subscription.dto';
import { ResetCompanyAdminPasswordDto } from './dto/reset-admin-password.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Companies (Super Admin Only)')
@ApiBearerAuth()
@Controller('companies')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN) // All endpoints require SUPER_ADMIN
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new company with admin user' })
  @HttpCode(HttpStatus.CREATED)
  create(@Body() createCompanyDto: CreateCompanyDto, @Req() req) {
    return this.companiesService.create(createCompanyDto, req.user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Get all companies with statistics (NO actual data)' })
  findAll() {
    return this.companiesService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get single company with statistics' })
  findOne(@Param('id') id: string) {
    return this.companiesService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update company details' })
  update(@Param('id') id: string, @Body() updateCompanyDto: UpdateCompanyDto, @Req() req) {
    return this.companiesService.update(id, updateCompanyDto, req.user.id);
  }

  @Post(':id/extend-subscription')
  @ApiOperation({ summary: 'Extend company subscription' })
  extendSubscription(
    @Param('id') id: string,
    @Body() extendDto: ExtendSubscriptionDto,
    @Req() req,
  ) {
    return this.companiesService.extendSubscription(id, extendDto, req.user.id);
  }

  @Post(':id/suspend')
  @ApiOperation({ summary: 'Suspend company (disable access)' })
  suspend(@Param('id') id: string, @Body('reason') reason: string, @Req() req) {
    return this.companiesService.suspend(id, reason, req.user.id);
  }

  @Post(':id/reactivate')
  @ApiOperation({ summary: 'Reactivate suspended company' })
  reactivate(@Param('id') id: string, @Req() req) {
    return this.companiesService.reactivate(id, req.user.id);
  }

  @Post(':id/reset-admin-password')
  @ApiOperation({ summary: 'Reset company admin password' })
  resetAdminPassword(
    @Param('id') id: string,
    @Body() resetDto: ResetCompanyAdminPasswordDto,
  ) {
    return this.companiesService.resetAdminPassword(id, resetDto.adminEmail);
  }
}

