import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class SubscriptionTaskService {
    private readonly logger = new Logger(SubscriptionTaskService.name);

    constructor(
        private prisma: PrismaService,
        private notificationsService: NotificationsService,
    ) { }

    /**
     * Run daily at midnight to check for upcoming subscription expirations
     * Notifies company admins 3 days before their plan ends.
     */
    @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
    async checkSubscriptionExpirations() {
        this.logger.log('📅 Checking for upcoming subscription expirations...');

        // target date is 3 days from now
        const targetDateStart = new Date();
        targetDateStart.setHours(0, 0, 0, 0);
        targetDateStart.setDate(targetDateStart.getDate() + 3);

        const targetDateEnd = new Date(targetDateStart);
        targetDateEnd.setHours(23, 59, 59, 999);

        try {
            // Find companies whose subscription ends in 3 days
            const expiringCompanies = await this.prisma.company.findMany({
                where: {
                    subscriptionEnd: {
                        gte: targetDateStart,
                        lte: targetDateEnd,
                    },
                    isActive: true,
                    subscriptionStatus: 'ACTIVE',
                },
                include: {
                    users: {
                        where: {
                            role: 'COMPANY_ADMIN',
                            status: 'ACTIVE',
                        },
                        select: {
                            id: true,
                            email: true,
                            name: true,
                        },
                    },
                },
            });

            this.logger.log(`🔍 Found ${expiringCompanies.length} companies expiring in 3 days.`);

            for (const company of expiringCompanies) {
                // Notify each COMPANY_ADMIN of the expiring company
                for (const admin of company.users) {
                    await this.notificationsService.createNotification({
                        userId: admin.id,
                        type: 'subscription_expiring',
                        title: 'Plan Expiring Soon',
                        message: `Heads up! Your "${company.subscriptionPlan}" plan for ${company.name} will expire in 3 days. Please renew or upgrade soon to avoid service interruption.`,
                        actionUrl: '/admin/billing', // assuming this page exists or will exist
                    });

                    this.logger.log(`🔔 Notified admin ${admin.email} for company ${company.name}`);
                }
            }

            this.logger.log('✅ Subscription expiration check completed.');

        } catch (error) {
            this.logger.error('❌ Error checking subscription expirations:', error);
        }
    }

    /**
     * Manual trigger for testing (useful for development)
     */
    async triggerManualCheck() {
        return this.checkSubscriptionExpirations();
    }
}
