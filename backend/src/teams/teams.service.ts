import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TeamsService {
  constructor(private prisma: PrismaService) {}

  async findAll(companyId: string) {
    return this.prisma.team.findMany({
      where: { companyId },
      include: {
        _count: { select: { members: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string, companyId: string) {
    const team = await this.prisma.team.findUnique({
      where: { id },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                position: true,
                department: { select: { name: true } },
                status: true,
              },
            },
          },
        },
      },
    });

    if (!team || team.companyId !== companyId) {
      throw new NotFoundException('Team not found');
    }

    return team;
  }

  async create(companyId: string, name: string) {
    return this.prisma.team.create({
      data: {
        companyId,
        name,
      },
    });
  }

  async update(id: string, companyId: string, name: string) {
    await this.findOne(id, companyId);
    return this.prisma.team.update({
      where: { id },
      data: { name },
    });
  }

  async remove(id: string, companyId: string) {
    await this.findOne(id, companyId);
    return this.prisma.team.delete({ where: { id } });
  }

  async addMember(teamId: string, userId: string, companyId: string) {
    await this.findOne(teamId, companyId);
    
    // Verify user belongs to same company
    const user = await this.prisma.user.findUnique({ where: { id: userId, companyId } });
    if (!user) throw new NotFoundException('User not found');

    return this.prisma.teamMember.upsert({
      where: { teamId_userId: { teamId, userId } },
      create: { teamId, userId },
      update: {},
    });
  }

  async removeMember(teamId: string, userId: string, companyId: string) {
    await this.findOne(teamId, companyId);
    return this.prisma.teamMember.delete({
      where: { teamId_userId: { teamId, userId } },
    });
  }
}
