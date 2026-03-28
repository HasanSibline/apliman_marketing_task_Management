import { Controller, Get, Post, Body, Param, UseGuards, Request, Query, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { QuartersService } from './quarters.service';
import { CreateQuarterDto } from './dto/create-quarter.dto';
import { CloseQuarterDto } from './dto/close-quarter.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../types/prisma';

@ApiTags('Quarters')
@Controller('quarters')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class QuartersController {
    constructor(private readonly quartersService: QuartersService) { }

    @Get('active')
    @ApiOperation({ summary: 'Get current active quarter' })
    findActive(@Request() req) {
        return this.quartersService.findActive(req.user.companyId);
    }

    @Get()
    @ApiOperation({ summary: 'List quarters for the current company' })
    findAll(@Request() req) {
        return this.quartersService.findAll(req.user.companyId);
    }

    @Get('yearly')
    @ApiOperation({ summary: 'Yearly analytics across all quarters' })
    @ApiQuery({ name: 'year', required: false, type: Number })
    yearly(@Request() req, @Query('year') year?: string) {
        const y = year ? parseInt(year) : new Date().getFullYear();
        return this.quartersService.getYearlyAnalytics(y, req.user.companyId);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get quarter detail with tasks and objectives' })
    findOne(@Param('id') id: string, @Request() req) {
        return this.quartersService.findOne(id, req.user.companyId);
    }

    @Get(':id/analytics')
    @ApiOperation({ summary: 'Get analytics for a specific quarter' })
    analytics(@Param('id') id: string, @Request() req) {
        return this.quartersService.getAnalytics(id, req.user.companyId);
    }

    @Post()
    @Roles(UserRole.COMPANY_ADMIN, UserRole.ADMIN, UserRole.SUPER_ADMIN)
    @ApiOperation({ summary: 'Create a new quarter' })
    create(@Body() dto: CreateQuarterDto, @Request() req) {
        return this.quartersService.create(dto, req.user.companyId);
    }

    @Post(':id/close')
    @Roles(UserRole.COMPANY_ADMIN, UserRole.ADMIN, UserRole.SUPER_ADMIN)
    @ApiOperation({ summary: 'Close a quarter and roll over selected tasks' })
    close(@Param('id') id: string, @Body() dto: CloseQuarterDto, @Request() req) {
        return this.quartersService.close(id, req.user.companyId, dto);
    }
}
