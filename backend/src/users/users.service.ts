import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { Prisma } from '@prisma/client';
import { UserRole, UserStatus } from '../types/prisma';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createUserDto: CreateUserDto) {
    try {
      const user = await this.prisma.user.create({
        data: {
          ...createUserDto,
          status: UserStatus.ACTIVE,
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          position: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      // Analytics model removed - no longer creating analytics records

      return user;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new BadRequestException('User with this email already exists');
        }
      }
      throw error;
    }
  }

  async findAll(role?: UserRole, status?: UserStatus, companyId?: string) {
    const where: Prisma.UserWhereInput = {};
    
    if (role) {
      where.role = role;
    }
    
    if (status) {
      where.status = status;
    }

    // Filter by company if provided (skip for SUPER_ADMIN queries)
    if (companyId !== undefined) {
      where.companyId = companyId;
    }

    return this.prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        position: true,
        status: true,
        companyId: true,
        createdAt: true,
        updatedAt: true,
        lastActiveAt: true,
        _count: {
          select: {
            assignedTasks: true,
            createdTasks: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        position: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        lastActiveAt: true,
        password: true, // Include password for authentication
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        position: true,
        status: true,
        companyId: true,
        createdAt: true,
        updatedAt: true,
        lastActiveAt: true,
        password: true, // Include password for authentication
      },
    });
  }

  /**
   * Find company by ID (for login validation)
   */
  async findCompanyById(companyId: string) {
    return this.prisma.company.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        name: true,
        isActive: true,
        subscriptionStatus: true,
        subscriptionEnd: true,
      },
    });
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    try {
      const user = await this.prisma.user.update({
        where: { id },
        data: updateUserDto,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          position: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          lastActiveAt: true,
        },
      });

      return user;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') {
          throw new NotFoundException('User not found');
        }
        if (error.code === 'P2002') {
          throw new BadRequestException('Email already exists');
        }
      }
      throw error;
    }
  }

  async updateUserStatus(id: string, status: UserStatus) {
    const updateData: any = { status };
    
    if (status === UserStatus.ACTIVE) {
      updateData.lastActiveAt = new Date();
    }

    return this.prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        status: true,
        lastActiveAt: true,
      },
    });
  }

  async updateLastActive(id: string) {
    return this.prisma.user.update({
      where: { id },
      data: {
        lastActiveAt: new Date(),
      },
      select: {
        id: true,
        lastActiveAt: true,
      },
    });
  }

  async updatePassword(id: string, hashedPassword: string) {
    return this.prisma.user.update({
      where: { id },
      data: {
        password: hashedPassword,
      },
      select: {
        id: true,
      },
    });
  }

  async remove(id: string) {
    try {
      // Soft delete by setting status to RETIRED
      const user = await this.prisma.user.update({
        where: { id },
        data: {
          status: UserStatus.RETIRED,
        },
        select: {
          id: true,
          email: true,
          name: true,
          status: true,
        },
      });

      return user;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') {
          throw new NotFoundException('User not found');
        }
      }
      throw error;
    }
  }

  async getUserStats(id: string) {
    const user = await this.findById(id);
    
    const [assignedTasks, createdTasks] = await Promise.all([
      this.prisma.task.count({
        where: { assignedToId: id },
      }),
      this.prisma.task.count({
        where: { createdById: id },
      }),
    ]);

    // Count tasks for basic stats - TODO: Update to use workflow phases
    const completedTasks = 0; // Placeholder until workflow integration

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        position: user.position,
        status: user.status,
        lastActiveAt: user.lastActiveAt,
      },
      stats: {
        assignedTasks,
        createdTasks,
        completedTasks,
        analytics: {
          tasksAssigned: assignedTasks,
          tasksCompleted: completedTasks,
          tasksInProgress: 0,
          interactions: 0,
          totalTimeSpent: 0,
        },
      },
    };
  }

  async resetPassword(id: string) {
    // Generate a random temporary password
    const tempPassword = Math.random().toString(36).slice(-8);
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    try {
      const user = await this.prisma.user.update({
        where: { id },
        data: {
          password: hashedPassword,
          status: UserStatus.ACTIVE, // Reactivate user if they were retired
        },
        select: {
          id: true,
          email: true,
          name: true,
        },
      });

      // TODO: Send email with temporary password
      // For now, we'll just return the temporary password
      return {
        message: 'Password reset successful',
        tempPassword, // In production, this should be sent via email
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') {
          throw new NotFoundException('User not found');
        }
      }
      throw error;
    }
  }

  async resetPasswordManual(id: string, newPassword: string) {
    try {
      // Hash the new password
      const hashedPassword = await bcrypt.hash(newPassword, 10);

      await this.prisma.user.update({
        where: { id },
        data: {
          password: hashedPassword,
        },
        select: {
          id: true,
          email: true,
          name: true,
        },
      });

      return {
        message: 'Password reset successfully',
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') {
          throw new NotFoundException('User not found');
        }
      }
      throw error;
    }
  }
}
