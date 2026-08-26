import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TicketsService } from './tickets.service';
import { TicketsController } from './tickets.controller';
import { TicketDeadlineWorker } from './ticket-deadline.worker';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AiModule } from '../ai/ai.module';
import { MicrosoftModule } from '../microsoft/microsoft.module';

@Module({
  // HttpModule and AiModule are for the pre-flight check only: it phrases its note
  // through the AI service when a company has a provider, and composes the same note
  // itself when it does not. PrismaModule and NotificationsModule also serve
  // TicketDeadlineWorker, which reads tickets and writes notifications directly.
  // MicrosoftModule is for the email courtesy on top of every in-app ticket
  // notification (ticket-mail.ts) — safe to import here with no cycle, since nothing
  // MicrosoftModule imports depends on TicketsModule.
  // ScheduleModule itself is registered once, app-wide, in app.module.ts — a feature
  // module only needs to provide the class carrying the @Cron method.
  imports: [PrismaModule, NotificationsModule, HttpModule, AiModule, MicrosoftModule],
  providers: [TicketsService, TicketDeadlineWorker],
  controllers: [TicketsController],
  exports: [TicketsService],
})
export class TicketsModule {}
