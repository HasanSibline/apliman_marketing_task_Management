import { Module } from '@nestjs/common';
import { CompaniesService } from './companies.service';
import { CompaniesController } from './companies.controller';
import { PublicCompaniesController } from './public-companies.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SubscriptionTaskService } from './subscription-task.service';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [CompaniesController, PublicCompaniesController],
  providers: [CompaniesService, SubscriptionTaskService],
  exports: [CompaniesService, SubscriptionTaskService],
})
export class CompaniesModule { }


