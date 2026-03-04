import { Module } from '@nestjs/common';
import { QuartersService } from './quarters.service';
import { QuartersController } from './quarters.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
    imports: [PrismaModule],
    controllers: [QuartersController],
    providers: [QuartersService],
    exports: [QuartersService],
})
export class QuartersModule { }
