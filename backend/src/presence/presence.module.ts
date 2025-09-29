import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { PresenceService } from './presence.service';
import { PresenceGateway } from './presence.gateway';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    JwtModule.register({}), // Will use global JWT config from AuthModule
  ],
  providers: [PresenceService, PresenceGateway],
  exports: [PresenceService],
})
export class PresenceModule {}
