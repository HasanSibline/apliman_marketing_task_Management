import { Module } from '@nestjs/common';
import { QuartersService } from './quarters.service';
import { QuartersController } from './quarters.controller';
import { OkrAutomationService } from './okr-automation.service';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
    imports: [PrismaModule, NotificationsModule],
    controllers: [QuartersController],
    providers: [QuartersService, OkrAutomationService],
    exports: [QuartersService, OkrAutomationService],
})
export class QuartersModule { }
