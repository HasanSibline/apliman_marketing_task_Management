import { Controller, Get, Post, Body, Param, Patch, UseGuards, Request, Query, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { QuartersService } from './quarters.service';
import { OkrAutomationService } from './okr-automation.service';
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
    constructor(
        private readonly quartersService: QuartersService,
        private readonly okrAutomation: OkrAutomationService,
    ) { }

    @Get('active')
    @ApiOperation({ summary: 'Get current active quarter' })
    findActive(@Request() req) {
        return this.quartersService.findActive(req.user.companyId);
    }

    @Get()
    @ApiOperation({ summary: 'Get all quarters for company' })
    findAll(@Request() req) {
        return this.quartersService.findAll(req.user.companyId, req.user.role);
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
        return this.quartersService.findOne(id, req.user.companyId, req.user.role);
    }

    @Patch(':id')
    @Roles(UserRole.COMPANY_ADMIN, UserRole.ADMIN, UserRole.SUPER_ADMIN)
    @ApiOperation({ summary: 'Update quarter properties' })
    update(@Param('id') id: string, @Body() dto: Partial<CreateQuarterDto>, @Request() req) {
        return this.quartersService.update(id, req.user.companyId, dto);
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
    /**
     * Run the nightly maintenance now.
     *
     * Without this the automation is unverifiable until 1am, and a mistake in it
     * would fail silently overnight. Every step is idempotent, so running it on
     * demand is safe and repeatable.
     */
    @Post('automation/run')
    @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN)
    @ApiOperation({ summary: 'Run quarter and objective maintenance immediately' })
    async runAutomation() {
        const activated = await this.okrAutomation.activateDueQuarters();
        const overdue = await this.okrAutomation.flagOverdueQuarters();
        const statusChanges = await this.okrAutomation.refreshObjectiveStatuses();
        return {
            quartersActivated: activated,
            overdueQuartersFlagged: overdue,
            objectiveStatusesChanged: statusChanges,
        };
    }

    /**
     * Close a year: shut any quarter still open in it, complete the objectives that
     * landed, and carry the rest into the next year keeping the progress already
     * made. Safe to run twice, since an objective that already carried is skipped.
     */
    @Post('year/:year/close')
    @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN)
    @ApiOperation({ summary: 'Close a year and carry unmet objectives forward' })
    @ApiQuery({ name: 'createNextYearQuarters', required: false, type: Boolean })
    async closeYear(
        @Param('year', ParseIntPipe) year: number,
        @Request() req,
        @Query('createNextYearQuarters') createNext?: string,
    ) {
        return this.okrAutomation.closeYear(req.user.companyId, year, {
            createNextYearQuarters: createNext === 'true',
        });
    }

}
