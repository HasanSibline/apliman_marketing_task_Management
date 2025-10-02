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
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { CreateCommentDto } from './dto/create-comment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { TaskPhase, UserRole } from '../types/prisma';

@ApiTags('Tasks')
@Controller('tasks')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Create new task (Admin/Super Admin only)' })
  @ApiResponse({ status: 201, description: 'Task created successfully' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  create(@Body() createTaskDto: CreateTaskDto, @Request() req) {
    return this.tasksService.create(createTaskDto, req.user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Get all tasks (filtered by user role)' })
  @ApiQuery({ name: 'phase', enum: TaskPhase, required: false })
  @ApiQuery({ name: 'assignedToId', type: 'string', required: false })
  @ApiQuery({ name: 'createdById', type: 'string', required: false })
  @ApiQuery({ name: 'search', type: 'string', required: false })
  @ApiQuery({ name: 'page', type: 'number', required: false, example: 1 })
  @ApiQuery({ name: 'limit', type: 'number', required: false, example: 10 })
  @ApiResponse({ status: 200, description: 'Tasks retrieved successfully' })
  findAll(
    @Request() req,
    @Query('phase') phase?: TaskPhase,
    @Query('assignedToId') assignedToId?: string,
    @Query('createdById') createdById?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 10;
    return this.tasksService.findAll(
      req.user.id,
      req.user.role,
      phase,
      assignedToId,
      createdById,
      search,
      pageNum,
      limitNum,
    );
  }

  @Get('my-tasks')
  @ApiOperation({ summary: 'Get tasks assigned to current user' })
  @ApiQuery({ name: 'phase', enum: TaskPhase, required: false })
  @ApiQuery({ name: 'search', type: 'string', required: false })
  @ApiQuery({ name: 'page', type: 'number', required: false, example: 1 })
  @ApiQuery({ name: 'limit', type: 'number', required: false, example: 10 })
  @ApiResponse({ status: 200, description: 'User tasks retrieved successfully' })
  getMyTasks(
    @Request() req,
    @Query('phase') phase?: TaskPhase,
    @Query('search') search?: string,
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return this.tasksService.findAll(
      req.user.id,
      req.user.role,
      phase,
      req.user.id, // assignedToId
      undefined,
      search,
      page,
      limit,
    );
  }

  @Get('phases/count')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get task count by phase (Admin/Super Admin only)' })
  @ApiResponse({ status: 200, description: 'Task counts retrieved successfully' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  getTasksByPhase() {
    return this.tasksService.getTasksByPhase();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get task by ID' })
  @ApiResponse({ status: 200, description: 'Task retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Task not found' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  findOne(@Param('id') id: string, @Request() req) {
    return this.tasksService.findOne(id, req.user.id, req.user.role);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update task' })
  @ApiResponse({ status: 200, description: 'Task updated successfully' })
  @ApiResponse({ status: 404, description: 'Task not found' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  update(
    @Param('id') id: string,
    @Body() updateTaskDto: UpdateTaskDto,
    @Request() req,
  ) {
    return this.tasksService.update(id, updateTaskDto, req.user.id, req.user.role);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Delete task (Admin/Super Admin only)' })
  @ApiResponse({ status: 200, description: 'Task deleted successfully' })
  @ApiResponse({ status: 404, description: 'Task not found' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  remove(@Param('id') id: string, @Request() req) {
    return this.tasksService.remove(id, req.user.id, req.user.role);
  }

  @Post(':id/comments')
  @ApiOperation({ summary: 'Add comment to task' })
  @ApiResponse({ status: 201, description: 'Comment added successfully' })
  @ApiResponse({ status: 404, description: 'Task not found' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  addComment(
    @Param('id') taskId: string,
    @Body() createCommentDto: CreateCommentDto,
    @Request() req,
  ) {
    return this.tasksService.addComment(taskId, createCommentDto, req.user.id, req.user.role);
  }
}
