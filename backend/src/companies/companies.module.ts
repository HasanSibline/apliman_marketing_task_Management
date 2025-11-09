import { Module } from '@nestjs/common';
import { CompaniesService } from './companies.service';
import { CompaniesController, PublicCompaniesController } from './companies.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CompaniesController, PublicCompaniesController],
  providers: [CompaniesService],
  exports: [CompaniesService],
})
export class CompaniesModule {}

