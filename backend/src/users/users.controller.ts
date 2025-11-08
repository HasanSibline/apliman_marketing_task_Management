import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
  Query,
  ForbiddenException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole, UserStatus } from '../types/prisma';

@ApiTags('Users')
@Controller('users')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get all users (Admin only - filtered by company)' })
  @ApiQuery({ name: 'role', enum: UserRole, required: false })
  @ApiQuery({ name: 'status', enum: UserStatus, required: false })
  @ApiResponse({ status: 200, description: 'Users retrieved successfully' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  findAll(
    @Query('role') role?: UserRole,
    @Query('status') status?: UserStatus,
    @Request() req?,
  ) {
    // Super admins can see all users, others only see their company
    const companyId = req.user.role === UserRole.SUPER_ADMIN ? undefined : req.user.companyId;
    return this.usersService.findAll(role, status, companyId);
  }

  @Get('assignable')
  @ApiOperation({ summary: 'Get assignable users for task creation (Company users only)' })
  @ApiResponse({ status: 200, description: 'Assignable users retrieved successfully' })
  getAssignableUsers(@Request() req) {
    // Return only active users from the same company
    const companyId = req.user.role === UserRole.SUPER_ADMIN ? undefined : req.user.companyId;
    return this.usersService.findAll(undefined, UserStatus.ACTIVE, companyId);
  }

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, description: 'User profile retrieved successfully' })
  getProfile(@Request() req) {
    return this.usersService.getUserStats(req.user.id);
  }

  @Get(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get user by ID (Admin/Super Admin only)' })
  @ApiResponse({ status: 200, description: 'User retrieved successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  findOne(@Param('id') id: string) {
    return this.usersService.getUserStats(id);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update current user profile' })
  @ApiResponse({ status: 200, description: 'Profile updated successfully' })
  updateProfile(@Request() req, @Body() updateUserDto: UpdateUserDto) {
    // Users can only update their own name and position
    const allowedFields = { name: updateUserDto.name, position: updateUserDto.position };
    return this.usersService.update(req.user.id, allowedFields);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Update user by ID (Admin/Super Admin only)' })
  @ApiResponse({ status: 200, description: 'User updated successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto, @Request() req) {
    // Admins cannot update Super Admins or change roles to Super Admin
    if (req.user.role === UserRole.ADMIN) {
      if (updateUserDto.role === UserRole.SUPER_ADMIN) {
        delete updateUserDto.role;
      }
    }
    return this.usersService.update(id, updateUserDto);
  }

  @Patch(':id/status')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Update user status (Admin/Super Admin only)' })
  @ApiResponse({ status: 200, description: 'User status updated successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  updateStatus(
    @Param('id') id: string,
    @Body('status') status: UserStatus,
  ) {
    return this.usersService.updateUserStatus(id, status);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Retire user (Super Admin only)' })
  @ApiResponse({ status: 200, description: 'User retired successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }

  @Post(':id/reset-password')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Reset user password (Admin/Super Admin only)' })
  @ApiResponse({ status: 200, description: 'Password reset successful' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  async resetPassword(@Param('id') id: string, @Request() req) {
    // Admins cannot reset Super Admin passwords
    const targetUser = await this.usersService.findById(id);
    if (req.user.role === UserRole.ADMIN && targetUser.role === UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Admins cannot reset Super Admin passwords');
    }
    return this.usersService.resetPassword(id);
  }

  @Post(':id/reset-password-manual')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Manually reset user password (Admin/Super Admin only)' })
  @ApiResponse({ status: 200, description: 'Password reset successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  async resetPasswordManual(
    @Param('id') id: string,
    @Body('newPassword') newPassword: string,
    @Request() req
  ) {
    // Admins cannot reset Super Admin passwords
    const targetUser = await this.usersService.findById(id);
    if (req.user.role === UserRole.ADMIN && targetUser.role === UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Admins cannot reset Super Admin passwords');
    }
    return this.usersService.resetPasswordManual(id, newPassword);
  }
}
