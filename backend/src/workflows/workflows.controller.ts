import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../types/prisma';
import { WorkflowsService } from './workflows.service';
import { CreateWorkflowDto } from './dto/create-workflow.dto';

@Controller('workflows')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WorkflowsController {
  constructor(private workflowsService: WorkflowsService) {}

  /**
   * Managers can shape workflows too.
   *
   * A workflow is how a team's own work moves, and a manager is the person who knows
   * that. Restricting it to admins meant every phase rename went through someone with
   * no view of the work, so in practice the workflow stopped matching what the team
   * actually did. Company isolation is enforced in the service, not by role, so
   * widening this changes who may configure their own company and nothing else.
   */
  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN, UserRole.MANAGER)
  async createWorkflow(@Body() dto: CreateWorkflowDto, @Request() req) {
    return this.workflowsService.createWorkflow(dto, req.user.id);
  }

  @Get()
  async getWorkflows(@Query('taskType') taskType?: string, @Request() req?) {
    return this.workflowsService.getWorkflows(taskType, req?.user?.id);
  }

  @Get(':id')
  async getWorkflowById(@Param('id') id: string, @Request() req?) {
    return this.workflowsService.getWorkflowById(id, req?.user?.id);
  }

  @Get('default/:taskType')
  async getDefaultWorkflow(@Param('taskType') taskType: string) {
    return this.workflowsService.getDefaultWorkflow(taskType);
  }

  @Put(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN, UserRole.MANAGER)
  async updateWorkflow(
    @Param('id') id: string,
    @Body() dto: Partial<CreateWorkflowDto>,
    @Request() req?,
  ) {
    return this.workflowsService.updateWorkflow(id, dto, req?.user?.id);
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN, UserRole.MANAGER)
  async deleteWorkflow(@Param('id') id: string, @Request() req?) {
    return this.workflowsService.deleteWorkflow(id, req?.user?.id);
  }
}

