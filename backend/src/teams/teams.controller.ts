import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TeamsService } from './teams.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../types/prisma';

@ApiTags('Teams')
@ApiBearerAuth()
@Controller('teams')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all teams in the company with member counts' })
  findAll(@Request() req) {
    return this.teamsService.findAll(req.user.companyId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get single team with member details' })
  findOne(@Param('id') id: string, @Request() req) {
    return this.teamsService.findOne(id, req.user.companyId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new team' })
  @Roles(UserRole.COMPANY_ADMIN, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  create(@Body('name') name: string, @Request() req) {
    return this.teamsService.create(req.user.companyId, name);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Rename a team' })
  @Roles(UserRole.COMPANY_ADMIN, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  update(@Param('id') id: string, @Body('name') name: string, @Request() req) {
    return this.teamsService.update(id, req.user.companyId, name);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a team' })
  @Roles(UserRole.COMPANY_ADMIN, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  remove(@Param('id') id: string, @Request() req) {
    return this.teamsService.remove(id, req.user.companyId);
  }

  @Post(':id/members')
  @ApiOperation({ summary: 'Add a user to the team' })
  @Roles(UserRole.COMPANY_ADMIN, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  addMember(@Param('id') id: string, @Body('userId') userId: string, @Request() req) {
    return this.teamsService.addMember(id, userId, req.user.companyId);
  }

  @Delete(':id/members/:userId')
  @ApiOperation({ summary: 'Remove a user from the team' })
  @Roles(UserRole.COMPANY_ADMIN, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  removeMember(@Param('id') id: string, @Param('userId') userId: string, @Request() req) {
    return this.teamsService.removeMember(id, userId, req.user.companyId);
  }
}
