import { Module } from '@nestjs/common';
import { ObjectivesService } from './objectives.service';
import { ObjectivesController } from './objectives.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { forwardRef } from '@nestjs/common';
import { TasksModule } from '../tasks/tasks.module';

@Module({
    imports: [PrismaModule, forwardRef(() => TasksModule)],
    controllers: [ObjectivesController],
    providers: [ObjectivesService],
    exports: [ObjectivesService],
})
export class ObjectivesModule { }
