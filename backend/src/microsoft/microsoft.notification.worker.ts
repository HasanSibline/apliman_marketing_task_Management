import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MicrosoftService } from './microsoft.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class MicrosoftNotificationWorker {
  private readonly logger = new Logger(MicrosoftNotificationWorker.name);
  private processedNotifications = new Set<string>();

  constructor(
    private readonly microsoftService: MicrosoftService,
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async handleMeetingNotifications() {
    this.logger.debug('Scanning for upcoming Microsoft Teams meetings...');
    
    // Get all synced users
    const syncedUsers = await this.prisma.user.findMany({
      where: { isMicrosoftSynced: true },
      select: { id: true, name: true }
    });

    for (const user of syncedUsers) {
      try {
        const now = new Date();
        const future = new Date(now.getTime() + 30 * 60000); // 30 minutes ahead
        
        const events = await this.microsoftService.getCalendarEvents(
          user.id, 
          now.toISOString(), 
          future.toISOString()
        );

        for (const event of events) {
          if (!event.isTeams) continue;

          const startTime = new Date(event.start);
          const diffMinutes = Math.round((startTime.getTime() - now.getTime()) / 60000);

          // 15-minute Reminder
          if (diffMinutes >= 10 && diffMinutes <= 16) {
            await this.sendNotification(user.id, event, 'REMINDER', `You have a Teams meeting in 15 minutes: ${event.title}`);
          }
          
          // Meeting Started Notification
          if (diffMinutes >= -2 && diffMinutes <= 2) {
            await this.sendNotification(user.id, event, 'STARTED', `Your Teams meeting "${event.title}" is starting now.`);
          }
        }
      } catch (error) {
        this.logger.error(`Error processing notifications for user ${user.id}: ${error.message}`);
      }
    }

    // Daily cleanup of the set to prevent memory leash
    if (new Date().getHours() === 0 && new Date().getMinutes() < 10) {
      this.processedNotifications.clear();
    }
  }

  private async sendNotification(userId: string, event: any, type: string, message: string) {
    const notificationKey = `${userId}-${event.id}-${type}-${new Date().toDateString()}`;
    if (this.processedNotifications.has(notificationKey)) return;

    await this.notificationsService.createNotification({
      userId,
      type: 'MICROSOFT_MEETING',
      title: type === 'REMINDER' ? '📅 Meeting Soon' : '🎬 Meeting Starting',
      message,
      actionUrl: `/meetings/${event.id}` // Corrected to match frontend route
    });

    this.processedNotifications.add(notificationKey);
    this.logger.log(`Notification (${type}) sent to user ${userId} for meeting ${event.id}`);
  }
}
