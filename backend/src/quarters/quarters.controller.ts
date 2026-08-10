import { Controller, Get, Post, Body, Param, Patch, Delete, UseGuards, Request, Query, ParseIntPipe } from '@nestjs/common';
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
        return this.quartersService.findActive(req.user.companyId, req.user.role);
    }

    @Get()
    @ApiOperation({ summary: 'Get all quarters for company' })
    @ApiQuery({ name: 'selectable', required: false, type: Boolean, description: 'Only quarters that can still receive work' })
    findAll(@Request() req, @Query('selectable') selectable?: string) {
        return this.quartersService.findAll(req.user.companyId, req.user.role, selectable === 'true');
    }

    @Get('yearly')
    @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN)
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

    @Delete(':id')
    @Roles(UserRole.COMPANY_ADMIN, UserRole.ADMIN, UserRole.SUPER_ADMIN)
    @ApiOperation({ summary: 'Remove an upcoming quarter that holds nothing' })
    remove(@Param('id') id: string, @Request() req) {
        return this.quartersService.remove(id, req.user.companyId);
    }

    @Get(':id/analytics')
    @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN)
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

    @Post('next')
    @Roles(UserRole.COMPANY_ADMIN, UserRole.ADMIN, UserRole.SUPER_ADMIN)
    @ApiOperation({ summary: 'Open the quarter that follows the last one, dates derived' })
    createNext(@Request() req) {
        return this.quartersService.createNextQuarter(req.user.companyId);
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
        const readyToStart = await this.okrAutomation.flagQuartersReadyToStart();
        const overdue = await this.okrAutomation.flagOverdueQuarters();
        const statusChanges = await this.okrAutomation.refreshObjectiveStatuses();
        return {
            quartersReadyToStart: readyToStart,
            overdueQuartersFlagged: overdue,
            objectiveStatusesChanged: statusChanges,
        };
    }

    /**
     * Close a year: shut any quarter still open in it, complete the objectives that
     * landed, and carry the rest into the next year keeping the progress already
     * made. Safe to run twice, since an objective that already carried is skipped.
     */
    @Get('year/:year/report')
    @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN)
    @ApiOperation({ summary: 'Full year report: outcomes, shortfalls and chart data' })
    async yearReport(@Param('year', ParseIntPipe) year: number, @Request() req) {
        return this.okrAutomation.getYearReport(req.user.companyId, year);
    }

    @Get('year/:year/open-tasks')
    @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN)
    @ApiOperation({ summary: 'Unfinished work still in a year, for the closing dialog' })
    async openTasksForYear(@Param('year', ParseIntPipe) year: number, @Request() req) {
        return this.okrAutomation.getOpenTasksForYear(req.user.companyId, year);
    }

    @Post('year/:year/close')
    @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN)
    @ApiOperation({ summary: 'Close a year, decide its unfinished work, and hand over to the next' })
    async closeYear(
        @Param('year', ParseIntPipe) year: number,
        @Request() req,
        @Body() body: { rolloverTaskIds?: string[]; leaveUnscheduled?: boolean } = {},
    ) {
        return this.okrAutomation.closeYear(req.user.companyId, year, {
            rolloverTaskIds: body?.rolloverTaskIds ?? [],
            leaveUnscheduled: body?.leaveUnscheduled === true,
        });
    }

}
