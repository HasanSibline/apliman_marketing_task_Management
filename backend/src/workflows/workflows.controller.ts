import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../types/prisma';
import { WorkflowsService } from './workflows.service';
import { CreateWorkflowDto } from './dto/create-workflow.dto';

@ApiTags('Workflows')
@ApiBearerAuth()
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
  @ApiOperation({ summary: 'Create a workflow with phases, unsetting any other default for the task type' })
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN, UserRole.MANAGER)
  async createWorkflow(@Body() dto: CreateWorkflowDto, @Request() req) {
    return this.workflowsService.createWorkflow(dto, req.user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Get workflows visible to the current user, optionally filtered by task type' })
  async getWorkflows(@Query('taskType') taskType?: string, @Request() req?) {
    return this.workflowsService.getWorkflows(taskType, req?.user?.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a workflow with its phases, transitions and task counts' })
  async getWorkflowById(@Param('id') id: string, @Request() req?) {
    return this.workflowsService.getWorkflowById(id, req?.user?.id);
  }

  @Get('default/:taskType')
  @ApiOperation({ summary: 'Get the default active workflow for a task type' })
  async getDefaultWorkflow(@Param('taskType') taskType: string) {
    return this.workflowsService.getDefaultWorkflow(taskType);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a workflow, reconciling its phases before applying name and color changes' })
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN, UserRole.MANAGER)
  async updateWorkflow(
    @Param('id') id: string,
    @Body() dto: Partial<CreateWorkflowDto>,
    @Request() req?,
  ) {
    return this.workflowsService.updateWorkflow(id, dto, req?.user?.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a workflow, refusing if any task still uses it' })
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN, UserRole.MANAGER)
  async deleteWorkflow(@Param('id') id: string, @Request() req?) {
    return this.workflowsService.deleteWorkflow(id, req?.user?.id);
  }
}

