import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ChatLearningService } from './chat-learning.service';
import { PrismaModule } from '../prisma/prisma.module';
import { CompaniesModule } from '../companies/companies.module';
import { MicrosoftModule } from '../microsoft/microsoft.module';
import { forwardRef } from '@nestjs/common';

@Module({
  imports: [PrismaModule, HttpModule, forwardRef(() => CompaniesModule), MicrosoftModule],
  controllers: [ChatController],
  providers: [ChatService, ChatLearningService],
  exports: [ChatService, ChatLearningService],
})
export class ChatModule {}

