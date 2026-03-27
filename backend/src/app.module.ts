import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { TasksModule } from './tasks/tasks.module';
import { FilesModule } from './files/files.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { PresenceModule } from './presence/presence.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AiModule } from './ai/ai.module';
import { WorkflowsModule } from './workflows/workflows.module';
import { KnowledgeModule } from './knowledge/knowledge.module';
import { ChatModule } from './chat/chat.module';
import { CompaniesModule } from './companies/companies.module';
import { SystemModule } from './system/system.module';
import { QuartersModule } from './quarters/quarters.module';
import { ObjectivesModule } from './objectives/objectives.module';
import { PlansModule } from './plans/plans.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DepartmentsModule } from './departments/departments.module';
import { TeamsModule } from './teams/teams.module';
import { TicketsModule } from './tickets/tickets.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: 60000,
          limit: 60,
        },
      ],
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    UsersModule,
    TasksModule,
    FilesModule,
    AnalyticsModule,
    PresenceModule,
    NotificationsModule,
    AiModule,
    WorkflowsModule,
    KnowledgeModule,
    ChatModule,
    CompaniesModule,
    SystemModule,
    QuartersModule,
    ObjectivesModule,
    PlansModule,
    DepartmentsModule,
    TeamsModule,
    TicketsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
