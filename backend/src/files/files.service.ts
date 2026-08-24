import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import sharp from 'sharp';
import * as fs from 'fs/promises';
import * as path from 'path';
import { existsSync } from 'fs';
import { v2 as cloudinary } from 'cloudinary';

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);

  private isCloudinaryConfigured = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly aiService: AiService,
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

        // Reading the document starts here and finishes on its own time.
        this.extractInBackground('task', fileRecord.id, {
          filePath: fileRecord.filePath,
          mimeType: fileRecord.mimeType,
          fileName: fileRecord.fileName,
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
            companyId: true,
          },
        },
      },
    });

    if (!file) {
      throw new NotFoundException('File not found');
    }

    // Tenant check first. Without it, any admin or manager could download a task
    // file belonging to another company just by knowing its id, the role check
    // below only ever constrained employees. Super admins have no company of their
    // own and are allowed across tenants by design.
    if (userRole !== 'SUPER_ADMIN') {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { companyId: true },
      });
      if (!user?.companyId || user.companyId !== file.task.companyId) {
        throw new NotFoundException('File not found or access denied');
      }
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
            companyId: true,
          },
        },
      },
    });

    if (!file) {
      throw new NotFoundException('File not found');
    }

    // Same tenant check as downloadFile, deleting another company's attachment is
    // a cross-tenant write, so it matters more, not less.
    if (userRole !== 'SUPER_ADMIN') {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { companyId: true },
      });
      if (!user?.companyId || user.companyId !== file.task.companyId) {
        throw new NotFoundException('File not found or access denied');
      }
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

  /**
   * Read an uploaded document's text, after the upload has already returned.
   *
   * Deliberately not awaited by the upload. Optical character recognition on a scanned
   * page takes seconds, and a person watching a progress bar should not be made to wait
   * for a step whose result they have not asked for yet. The row is written the moment
   * the file is stored, and the text lands on it when it is ready.
   *
   * Nothing here throws. A document that cannot be read is a document the user still
   * uploaded successfully, so the failure is recorded on the row as a status rather than
   * raised to a caller who has already been told the upload worked. `ocrStatus` is what
   * separates "read, and it contained nothing" from "never attempted" and from "tried
   * and failed", which a null extractedText on its own cannot express.
   */
  private extractInBackground(
    kind: 'task' | 'ticket',
    id: string,
    file: { filePath: string; mimeType: string; fileName: string },
  ): void {
    const table: any = kind === 'task' ? this.prisma.taskFile : this.prisma.ticketAttachment;

    void (async () => {
      try {
        const result = await this.aiService.extractDocumentText(file);

        await table.update({
          where: { id },
          data: {
            extractedText: result.extractedText || null,
            ocrConfidence: result.confidence,
            // An image on a host with no Tesseract is not a failed read, it is a read
            // this deployment cannot perform. Saying so stops anyone treating the
            // explanatory string that comes back as the document's contents.
            ocrStatus: result.ocrAvailable ? 'DONE' : 'UNSUPPORTED',
          },
        });
      } catch (error: any) {
        this.logger.warn(
          `Text extraction failed for ${kind} file ${id}: ${error?.message ?? 'unknown error'}`,
        );
        await table
          .update({ where: { id }, data: { ocrStatus: 'FAILED' } })
          .catch(() => undefined);
      }
    })();
  }

  /**
   * Read a document again on request.
   *
   * Extraction runs once on upload, and a deployment without Tesseract records
   * UNSUPPORTED rather than text. Once the binary is present those rows are worth
   * another attempt, and this is how that happens without re-uploading the file.
   */
  async reextractTaskFile(fileId: string, userId: string) {
    const file = await this.prisma.taskFile.findUnique({ where: { id: fileId } });
    if (!file) throw new NotFoundException('File not found');

    // Same ownership rule the download path applies, so re-reading a document is not a
    // way around the check that governs reading it in the first place. The role comes
    // from the database rather than from the caller, matching authorizeTicketAccess.
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    await this.getTaskFiles(file.taskId, userId, user?.role ?? 'EMPLOYEE');

    await this.prisma.taskFile.update({ where: { id: fileId }, data: { ocrStatus: 'PENDING' } });
    this.extractInBackground('task', fileId, {
      filePath: file.filePath,
      mimeType: file.mimeType,
      fileName: file.fileName,
    });

    return { status: 'PENDING' };
  }

  // --- Ticket Attachments ---

  /**
   * Decide whether a caller may touch a ticket's attachments.
   *
   * The role carried on the JWT says nothing about which tenant the caller belongs to,
   * so the caller's company and role are read back from the database and the company is
   * matched against the ticket: only SUPER_ADMIN is company-agnostic. Involvement
   * mirrors TicketsService.findOne, TicketAssignment rows included, because assigneeId
   * is deprecated and an assignee recorded only there is still an assignee.
   *
   * Upload, list, download and delete all route through here so the four cannot drift
   * apart again, which is how upload ended up with no check at all.
   */
  private async authorizeTicketAccess(ticketId: string, userId: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        companyId: true,
        requesterId: true,
        requesterManagerId: true,
        receiverManagerId: true,
        assigneeId: true,
        receiverDept: { select: { managerId: true } },
        assignments: { select: { userId: true } },
      },
    });

    if (!ticket) throw new NotFoundException('Ticket not found');

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { companyId: true, role: true },
    });

    if (!user) throw new NotFoundException('Ticket not found');

    if (user.role === 'SUPER_ADMIN') {
      return { ticket, isAdmin: true };
    }

    // Anything short of SUPER_ADMIN is confined to its own tenant. A wrong-company
    // ticket reads as missing rather than forbidden so the id itself gives nothing away.
    if (!user.companyId || user.companyId !== ticket.companyId) {
      throw new NotFoundException('Ticket not found');
    }

    const isAdmin = ['COMPANY_ADMIN', 'ADMIN'].includes(user.role);
    const isInvolved =
      ticket.requesterId === userId ||
      ticket.requesterManagerId === userId ||
      ticket.receiverManagerId === userId ||
      ticket.assigneeId === userId ||
      ticket.receiverDept?.managerId === userId ||
      ticket.assignments.some((assignment) => assignment.userId === userId);

    if (!isAdmin && !isInvolved) {
      throw new NotFoundException('Access denied to this ticket');
    }

    return { ticket, isAdmin };
  }

  async uploadTicketFiles(ticketId: string, files: Express.Multer.File[], userId: string) {
    await this.authorizeTicketAccess(ticketId, userId);

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

  // userRole is still accepted because the controller passes it, but it is deliberately
  // unused: authorizeTicketAccess re-reads the role from the database instead.
  async getTicketFiles(ticketId: string, userId: string, userRole?: string) {
    await this.authorizeTicketAccess(ticketId, userId);

    return this.prisma.ticketAttachment.findMany({
      where: { ticketId },
      orderBy: { uploadedAt: 'desc' },
    });
  }

  async downloadTicketFile(fileId: string, userId: string, userRole?: string) {
    const file = await this.prisma.ticketAttachment.findUnique({
      where: { id: fileId },
    });

    if (!file) throw new NotFoundException('File not found');

    await this.authorizeTicketAccess(file.ticketId, userId);

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


  async deleteTicketFile(fileId: string, userId: string, userRole?: string) {
    const file = await this.prisma.ticketAttachment.findUnique({
      where: { id: fileId },
    });

    if (!file) throw new NotFoundException('File not found');

    const { ticket, isAdmin } = await this.authorizeTicketAccess(file.ticketId, userId);

    if (!isAdmin && ticket.requesterId !== userId) {
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
