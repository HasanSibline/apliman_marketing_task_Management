import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, InternalServerErrorException } from '@nestjs/common';
import { PlansService } from './plans.service';
import { SubscriptionTaskService } from '../companies/subscription-task.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../types/prisma';

@Controller('plans')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN) // Only super admin can manage global plans
export class PlansController {
    constructor(
        private readonly plansService: PlansService,
        private readonly subscriptionTaskService: SubscriptionTaskService
    ) { }

    @Post('check-expirations')
    async triggerCheck() {
        await this.subscriptionTaskService.triggerManualCheck();
        return { message: 'Manual subscription expiration check triggered' };
    }

    @Get()
    async findAll() {
        return this.plansService.findAll();
    }

    @Get(':id')
    async findOne(@Param('id') id: string) {
        return this.plansService.findOne(id);
    }

    @Post()
    async create(@Body() data: any) {
        return this.plansService.create(data);
    }

    @Patch(':id')
    async update(@Param('id') id: string, @Body() data: any) {
        return this.plansService.update(id, data);
    }

    @Delete(':id')
    async remove(@Param('id') id: string) {
        try {
            return await this.plansService.remove(id);
        } catch (error) {
            throw new InternalServerErrorException(error.message);
        }
    }
}
