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
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
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
import { UserRole } from '../types/prisma';

@ApiTags('Tasks')
@Controller('tasks')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  @ApiOperation({ summary: 'Create new task' })
  @ApiResponse({ status: 201, description: 'Task created successfully' })
  create(@Body() createTaskDto: CreateTaskDto, @Request() req) {
    console.log('Task creation request received');
    console.log('User:', req.user);
    console.log('Task data:', createTaskDto);
    return this.tasksService.create(createTaskDto, req.user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Get all tasks (filtered by user role)' })
  @ApiQuery({ name: 'assignedToId', type: 'string', required: false })
  @ApiQuery({ name: 'createdById', type: 'string', required: false })
  @ApiQuery({ name: 'search', type: 'string', required: false })
  @ApiQuery({ name: 'page', type: 'number', required: false, example: 1 })
  @ApiQuery({ name: 'limit', type: 'number', required: false, example: 10 })
  @ApiResponse({ status: 200, description: 'Tasks retrieved successfully' })
  findAll(
    @Request() req,
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
      undefined, // phase - removed old enum
      assignedToId,
      createdById,
      search,
      pageNum,
      limitNum,
    );
  }

  @Get('my-tasks')
  @ApiOperation({ summary: 'Get tasks assigned to current user' })
  @ApiQuery({ name: 'search', type: 'string', required: false })
  @ApiQuery({ name: 'page', type: 'number', required: false, example: 1 })
  @ApiQuery({ name: 'limit', type: 'number', required: false, example: 10 })
  @ApiResponse({ status: 200, description: 'User tasks retrieved successfully' })
  getMyTasks(
    @Request() req,
    @Query('search') search?: string,
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return this.tasksService.findAll(
      req.user.id,
      req.user.role,
      undefined, // phase - removed old enum
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

  @Post(':id/comments/with-images')
  @UseInterceptors(FilesInterceptor('images', 10))
  @ApiOperation({ summary: 'Add comment with images to task' })
  @ApiResponse({ status: 201, description: 'Comment with images added successfully' })
  @ApiResponse({ status: 404, description: 'Task not found' })
  async addCommentWithImages(
    @Param('id') taskId: string,
    @Body('comment') comment: string,
    @Body('mentionedUserIds') mentionedUserIds: string,
    @UploadedFiles() images: Express.Multer.File[],
    @Request() req,
  ) {
    const mentionedIds = mentionedUserIds ? JSON.parse(mentionedUserIds) : [];
    return this.tasksService.addCommentWithImages(
      taskId,
      comment,
      mentionedIds,
      images || [],
      req.user.id,
      req.user.role
    );
  }

  @Post(':id/move-phase')
  @ApiOperation({ summary: 'Move task to different phase' })
  @ApiResponse({ status: 200, description: 'Task phase updated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid phase transition' })
  @ApiResponse({ status: 404, description: 'Task or phase not found' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  async moveTaskToPhase(
    @Param('id') id: string,
    @Body() body: { toPhaseId: string; comment?: string },
    @Request() req,
  ) {
    return this.tasksService.moveTaskToPhase(id, body.toPhaseId, req.user.id, body.comment);
  }

  @Post(':id/subtasks/:subtaskId/toggle')
  @ApiOperation({ summary: 'Toggle subtask completion status' })
  @ApiResponse({ status: 200, description: 'Subtask status toggled successfully' })
  @ApiResponse({ status: 404, description: 'Task or subtask not found' })
  async toggleSubtaskComplete(
    @Param('id') taskId: string,
    @Param('subtaskId') subtaskId: string,
    @Request() req,
  ) {
    return this.tasksService.toggleSubtaskComplete(taskId, subtaskId, req.user.id);
  }

  @Patch(':id/assignment')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Update task assignment (Admin/Super Admin only)' })
  @ApiResponse({ status: 200, description: 'Task assignment updated successfully' })
  @ApiResponse({ status: 404, description: 'Task not found' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  async updateTaskAssignment(
    @Param('id') id: string,
    @Body() body: { assignedToId: string },
    @Request() req,
  ) {
    return this.tasksService.updateTaskAssignment(id, body.assignedToId, req.user.id);
  }

  @Get('images/:imageId')
  @ApiOperation({ summary: 'Get comment image by ID' })
  @ApiResponse({ status: 200, description: 'Image retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Image not found' })
  async getCommentImage(@Param('imageId') imageId: string, @Request() _req) {
    const image = await this.tasksService.getCommentImage(imageId);
    
    // Return image as base64 data URL
    return {
      data: `data:${image.mimeType};base64,${image.data}`,
      mimeType: image.mimeType,
    };
  }
}
