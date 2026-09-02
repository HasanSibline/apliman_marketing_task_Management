import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { DepartmentsService } from './departments.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../types/prisma';

@ApiTags('Departments')
@ApiBearerAuth()
@Controller('departments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DepartmentsController {
  constructor(private readonly departmentsService: DepartmentsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all departments in the company with manager and user count' })
  findAll(@Request() req) {
    return this.departmentsService.findAll(req.user.companyId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get single department with manager and member details' })
  findOne(@Param('id') id: string, @Request() req) {
    return this.departmentsService.findOne(id, req.user.companyId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a department, promoting the chosen manager to MANAGER and ticket approver' })
  @Roles(UserRole.COMPANY_ADMIN, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  create(@Body() createDeptDto: { name: string; managerId?: string }, @Request() req) {
    return this.departmentsService.create(req.user.companyId, createDeptDto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update department name, manager or accepted ticket categories' })
  @Roles(UserRole.COMPANY_ADMIN, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  update(
    @Param('id') id: string,
    @Body() updateDeptDto: { name?: string; managerId?: string; ticketCategories?: string[] },
    @Request() req,
  ) {
    return this.departmentsService.update(id, req.user.companyId, updateDeptDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a department' })
  @Roles(UserRole.COMPANY_ADMIN, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  remove(@Param('id') id: string, @Request() req) {
    return this.departmentsService.remove(id, req.user.companyId);
  }

  @Post(':id/assign')
  @ApiOperation({ summary: 'Move a user into this department, or clear their department' })
  @Roles(UserRole.COMPANY_ADMIN, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  assignUser(
    @Param('id') id: string,
    @Body('userId') userId: string,
    @Request() req,
  ) {
    return this.departmentsService.assignUser(userId, id === 'null' ? null : id, req.user.companyId);
  }
}
