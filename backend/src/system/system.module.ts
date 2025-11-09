import { Module } from '@nestjs/common';
import { SystemSettingsController } from './system-settings.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [SystemSettingsController],
})
export class SystemModule {}

