import { Module } from '@nestjs/common';
import { MicrosoftService } from './microsoft.service';
import { MicrosoftController } from './microsoft.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AiModule } from '../ai/ai.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MicrosoftNotificationWorker } from './microsoft.notification.worker';
import { PresenceModule } from '../presence/presence.module';

@Module({
  imports: [PrismaModule, AiModule, NotificationsModule, PresenceModule],
  controllers: [MicrosoftController],
  providers: [MicrosoftService, MicrosoftNotificationWorker],
  exports: [MicrosoftService],
})
export class MicrosoftModule {}

