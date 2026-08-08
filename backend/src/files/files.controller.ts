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
  BadRequestException,
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
import { join, basename, resolve, sep } from 'path';
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

  @Post('upload/:folder?')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload a single file (logo, avatar, etc.) to a specific folder' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 201, description: 'File uploaded successfully' })
  @ApiResponse({ status: 400, description: 'Invalid file or folder' })
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Param('folder') folder: string = 'temp',
    @Request() req,
  ) {
    if (!file) {
      throw new Error('No file provided');
    }

    // Security: Validate folder if provided
    const safeFolders = ['temp', 'branding', 'avatars'];
    if (folder && !safeFolders.includes(folder)) {
      throw new BadRequestException('Invalid destination folder');
    }
    
    // Roles check for branding/restricted folders
    if (folder === 'branding' && !['SUPER_ADMIN', 'COMPANY_ADMIN', 'ADMIN'].includes(req.user.role)) {
      throw new BadRequestException('Only admins can upload branding assets');
    }

    return this.filesService.uploadSingleFile(file, req.user.id, folder);
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
    
    // Handle Cloudinary/external URL by redirecting
    if (fileInfo.filePath.startsWith('http')) {
      return res.redirect(fileInfo.filePath);
    }

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
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get file statistics (Admin/Super Admin only)' })
  @ApiResponse({ status: 200, description: 'File statistics retrieved successfully' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  getFileStats() {
    return this.filesService.getFileStats();
  }

  // --- Ticket Attachments ---

  @Post('ticket/:ticketId')
  @UseInterceptors(FilesInterceptor('files', 10))
  @ApiOperation({ summary: 'Upload files to a ticket' })
  @ApiConsumes('multipart/form-data')
  async uploadTicketFiles(
    @Param('ticketId') ticketId: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Request() req,
  ) {
    if (!files || files.length === 0) throw new BadRequestException('No files provided');
    return this.filesService.uploadTicketFiles(ticketId, files, req.user.id);
  }

  @Get('ticket/:ticketId')
  @ApiOperation({ summary: 'Get all files for a ticket' })
  async getTicketFiles(@Param('ticketId') ticketId: string, @Request() req) {
    return this.filesService.getTicketFiles(ticketId, req.user.id, req.user.role);
  }

  @Get('ticket-download/:fileId')
  @ApiOperation({ summary: 'Download a ticket attachment' })
  async downloadTicketFile(
    @Param('fileId') fileId: string,
    @Request() req,
    @Res({ passthrough: true }) res: Response,
  ) {
    const fileInfo = await this.filesService.downloadTicketFile(fileId, req.user.id, req.user.role);
    
    // Handle Cloudinary/external URL by redirecting
    if (fileInfo.filePath.startsWith('http')) {
      return res.redirect(fileInfo.filePath);
    }

    const file = createReadStream(fileInfo.filePath);
    res.set({
      'Content-Type': fileInfo.mimeType,
      'Content-Disposition': `attachment; filename="${fileInfo.fileName}"`,
    });
    return new StreamableFile(file);
  }

  @Delete('ticket-delete/:fileId')
  @ApiOperation({ summary: 'Delete a ticket attachment' })
  async deleteTicketFile(@Param('fileId') fileId: string, @Request() req) {
    return this.filesService.deleteTicketFile(fileId, req.user.id, req.user.role);
  }

  // --- User Avatars ---

  @Post('avatar')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload user avatar' })
  @ApiConsumes('multipart/form-data')
  async uploadAvatar(
    @UploadedFile() file: Express.Multer.File,
    @Request() req,
  ) {
    if (!file) throw new BadRequestException('No file provided');
    
    // Upload the file to avatars folder
    const result = await this.filesService.uploadSingleFile(file, req.user.id, 'avatars');
    
    // The URL should be accessible via the PublicFilesController
    const avatarUrl = result.url; // Already correctly formatted by the service
    
    // Inject and call the UsersService update or use the one from filesService
    return this.filesService.updateUserAvatar(req.user.id, avatarUrl);
  }
}

// Public Files Controller (No Authentication Required)
@ApiTags('Public Files')
@Controller('files/public')
export class PublicFilesController {
  @Get(':folder/:filename')
  @ApiOperation({ summary: 'Serve public uploaded files (logos, avatars)' })
  @ApiResponse({ status: 200, description: 'File served successfully' })
  @ApiResponse({ status: 404, description: 'File not found' })
  async serveFile(
    @Param('folder') folder: string,
    @Param('filename') filename: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    // This endpoint is unauthenticated by design: logos render on the login page
    // before anyone has a token, and avatars and inline chat images are loaded by
    // <img> tags, which cannot send an Authorization header.
    //
    // Task and ticket attachments are deliberately NOT here. They are company data,
    // and both already have authenticated download routes that check ownership
    // (/files/download/:fileId and /files/ticket-download/:fileId). Serving them
    // here as well made every attachment readable by anyone holding the URL.
    const safeFolders = ['temp', 'branding', 'avatars'];
    if (!safeFolders.includes(folder)) {
      throw new NotFoundException('Invalid folder');
    }

    // `filename` is attacker-controlled and Express URL-decodes route params, so a
    // value like `..%2f..%2f.env` arrives here as `../../.env`. Reduce it to a bare
    // name, then confirm the resolved path really is inside the folder we intended.
    const safeName = basename(filename);
    if (!safeName || safeName === '.' || safeName === '..') {
      throw new NotFoundException('File not found');
    }

    const uploadPath = process.env.UPLOAD_PATH || './uploads';
    const folderRoot = resolve(uploadPath, folder);
    const filePath = resolve(folderRoot, safeName);

    if (filePath !== join(folderRoot, safeName) || !filePath.startsWith(folderRoot + sep)) {
      throw new NotFoundException('File not found');
    }

    if (!existsSync(filePath)) {
      throw new NotFoundException('File not found');
    }

    const file = createReadStream(filePath);
    
    // Determine content type from extension
    const ext = safeName.split('.').pop()?.toLowerCase();
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

  @Get(':filename')
  @ApiOperation({ summary: 'Legacy support for single filename requests (defaults to temp)' })
  async serveFileLegacy(
    @Param('filename') filename: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.serveFile('temp', filename, res);
  }
}
