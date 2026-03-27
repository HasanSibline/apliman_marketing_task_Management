import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DepartmentsService {
  constructor(private prisma: PrismaService) {}

  async findAll(companyId: string) {
    return this.prisma.department.findMany({
      where: { companyId },
      include: {
        manager: { select: { id: true, name: true, position: true } },
        _count: { select: { users: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string, companyId: string) {
    const dept = await this.prisma.department.findUnique({
      where: { id },
      include: {
        manager: { select: { id: true, name: true, position: true } },
        users: { select: { id: true, name: true, position: true, status: true } },
      },
    });

    if (!dept || dept.companyId !== companyId) {
      throw new NotFoundException('Department not found');
    }

    return dept;
  }

  async create(companyId: string, data: { name: string; managerId?: string }) {
    return this.prisma.department.create({
      data: {
        companyId,
        name: data.name,
        managerId: data.managerId || null,
      },
    });
  }

  async update(id: string, companyId: string, data: { name?: string; managerId?: string }) {
    await this.findOne(id, companyId);
    return this.prisma.department.update({
      where: { id },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.managerId !== undefined && { managerId: data.managerId }),
      },
    });
  }

  async remove(id: string, companyId: string) {
    await this.findOne(id, companyId);
    return this.prisma.department.delete({ where: { id } });
  }

  // Assign user to department
  async assignUser(userId: string, departmentId: string | null, companyId: string) {
    // Verify department belongs to company if not null
    if (departmentId) {
      const dept = await this.prisma.department.findUnique({ where: { id: departmentId } });
      if (!dept || dept.companyId !== companyId) throw new NotFoundException('Department not found');
    }

    return this.prisma.user.update({
      where: { id: userId, companyId },
      data: { departmentId },
    });
  }
}
