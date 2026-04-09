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

  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleMeetingNotifications() {
    this.logger.debug('Checking for upcoming Microsoft Teams meetings...');
    
    // Find all users who are synced
    const syncedUsers = await this.prisma.user.findMany({
      where: { isMicrosoftSynced: true },
      select: { id: true, name: true }
    });

    for (const user of syncedUsers) {
      try {
        // Fetch events for the next 20 minutes
        const now = new Date();
        const future = new Date(now.getTime() + 20 * 60000);
        
        const events = await this.microsoftService.getCalendarEvents(
          user.id, 
          now.toISOString(), 
          future.toISOString()
        );

        for (const event of events) {
          if (!event.isTeams) continue;

          const startTime = new Date(event.start);
          const diffMinutes = Math.round((startTime.getTime() - now.getTime()) / 60000);

          // 1. 15-minute Reminder
          if (diffMinutes >= 10 && diffMinutes <= 16) {
            await this.sendNotification(user.id, event, 'REMINDER', `Meeting in 15 mins: ${event.title}`);
          }
          
          // 2. Started Notification
          if (diffMinutes >= -2 && diffMinutes <= 2) {
            await this.sendNotification(user.id, event, 'STARTED', `Meeting Started: ${event.title}`);
          }
        }
      } catch (error) {
        this.logger.error(`Failed to handle notifications for user ${user.id}: ${error.message}`);
      }
    }

    // Clear old processed notifications every hour (simple cache management)
    if (new Date().getMinutes() === 0) {
      this.processedNotifications.clear();
    }
  }

  private async sendNotification(userId: string, event: any, type: string, message: string) {
    const key = `${userId}-${event.id}-${type}`;
    if (this.processedNotifications.has(key)) return;

    await this.notificationsService.createNotification({
      userId,
      type: 'MICROSOFT_MEETING',
      title: type === 'REMINDER' ? '📅 Meeting Reminder' : '🎬 Meeting Live',
      message,
      actionUrl: `/calendar/meeting/${event.id}`
    });

    this.processedNotifications.add(key);
    this.logger.log(`Notification sent to user ${userId} for meeting ${event.id} (${type})`);
  }
}
