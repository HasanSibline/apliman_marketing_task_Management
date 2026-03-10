import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PlansService {
    constructor(private prisma: PrismaService) { }

    async findAll() {
        return (this.prisma as any).plan.findMany({
            orderBy: { price: 'asc' },
        });
    }

    async findOne(id: string) {
        const plan = await (this.prisma as any).plan.findUnique({
            where: { id },
        });
        if (!plan) throw new NotFoundException('Plan not found');
        return plan;
    }

    async update(id: string, data: any) {
        const plan = await (this.prisma as any).plan.findUnique({ where: { id } });
        if (!plan) throw new NotFoundException('Plan not found');

        return (this.prisma as any).plan.update({
            where: { id },
            data,
        });
    }

    async create(data: any) {
        return (this.prisma as any).plan.create({
            data,
        });
    }

    async remove(id: string) {
        const plan = await (this.prisma as any).plan.findUnique({ where: { id } });
        if (!plan) throw new NotFoundException('Plan not found');

        // Check if any company is using this plan name
        const companiesCount = await this.prisma.company.count({
            where: { subscriptionPlan: plan.name }
        });

        if (companiesCount > 0) {
            throw new Error(`Cannot delete plan ${plan.name} as it is currently in use by ${companiesCount} companies.`);
        }

        return (this.prisma as any).plan.delete({
            where: { id },
        });
    }
}
