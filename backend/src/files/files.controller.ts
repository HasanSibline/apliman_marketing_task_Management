import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  Request,
  Res,
  StreamableFile,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
} from '@nestjs/swagger';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { createReadStream } from 'fs';
import { FilesService } from './files.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('Files')
@Controller('files')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Post('upload/:taskId')
  @UseInterceptors(FilesInterceptor('files', 10))
  @ApiOperation({ summary: 'Upload files to a task' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 201, description: 'Files uploaded successfully' })
  @ApiResponse({ status: 400, description: 'Invalid file or task' })
  @ApiResponse({ status: 404, description: 'Task not found or access denied' })
  async uploadFiles(
    @Param('taskId') taskId: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Request() req,
  ) {
    if (!files || files.length === 0) {
      throw new Error('No files provided');
    }

    return this.filesService.uploadFiles(taskId, files, req.user.id);
  }

  @Get('task/:taskId')
  @ApiOperation({ summary: 'Get all files for a task' })
  @ApiResponse({ status: 200, description: 'Files retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Task not found or access denied' })
  getTaskFiles(@Param('taskId') taskId: string, @Request() req) {
    return this.filesService.getTaskFiles(taskId, req.user.id, req.user.role);
  }

  @Get('download/:fileId')
  @ApiOperation({ summary: 'Download a file' })
  @ApiResponse({ status: 200, description: 'File downloaded successfully' })
  @ApiResponse({ status: 404, description: 'File not found or access denied' })
  async downloadFile(
    @Param('fileId') fileId: string,
    @Request() req,
    @Res({ passthrough: true }) res: Response,
  ) {
    const fileInfo = await this.filesService.downloadFile(fileId, req.user.id, req.user.role);
    
    const file = createReadStream(fileInfo.filePath);
    
    res.set({
      'Content-Type': fileInfo.mimeType,
      'Content-Disposition': `attachment; filename="${fileInfo.fileName}"`,
    });

    return new StreamableFile(file);
  }

  @Delete(':fileId')
  @ApiOperation({ summary: 'Delete a file' })
  @ApiResponse({ status: 200, description: 'File deleted successfully' })
  @ApiResponse({ status: 404, description: 'File not found' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  deleteFile(@Param('fileId') fileId: string, @Request() req) {
    return this.filesService.deleteFile(fileId, req.user.id, req.user.role);
  }

  @Get('stats')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get file statistics (Admin/Super Admin only)' })
  @ApiResponse({ status: 200, description: 'File statistics retrieved successfully' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  getFileStats() {
    return this.filesService.getFileStats();
  }
}
