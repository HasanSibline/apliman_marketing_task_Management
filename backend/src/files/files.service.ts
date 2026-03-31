import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import sharp from 'sharp';
import * as fs from 'fs/promises';
import * as path from 'path';
import { existsSync } from 'fs';
import { v2 as cloudinary } from 'cloudinary';

@Injectable()
export class FilesService {
  private isCloudinaryConfigured = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    const cloudName = this.configService.get<string>('CLOUDINARY_CLOUD_NAME');
    const apiKey = this.configService.get<string>('CLOUDINARY_API_KEY');
    const apiSecret = this.configService.get<string>('CLOUDINARY_API_SECRET');

    if (cloudName && apiKey && apiSecret) {
      cloudinary.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret,
      });
      this.isCloudinaryConfigured = true;
      console.log('✅ Cloudinary storage initialized');
    } else {
      console.log('⚠️ Cloudinary not configured, falling back to local ephemeral storage');
    }
  }

  async uploadSingleFile(file: Express.Multer.File, userId: string, folder: string = 'temp') {
    try {
      let processedFile = file;
      
      // Compress image if it's an image
      if (file.mimetype.startsWith('image/')) {
        processedFile = await this.compressImage(file);
      }

      // --- Cloudinary Upload Path ---
      if (this.isCloudinaryConfigured) {
        try {
          const uploadResult = await cloudinary.uploader.upload(processedFile.path, {
            folder: `apliman/${folder}`,
            resource_type: 'auto',
            transformation: folder === 'avatars' || folder === 'branding' 
              ? [{ width: 800, crop: "limit", quality: "auto", fetch_format: "auto" }]
              : []
          });

          // Delete the temporary local file
          if (existsSync(processedFile.path)) {
            await fs.unlink(processedFile.path).catch(console.error);
          }

          return {
            url: uploadResult.secure_url,
            fileName: uploadResult.public_id,
            size: uploadResult.bytes,
            mimeType: file.mimetype,
          };
        } catch (cloudinaryError) {
          console.error('Cloudinary upload fallback error:', cloudinaryError);
          // Continue to local storage if Cloudinary fails
        }
      }

      const fileName = path.basename(processedFile.path);
      // Get the subfolder (e.g., 'temp', 'branding') from the file path
      const subfolder = path.basename(path.dirname(processedFile.path));
      
      // Construct the file URL (e.g., /api/files/public/branding/logo.webp)
      const fileUrl = `/api/files/public/${subfolder}/${fileName}`;
      
      return {
        url: fileUrl,
        fileName: fileName, // Return the unique filename used on disk
        size: processedFile.size,
        mimeType: file.mimetype,
      };
    } catch (error) {
      console.error(`Error processing file ${file.originalname}:`, error);
      // Clean up the file if processing failed
      if (existsSync(file.path)) {
        await fs.unlink(file.path).catch(console.error);
      }
      throw new BadRequestException(`Failed to process file: ${file.originalname}`);
    }
  }

  async uploadFiles(taskId: string, files: Express.Multer.File[], userId: string) {
    // Verify task exists and user has access
    const task = await this.prisma.task.findFirst({
      where: {
        id: taskId,
        OR: [
          { assignedToId: userId },
          { createdById: userId },
        ],
      },
    });

    if (!task) {
      throw new NotFoundException('Task not found or access denied');
    }

    const uploadedFiles = [];

    for (const file of files) {
      try {
        let processedFile = file;
        
        // Compress file based on type
        if (file.mimetype.startsWith('image/')) {
          processedFile = await this.compressImage(file);
        } else if (file.mimetype === 'application/pdf') {
          // For PDF compression, we'll implement a basic size check
          // In production, you might want to use pdf-lib or similar
          processedFile = await this.processPDF(file);
        }

        let finalUrl = `/api/files/public/${path.basename(path.dirname(processedFile.path))}/${path.basename(processedFile.path)}`;

        // --- Cloudinary Upload Path ---
        if (this.isCloudinaryConfigured) {
          try {
            const uploadResult = await cloudinary.uploader.upload(processedFile.path, {
              folder: `apliman/tasks/${taskId}`,
              resource_type: 'auto'
            });
            finalUrl = uploadResult.secure_url;
            
            // Delete temp file
            if (existsSync(processedFile.path)) {
              await fs.unlink(processedFile.path).catch(console.error);
            }
          } catch (err) {
            console.error('Cloudinary task file upload failed:', err);
          }
        }

        // Save file record to database
        const fileRecord = await this.prisma.taskFile.create({
          data: {
            taskId,
            fileName: file.originalname,
            filePath: finalUrl, // Storing URL instead of disk path when using Cloudinary
            fileType: path.extname(file.originalname),
            fileSize: processedFile.size,
            mimeType: file.mimetype,
          },
        });

        uploadedFiles.push(fileRecord);
      } catch (error) {
        console.error(`Error processing file ${file.originalname}:`, error);
        // Clean up the file if processing failed
        if (existsSync(file.path)) {
          await fs.unlink(file.path).catch(console.error);
        }
        throw new BadRequestException(`Failed to process file: ${file.originalname}`);
      }
    }

    return uploadedFiles;
  }

  async getTaskFiles(taskId: string, userId: string, userRole: string) {
    // Verify task access
    const whereCondition: any = { id: taskId };
    
    if (userRole === 'EMPLOYEE') {
      whereCondition.OR = [
        { assignedToId: userId },
        { createdById: userId },
      ];
    }

    const task = await this.prisma.task.findFirst({
      where: whereCondition,
      include: {
        files: {
          orderBy: { uploadedAt: 'desc' },
        },
      },
    });

    if (!task) {
      throw new NotFoundException('Task not found or access denied');
    }

    return task.files;
  }

  async downloadFile(fileId: string, userId: string, userRole: string) {
    const file = await this.prisma.taskFile.findUnique({
      where: { id: fileId },
      include: {
        task: {
          select: {
            id: true,
            assignedToId: true,
            createdById: true,
          },
        },
      },
    });

    if (!file) {
      throw new NotFoundException('File not found');
    }

    // Check access permissions
    if (userRole === 'EMPLOYEE') {
      const hasAccess = file.task.assignedToId === userId || file.task.createdById === userId;
      if (!hasAccess) {
        throw new NotFoundException('File not found or access denied');
      }
    }

    // Check if cloud file
    if (file.filePath.startsWith('http')) {
      return {
        filePath: file.filePath,
        fileName: file.fileName,
        mimeType: file.mimeType,
      };
    }

    // Check if file exists on disk
    if (!existsSync(file.filePath)) {
      throw new NotFoundException('File not found on disk');
    }

    return {
      filePath: file.filePath,
      fileName: file.fileName,
      mimeType: file.mimeType,
    };
  }

  async deleteFile(fileId: string, userId: string, userRole: string) {
    const file = await this.prisma.taskFile.findUnique({
      where: { id: fileId },
      include: {
        task: {
          select: {
            id: true,
            assignedToId: true,
            createdById: true,
          },
        },
      },
    });

    if (!file) {
      throw new NotFoundException('File not found');
    }

    // Check permissions - only task creator or admins can delete files
    if (userRole === 'EMPLOYEE' && file.task.createdById !== userId) {
      throw new BadRequestException('Only task creators can delete files');
    }

    // Delete from Cloudinary if it's a cloud file
    if (file.filePath.startsWith('http')) {
      if (this.isCloudinaryConfigured) {
        try {
          const publicId = file.filePath.split('/').pop().split('.')[0];
          await cloudinary.uploader.destroy(publicId);
        } catch (err) {
          console.error('Cloudinary destroy failed:', err);
        }
      }
    } else if (existsSync(file.filePath)) {
      await fs.unlink(file.filePath).catch(console.error);
    }

    // Delete file record from database
    await this.prisma.taskFile.delete({
      where: { id: fileId },
    });

    return { message: 'File deleted successfully' };
  }

  private async compressImage(file: Express.Multer.File): Promise<Express.Multer.File> {
    try {
      const dir = path.dirname(file.path);
      const ext = path.extname(file.path);
      const base = path.basename(file.path, ext);
      const outputPath = path.join(dir, `${base}_compressed.webp`);
      
      console.log(`Compressing image: ${file.path} -> ${outputPath}`);
      
      await sharp(file.path)
        .resize(1920, 1080, { 
          fit: 'inside',
          withoutEnlargement: true 
        })
        .webp({ 
          quality: 85,
          effort: 4 
        })
        .toFile(outputPath);

      // Get compressed file stats
      const stats = await fs.stat(outputPath);
      
      // Remove original file
      await fs.unlink(file.path);

      // Update file object
      return {
        ...file,
        path: outputPath,
        size: stats.size,
        filename: path.basename(outputPath),
        mimetype: 'image/webp'
      };
    } catch (error) {
      console.error('Image compression error:', error);
      // Return original file if compression fails
      return file;
    }
  }

  private async processPDF(file: Express.Multer.File): Promise<Express.Multer.File> {
    // For now, just return the original PDF
    // In production, you might want to implement PDF compression using pdf-lib
    const maxPdfSize = 10 * 1024 * 1024; // 10MB
    
    if (file.size > maxPdfSize) {
      throw new BadRequestException('PDF file is too large. Maximum size is 10MB.');
    }

    return file;
  }

  async getFileStats() {
    const [stats, ticketStats] = await Promise.all([
      this.prisma.taskFile.aggregate({
        _count: { id: true },
        _sum: { fileSize: true },
      }),
      this.prisma.ticketAttachment.aggregate({
        _count: { id: true },
        _sum: { fileSize: true },
      })
    ]);

    const filesByType = await this.prisma.taskFile.groupBy({
      by: ['mimeType'],
      _count: {
        id: true,
      },
    });

    return {
      totalFiles: (stats._count.id || 0) + (ticketStats._count.id || 0),
      totalSize: (stats._sum.fileSize || 0) + (ticketStats._sum.fileSize || 0),
      filesByType: filesByType.map(item => ({
        mimeType: item.mimeType,
        count: item._count.id,
      })),
    };
  }

  // --- Ticket Attachments ---

  async uploadTicketFiles(ticketId: string, files: Express.Multer.File[], userId: string) {
    // Verify ticket exists
    const ticket = await this.prisma.ticket.findFirst({
      where: { id: ticketId },
    });

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    const uploadedFiles = [];

    for (const file of files) {
      try {
        let processedFile = file;
        if (file.mimetype.startsWith('image/')) {
          processedFile = await this.compressImage(file);
        }

        const fileRecord = await this.prisma.ticketAttachment.create({
          data: {
            ticketId,
            fileName: file.originalname,
            filePath: processedFile.path,
            fileType: path.extname(file.originalname),
            fileSize: processedFile.size,
            mimeType: file.mimetype,
          },
        });

        uploadedFiles.push(fileRecord);
      } catch (error) {
        if (existsSync(file.path)) await fs.unlink(file.path).catch(console.error);
        throw new BadRequestException(`Failed to process file: ${file.originalname}`);
      }
    }

    return uploadedFiles;
  }

  async getTicketFiles(ticketId: string, userId: string, userRole: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      include: {
        attachments: { orderBy: { uploadedAt: 'desc' } },
      },
    });

    if (!ticket) throw new NotFoundException('Ticket not found');
    
    // Privacy check: only involved or admin
    const isAdmin = ['COMPANY_ADMIN', 'SUPER_ADMIN'].includes(userRole);
    const isInvolved = ticket.requesterId === userId || 
                       ticket.requesterManagerId === userId || 
                       ticket.receiverManagerId === userId || 
                       ticket.assigneeId === userId;

    if (!isAdmin && !isInvolved) {
      // Final check: Is it the department manager of the receiver department?
      const dept = await this.prisma.department.findUnique({
        where: { id: ticket.receiverDeptId },
        select: { managerId: true }
      });
      if (dept?.managerId !== userId) {
        throw new NotFoundException('Access denied to this ticket files');
      }
    }

    return ticket.attachments;
  }

  async downloadTicketFile(fileId: string, userId: string, userRole: string) {
    const file = await this.prisma.ticketAttachment.findUnique({
      where: { id: fileId },
      include: { 
        ticket: {
          include: {
            receiverDept: {
              select: { managerId: true }
            }
          }
        } 
      },
    });

    if (!file) throw new NotFoundException('File not found');

    const isAdmin = ['COMPANY_ADMIN', 'SUPER_ADMIN'].includes(userRole);

    // Allow: admin, or any user involved in the ticket
    const isInvolved = file.ticket.requesterId === userId || 
                       file.ticket.requesterManagerId === userId || 
                       file.ticket.receiverManagerId === userId || 
                       file.ticket.assigneeId === userId ||
                       file.ticket.receiverDept?.managerId === userId;

    // Also allow any user in the same company as the ticket (checked via user's companyId)
    if (!isAdmin && !isInvolved) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { companyId: true }
      });
      const ticketWithCompany = await this.prisma.ticket.findUnique({
        where: { id: file.ticketId },
        select: { companyId: true }
      });
      if (!user?.companyId || user.companyId !== ticketWithCompany?.companyId) {
        throw new NotFoundException('Access denied');
      }
    }

    if (file.filePath.startsWith('http')) {
      return { filePath: file.filePath, fileName: file.fileName, mimeType: file.mimeType };
    }

    if (!existsSync(file.filePath)) throw new NotFoundException('File on disk missing');

    return {
      filePath: file.filePath,
      fileName: file.fileName,
      mimeType: file.mimeType,
    };
  }


  async deleteTicketFile(fileId: string, userId: string, userRole: string) {
    const file = await this.prisma.ticketAttachment.findUnique({
      where: { id: fileId },
      include: { ticket: true },
    });

    if (!file) throw new NotFoundException('File not found');

    const isAdmin = ['COMPANY_ADMIN', 'SUPER_ADMIN'].includes(userRole);
    if (!isAdmin && file.ticket.requesterId !== userId) {
      throw new BadRequestException('Only requester or admins can delete attachments');
    }

    if (file.filePath.startsWith('http')) {
      if (this.isCloudinaryConfigured) {
        try {
          const publicId = file.filePath.split('/').pop().split('.')[0];
          await cloudinary.uploader.destroy(publicId);
        } catch (err) {
          console.error('Cloudinary destroy failed:', err);
        }
      }
    } else if (existsSync(file.filePath)) {
      await fs.unlink(file.filePath).catch(console.error);
    }
    await this.prisma.ticketAttachment.delete({ where: { id: fileId } });

    return { message: 'Attachment deleted' };
  }

  async updateUserAvatar(userId: string, avatarUrl: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { avatar: avatarUrl },
      select: {
        id: true,
        avatar: true,
      },
    });
  }
}
