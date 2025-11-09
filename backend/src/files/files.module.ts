import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { FilesService } from './files.service';
import { FilesController, PublicFilesController } from './files.controller';
import { TasksModule } from '../tasks/tasks.module';
import { multerConfig } from './config/multer.config';

@Module({
  imports: [
    TasksModule,
    MulterModule.registerAsync({
      imports: [ConfigModule],
      useFactory: multerConfig,
      inject: [ConfigService],
    }),
  ],
  controllers: [FilesController, PublicFilesController],
  providers: [FilesService],
  exports: [FilesService],
})
export class FilesModule {}
