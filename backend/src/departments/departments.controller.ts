import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Request } from '@nestjs/common';
import { DepartmentsService } from './departments.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../types/prisma';

@Controller('departments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DepartmentsController {
  constructor(private readonly departmentsService: DepartmentsService) {}

  @Get()
  findAll(@Request() req) {
    return this.departmentsService.findAll(req.user.companyId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req) {
    return this.departmentsService.findOne(id, req.user.companyId);
  }

  @Post()
  @Roles(UserRole.COMPANY_ADMIN, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  create(@Body() createDeptDto: { name: string; managerId?: string }, @Request() req) {
    return this.departmentsService.create(req.user.companyId, createDeptDto);
  }

  @Patch(':id')
  @Roles(UserRole.COMPANY_ADMIN, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  update(
    @Param('id') id: string,
    @Body() updateDeptDto: { name?: string; managerId?: string },
    @Request() req,
  ) {
    return this.departmentsService.update(id, req.user.companyId, updateDeptDto);
  }

  @Delete(':id')
  @Roles(UserRole.COMPANY_ADMIN, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  remove(@Param('id') id: string, @Request() req) {
    return this.departmentsService.remove(id, req.user.companyId);
  }

  @Post(':id/assign')
  @Roles(UserRole.COMPANY_ADMIN, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  assignUser(
    @Param('id') id: string,
    @Body('userId') userId: string,
    @Request() req,
  ) {
    return this.departmentsService.assignUser(userId, id === 'null' ? null : id, req.user.companyId);
  }
}
