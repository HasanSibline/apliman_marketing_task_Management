import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { UserRole, UserStatus } from '../types/prisma';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async validateUser(email: string, password: string): Promise<any> {
    const user = await this.usersService.findByEmail(email);
    
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.status === UserStatus.RETIRED) {
      throw new UnauthorizedException('Account is retired and cannot log in');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Update user status to ACTIVE and last active time
    await this.usersService.updateUserStatus(user.id, UserStatus.ACTIVE);

    const { password: _, ...result } = user;
    return result;
  }

  async login(loginDto: LoginDto) {
    const user = await this.validateUser(loginDto.email, loginDto.password);
    
    // Prevent SUPER_ADMIN from using company login
    if (user.role === UserRole.SUPER_ADMIN && !user.companyId) {
      throw new UnauthorizedException('System Administrators must use the admin portal at /admin/login');
    }
    
    // Check if company is active (if user has a company)
    if (user.companyId) {
      const company = await this.usersService.findCompanyById(user.companyId);
      if (!company || !company.isActive || company.subscriptionStatus === 'SUSPENDED') {
        throw new UnauthorizedException('Company account is suspended or inactive');
      }
    }
    
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      companyId: user.companyId, // Add companyId to JWT
    };

    const accessToken = this.jwtService.sign(payload);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        position: user.position,
        status: user.status,
        companyId: user.companyId, // Include in response
      },
      accessToken,
      expiresIn: this.configService.get<string>('JWT_EXPIRES_IN', '7d'),
    };
  }

  async adminLogin(loginDto: LoginDto) {
    const user = await this.validateUser(loginDto.email, loginDto.password);
    
    // Only allow SUPER_ADMIN with NO company
    if (user.role !== UserRole.SUPER_ADMIN || user.companyId !== null) {
      throw new UnauthorizedException(
        'Access denied. This portal is for System Administrators only. ' +
        'Company users should login at /login'
      );
    }
    
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      companyId: null, // Explicitly null for System Admin
    };

    const access_token = this.jwtService.sign(payload);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        position: user.position,
        status: user.status,
        companyId: null,
      },
      access_token,
      expiresIn: this.configService.get<string>('JWT_EXPIRES_IN', '7d'),
    };
  }

  async register(
    registerDto: RegisterDto,
    creator: { role: UserRole; companyId?: string | null },
  ) {
    // Check if user already exists
    const existingUser = await this.usersService.findByEmail(registerDto.email);
    if (existingUser) {
      throw new BadRequestException('User with this email already exists');
    }

    const creatorRole = creator.role;
    const creatorCompanyId = creator.companyId ?? null;

    // Role-based registration validation
    if (creatorRole === UserRole.EMPLOYEE) {
      throw new BadRequestException('Employees cannot create accounts');
    }

    if (creatorRole === UserRole.ADMIN) {
      if (!creatorCompanyId) {
        throw new BadRequestException('Admin must belong to a company to create users');
      }
      if (registerDto.role !== UserRole.EMPLOYEE) {
        throw new BadRequestException('Admins can only create Employee accounts');
      }
    }

    if (creatorRole === UserRole.COMPANY_ADMIN) {
      if (!creatorCompanyId) {
        throw new BadRequestException('Company administrators must belong to a company to create users');
      }
      if (registerDto.role === UserRole.SUPER_ADMIN) {
        throw new BadRequestException('Company administrators cannot create System Administrators');
      }
    }

    if (creatorRole === UserRole.SUPER_ADMIN && registerDto.role !== UserRole.SUPER_ADMIN) {
      if (!registerDto.companyId) {
        throw new BadRequestException('Company ID is required when creating company users');
      }
    }

    // Hash password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(registerDto.password, saltRounds);

    // Determine target company assignment
    let targetCompanyId: string | null = null;
    switch (creatorRole) {
      case UserRole.SUPER_ADMIN:
        targetCompanyId = registerDto.role === UserRole.SUPER_ADMIN ? null : registerDto.companyId ?? null;
        if (registerDto.role !== UserRole.SUPER_ADMIN && !targetCompanyId) {
          throw new BadRequestException('Company ID is required when creating company users');
        }
        break;
      case UserRole.COMPANY_ADMIN:
      case UserRole.ADMIN:
        if (!creatorCompanyId) {
          throw new BadRequestException('Creator must belong to a company to create users');
        }
        targetCompanyId = creatorCompanyId;
        break;
      default:
        throw new BadRequestException('Insufficient permissions to create users');
    }

    // Create user
    const user = await this.usersService.create({
      ...registerDto,
      password: hashedPassword,
      companyId: targetCompanyId ?? undefined,
    });

    // User service already excludes password from response
    return user;
  }

  async logout(userId: string) {
    // Update user status to OFFLINE
    await this.usersService.updateUserStatus(userId, UserStatus.OFFLINE);
    
    return { message: 'Logged out successfully' };
  }

  async refreshToken(user: any) {
    // Fetch fresh user data to ensure we have the latest companyId
    const fullUser = await this.usersService.findById(user.id);
    
    if (!fullUser) {
      throw new UnauthorizedException('User not found');
    }

    const payload: JwtPayload = {
      sub: fullUser.id,
      email: fullUser.email,
      role: fullUser.role as UserRole, // Cast Prisma enum to local enum
      companyId: fullUser.companyId, // CRITICAL: Include companyId
    };

    const accessToken = this.jwtService.sign(payload);

    return {
      user: {
        id: fullUser.id,
        email: fullUser.email,
        name: fullUser.name,
        role: fullUser.role,
        position: fullUser.position,
        status: fullUser.status,
        companyId: fullUser.companyId, // Include in response
      },
      accessToken,
      expiresIn: this.configService.get<string>('JWT_EXPIRES_IN', '7d'),
    };
  }

  async changePassword(userId: string, oldPassword: string, newPassword: string) {
    const user = await this.usersService.findById(userId);
    
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const isOldPasswordValid = await bcrypt.compare(oldPassword, user.password);
    
    if (!isOldPasswordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const saltRounds = 12;
    const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

    await this.usersService.updatePassword(userId, hashedNewPassword);

    return { message: 'Password changed successfully' };
  }
}
