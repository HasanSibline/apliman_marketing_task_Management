import {
  Controller,
  Get,
  Query,
  UseGuards,
  Request,
  Res,
  StreamableFile,
  Param,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { Response } from 'express';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { TaskPhase, UserRole } from '../types/prisma';

@ApiTags('Analytics')
@Controller('analytics')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('dashboard')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get dashboard statistics (Admin/Super Admin only)' })
  @ApiResponse({ status: 200, description: 'Dashboard statistics retrieved successfully' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  getDashboardStats() {
    return this.analyticsService.getDashboardStats();
  }

  @Get('user/:userId')
  @ApiOperation({ summary: 'Get user analytics' })
  @ApiResponse({ status: 200, description: 'User analytics retrieved successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  getUserAnalytics(@Param('userId') userId: string, @Request() req) {
    // Users can only view their own analytics unless they're admin
    const targetUserId = req.user.role === UserRole.EMPLOYEE ? req.user.id : (userId || req.user.id);
    return this.analyticsService.getUserAnalytics(targetUserId);
  }

  @Get('user/me')
  @ApiOperation({ summary: 'Get current user analytics' })
  @ApiResponse({ status: 200, description: 'User analytics retrieved successfully' })
  getMyAnalytics(@Request() req) {
    return this.analyticsService.getUserAnalytics(req.user.id);
  }

  @Get('team')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get team analytics (Admin/Super Admin only)' })
  @ApiResponse({ status: 200, description: 'Team analytics retrieved successfully' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  getTeamAnalytics() {
    return this.analyticsService.getTeamAnalytics();
  }

  @Get('tasks')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get task analytics (Admin/Super Admin only)' })
  @ApiResponse({ status: 200, description: 'Task analytics retrieved successfully' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  getTaskAnalytics() {
    return this.analyticsService.getTaskAnalytics();
  }

  @Get('export/tasks')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Export tasks to Excel (Admin/Super Admin only)' })
  @ApiQuery({ name: 'phase', enum: TaskPhase, required: false })
  @ApiQuery({ name: 'assignedToId', type: 'string', required: false })
  @ApiQuery({ name: 'dateFrom', type: 'string', required: false, description: 'ISO date string' })
  @ApiQuery({ name: 'dateTo', type: 'string', required: false, description: 'ISO date string' })
  @ApiResponse({ 
    status: 200, 
    description: 'Excel file generated successfully',
    headers: {
      'Content-Type': {
        description: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
      'Content-Disposition': {
        description: 'attachment; filename="tasks_export_YYYY-MM-DD.xlsx"',
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  async exportTasks(
    @Res({ passthrough: true }) res: Response,
    @Query('phase') phase?: TaskPhase,
    @Query('assignedToId') assignedToId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    const filters = { phase, assignedToId, dateFrom, dateTo };
    const { buffer, filename, mimeType } = await this.analyticsService.exportTasksToExcel(filters);

    res.set({
      'Content-Type': mimeType,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.length.toString(),
    });

    return new StreamableFile(buffer);
  }
}
