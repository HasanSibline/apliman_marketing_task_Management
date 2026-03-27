import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Request } from '@nestjs/common';
import { TeamsService } from './teams.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../types/prisma';

@Controller('teams')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Get()
  findAll(@Request() req) {
    return this.teamsService.findAll(req.user.companyId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req) {
    return this.teamsService.findOne(id, req.user.companyId);
  }

  @Post()
  @Roles(UserRole.COMPANY_ADMIN, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  create(@Body('name') name: string, @Request() req) {
    return this.teamsService.create(req.user.companyId, name);
  }

  @Patch(':id')
  @Roles(UserRole.COMPANY_ADMIN, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  update(@Param('id') id: string, @Body('name') name: string, @Request() req) {
    return this.teamsService.update(id, req.user.companyId, name);
  }

  @Delete(':id')
  @Roles(UserRole.COMPANY_ADMIN, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  remove(@Param('id') id: string, @Request() req) {
    return this.teamsService.remove(id, req.user.companyId);
  }

  @Post(':id/members')
  @Roles(UserRole.COMPANY_ADMIN, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  addMember(@Param('id') id: string, @Body('userId') userId: string, @Request() req) {
    return this.teamsService.addMember(id, userId, req.user.companyId);
  }

  @Delete(':id/members/:userId')
  @Roles(UserRole.COMPANY_ADMIN, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  removeMember(@Param('id') id: string, @Param('userId') userId: string, @Request() req) {
    return this.teamsService.removeMember(id, userId, req.user.companyId);
  }
}
