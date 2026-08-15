import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TicketsService } from './tickets.service';
import { TicketsController } from './tickets.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AiModule } from '../ai/ai.module';

@Module({
  // HttpModule and AiModule are for the pre-flight check only: it phrases its note
  // through the AI service when a company has a provider, and composes the same note
  // itself when it does not.
  imports: [PrismaModule, NotificationsModule, HttpModule, AiModule],
  providers: [TicketsService],
  controllers: [TicketsController],
  exports: [TicketsService],
})
export class TicketsModule {}
