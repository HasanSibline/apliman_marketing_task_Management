import { Module } from '@nestjs/common';
import { ObjectivesService } from './objectives.service';
import { ObjectivesController } from './objectives.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
    imports: [PrismaModule],
    controllers: [ObjectivesController],
    providers: [ObjectivesService],
    exports: [ObjectivesService],
})
export class ObjectivesModule { }
