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

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN)
  async createWorkflow(@Body() dto: CreateWorkflowDto, @Request() req) {
    return this.workflowsService.createWorkflow(dto, req.user.id);
  }

  @Get()
  async getWorkflows(@Query('taskType') taskType?: string, @Request() req?) {
    return this.workflowsService.getWorkflows(taskType, req?.user?.id);
  }

  @Get(':id')
  async getWorkflowById(@Param('id') id: string) {
    return this.workflowsService.getWorkflowById(id);
  }

  @Get('default/:taskType')
  async getDefaultWorkflow(@Param('taskType') taskType: string) {
    return this.workflowsService.getDefaultWorkflow(taskType);
  }

  @Put(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN)
  async updateWorkflow(@Param('id') id: string, @Body() dto: Partial<CreateWorkflowDto>) {
    return this.workflowsService.updateWorkflow(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN)
  async deleteWorkflow(@Param('id') id: string) {
    return this.workflowsService.deleteWorkflow(id);
  }
}

