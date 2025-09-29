import { MulterModuleOptions } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { BadRequestException } from '@nestjs/common';

export const multerConfig = (configService: ConfigService): MulterModuleOptions => {
  const uploadPath = configService.get<string>('UPLOAD_PATH', './uploads');
  const maxFileSize = configService.get<number>('MAX_FILE_SIZE', 5242880); // 5MB

  // Ensure upload directory exists
  if (!existsSync(uploadPath)) {
    mkdirSync(uploadPath, { recursive: true });
  }

  return {
    storage: diskStorage({
      destination: (req, file, cb) => {
        const taskId = req.params.taskId || 'temp';
        const taskUploadPath = join(uploadPath, taskId);
        
        if (!existsSync(taskUploadPath)) {
          mkdirSync(taskUploadPath, { recursive: true });
        }
        
        cb(null, taskUploadPath);
      },
      filename: (req, file, cb) => {
        const uniqueSuffix = `${uuidv4()}${extname(file.originalname)}`;
        cb(null, uniqueSuffix);
      },
    }),
    fileFilter: (req, file, cb) => {
      const allowedMimeTypes = [
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/gif',
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/plain',
      ];

      if (allowedMimeTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new BadRequestException(`File type ${file.mimetype} is not allowed`), false);
      }
    },
    limits: {
      fileSize: maxFileSize,
      files: 10, // Maximum 10 files per upload
    },
  };
};
