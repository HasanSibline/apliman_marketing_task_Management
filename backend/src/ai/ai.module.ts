import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { CompaniesModule } from '../companies/companies.module';
import { forwardRef } from '@nestjs/common';

@Module({
  imports: [HttpModule, PrismaModule, forwardRef(() => CompaniesModule)],
  controllers: [AiController],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
