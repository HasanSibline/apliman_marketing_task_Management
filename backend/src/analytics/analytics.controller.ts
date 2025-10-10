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
  @ApiOperation({ summary: 'Get dashboard statistics' })
  @ApiResponse({ status: 200, description: 'Dashboard statistics retrieved successfully' })
  async getDashboardStats(@Request() req) {
    return this.analyticsService.getDashboardStats(req.user?.id);
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
  @ApiResponse({ status: 200, description: 'User analytics retrieved successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getMyAnalytics(@Request() req) {
    try {
      console.log('Request user object:', req.user);
      console.log('User ID from request:', req.user?.id);
      
      if (!req.user || !req.user.id) {
        throw new Error('User not authenticated or user ID not found');
      }
      
      return await this.analyticsService.getUserAnalytics(req.user.id);
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

  @Get('workflows')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get workflow analytics (Admin/Super Admin only)' })
  @ApiResponse({ status: 200, description: 'Workflow analytics retrieved successfully' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  getWorkflowAnalytics() {
    return this.analyticsService.getWorkflowAnalytics();
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

  @Get('export')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Export analytics to Excel/CSV (Admin/Super Admin only)' })
  @ApiQuery({ name: 'format', enum: ['xlsx', 'csv'], required: false })
  @ApiResponse({ 
    status: 200, 
    description: 'File generated successfully',
    headers: {
      'Content-Type': {
        description: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet or text/csv',
      },
      'Content-Disposition': {
        description: 'attachment; filename="analytics_export_YYYY-MM-DD.xlsx"',
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  async exportAnalytics(
    @Res({ passthrough: true }) res: Response,
    @Query('format') format: 'xlsx' | 'csv' = 'xlsx',
  ) {
    const buffer = await this.analyticsService.exportAnalytics(format);
    const timestamp = new Date().toISOString().split('T')[0];
    const extension = format;
    const filename = `analytics_export_${timestamp}.${extension}`;
    const mimeType = format === 'xlsx' 
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
