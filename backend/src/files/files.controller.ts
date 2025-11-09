import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  UploadedFile,
  Request,
  Res,
  StreamableFile,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
} from '@nestjs/swagger';
import { FilesInterceptor, FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { createReadStream, existsSync } from 'fs';
import { join } from 'path';
import { FilesService } from './files.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../types/prisma';

@ApiTags('Files')
@Controller('files')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload a single file (logo, avatar, etc.)' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 201, description: 'File uploaded successfully' })
  @ApiResponse({ status: 400, description: 'Invalid file' })
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Request() req,
  ) {
    if (!file) {
      throw new Error('No file provided');
    }

    return this.filesService.uploadSingleFile(file, req.user.id);
  }

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

// Public Files Controller (No Authentication Required)
@ApiTags('Public Files')
@Controller('files/public')
export class PublicFilesController {
  @Get(':filename')
  @ApiOperation({ summary: 'Serve public uploaded files (logos, avatars)' })
  @ApiResponse({ status: 200, description: 'File served successfully' })
  @ApiResponse({ status: 404, description: 'File not found' })
  async serveFile(
    @Param('filename') filename: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Security: Only allow files from temp directory (where single uploads go)
    const uploadPath = process.env.UPLOAD_PATH || './uploads';
    const filePath = join(uploadPath, 'temp', filename);

    if (!existsSync(filePath)) {
      throw new NotFoundException('File not found');
    }

    const file = createReadStream(filePath);
    
    // Determine content type from extension
    const ext = filename.split('.').pop()?.toLowerCase();
    const mimeTypes: Record<string, string> = {
      'webp': 'image/webp',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'pdf': 'application/pdf',
    };

    res.set({
      'Content-Type': mimeTypes[ext || ''] || 'application/octet-stream',
      'Cache-Control': 'public, max-age=31536000', // Cache for 1 year
    });

    return new StreamableFile(file);
  }
}
