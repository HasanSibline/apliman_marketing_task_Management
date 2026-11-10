import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../users/users.service';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
import { UserRole, UserStatus } from '../../types/prisma';
import { BLOCKED_MESSAGE } from '../../billing/subscription-state';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.usersService.findById(payload.sub);
    
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (user.status === UserStatus.RETIRED) {
      throw new UnauthorizedException('Account is retired');
    }

    // A session that began before the company was suspended or ran out of grace ends
    // here, rather than lasting as long as its token does.
    if (user.companyId && user.role !== UserRole.SUPER_ADMIN) {
      const access = await this.usersService.companyAccess(user.companyId);
      if (!access || access.state === 'SUSPENDED') {
        throw new UnauthorizedException('Company account is suspended or inactive');
      }
      if (access.blocked) throw new UnauthorizedException(BLOCKED_MESSAGE);
    }

    // Update last active time
    await this.usersService.updateLastActive(user.id);

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      position: user.position,
      status: user.status,
      companyId: user.companyId, // CRITICAL: Include companyId for multi-tenancy
    };
  }
}
