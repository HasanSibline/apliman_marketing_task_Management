import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ChatLearningService } from './chat-learning.service';
import { PrismaModule } from '../prisma/prisma.module';
import { CompaniesModule } from '../companies/companies.module';
import { forwardRef } from '@nestjs/common';

@Module({
  imports: [PrismaModule, HttpModule, forwardRef(() => CompaniesModule)],
  controllers: [ChatController],
  providers: [ChatService, ChatLearningService],
  exports: [ChatService, ChatLearningService],
})
export class ChatModule {}

