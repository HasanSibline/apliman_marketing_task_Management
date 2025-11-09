import { Controller, Get, Param, HttpCode, HttpStatus, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { CompaniesService } from './companies.service';

@ApiTags('Public Company Info')
@Controller('public/companies')
export class PublicCompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Public()
  @Get('by-slug/:slug')
  @ApiOperation({ summary: 'Get company branding by slug (public endpoint for login pages)' })
  @ApiResponse({ status: 200, description: 'Company branding information' })
  @ApiResponse({ status: 404, description: 'Company not found' })
  @HttpCode(HttpStatus.OK)
  async getCompanyBySlug(@Param('slug') slug: string) {
    const company = await this.companiesService.getCompanyBySlug(slug);
    
    if (!company) {
      throw new NotFoundException(`Company with slug "${slug}" not found`);
    }

    // Only return public branding information (no sensitive data)
    return {
      id: company.id,
      name: company.name,
      slug: company.slug,
      logo: company.logo,
      primaryColor: company.primaryColor,
      isActive: company.isActive,
      subscriptionStatus: company.subscriptionStatus,
    };
  }
}

