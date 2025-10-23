import {
  Controller,
  Get,
  Post,
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
import { UserRole } from '../types/prisma';

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

  @Get('dashboard/me')
  @ApiOperation({ summary: 'Get current user dashboard statistics' })
  @ApiResponse({ status: 200, description: 'User dashboard statistics retrieved successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getMyDashboardStats(@Request() req) {
    try {
      if (!req.user || !req.user.id) {
        throw new Error('User not authenticated or user ID not found');
      }
      
      return await this.analyticsService.getUserAnalytics(req.user.id);
    } catch (error) {
      console.error('Error getting user dashboard stats:', error);
      throw error;
    }
  }

  @Get('user/me')
  @ApiOperation({ summary: 'Get current user analytics' })
  @ApiQuery({ name: 'timeRange', required: false, enum: ['week', 'month', 'year'], description: 'Time range for analytics' })
  @ApiResponse({ status: 200, description: 'User analytics retrieved successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getMyAnalytics(@Request() req, @Query('timeRange') timeRange?: string) {
    try {
      console.log('Request user object:', req.user);
      console.log('User ID from request:', req.user?.id);
      console.log('Time range:', timeRange);
      
      if (!req.user || !req.user.id) {
        throw new Error('User not authenticated or user ID not found');
      }
      
      return await this.analyticsService.getUserAnalytics(req.user.id, timeRange);
    } catch (error) {
      console.error('Error getting user analytics:', error);
      throw error;
    }
  }

  @Get('user/:userId')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get user analytics by ID (Admin/Super Admin only)' })
  @ApiResponse({ status: 200, description: 'User analytics retrieved successfully' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getUserAnalytics(@Param('userId') userId: string) {
    try {
      return await this.analyticsService.getUserAnalytics(userId);
    } catch (error) {
      console.error('Error getting user analytics:', error);
      throw error;
    }
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
  async getTaskAnalytics() {
    return this.analyticsService.getDashboardStats();
  }

  @Get('tasks/me')
  @ApiOperation({ summary: 'Get current user task analytics' })
  @ApiResponse({ status: 200, description: 'User task analytics retrieved successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getMyTaskAnalytics(@Request() req) {
    try {
      if (!req.user || !req.user.id) {
        throw new Error('User not authenticated or user ID not found');
      }
      
      return await this.analyticsService.getUserAnalytics(req.user.id);
    } catch (error) {
      console.error('Error getting user task analytics:', error);
      throw error;
    }
  }

  @Get('export/tasks')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Export tasks to Excel (Admin/Super Admin only)' })
  @ApiQuery({ name: 'format', enum: ['excel', 'csv'], required: false })
  @ApiResponse({ 
    status: 200, 
    description: 'File generated successfully',
    headers: {
      'Content-Type': {
        description: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet or text/csv',
      },
      'Content-Disposition': {
        description: 'attachment; filename="tasks_export_YYYY-MM-DD.xlsx"',
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  async exportTasks(
    @Res({ passthrough: true }) res: Response,
    @Query('format') format: 'excel' | 'csv' = 'excel',
  ) {
    const buffer = await this.analyticsService.exportData(format);
    const timestamp = new Date().toISOString().split('T')[0];
    const extension = format === 'excel' ? 'xlsx' : 'csv';
    const filename = `tasks_export_${timestamp}.${extension}`;
    const mimeType = format === 'excel' 
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : 'text/csv';

    res.set({
      'Content-Type': mimeType,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.length.toString(),
    });

    return new StreamableFile(buffer);
  }

  @Post('initialize')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Initialize analytics for all users (Super Admin only)' })
  @ApiResponse({ status: 200, description: 'Analytics initialized successfully' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  async initializeAnalytics() {
    // TODO: Implement analytics initialization with workflow system
    return { message: 'Analytics initialization temporarily unavailable during workflow integration' };
  }

  @Get('debug/users')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Debug: List all users (Super Admin only)' })
  @ApiResponse({ status: 200, description: 'Users retrieved successfully' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  async debugUsers() {
    // TODO: Implement debug users with workflow system
    return { message: 'Debug users temporarily unavailable during workflow integration' };
  }
}
