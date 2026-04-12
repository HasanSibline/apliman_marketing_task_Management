import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { MicrosoftService } from './microsoft.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PresenceGateway } from '../presence/presence.gateway';

/**
 * MicrosoftNotificationWorker
 * Runs every 2 minutes to:
 *  1. Send 15-minute pre-meeting reminders
 *  2. Detect status changes (Upcoming → Live → Completed) and push them
 *     via WebSocket in real-time so the calendar UI updates immediately.
 */
@Injectable()
export class MicrosoftNotificationWorker {
  private readonly logger = new Logger(MicrosoftNotificationWorker.name);

  /** Tracks the last known status per meeting per user to detect changes. */
  private meetingStatusCache = new Map<string, string>();

  /** Prevents duplicate notifications within the same calendar day. */
  private processedNotifications = new Set<string>();

  constructor(
    private readonly microsoftService: MicrosoftService,
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly presenceGateway: PresenceGateway,
  ) {}

  /** Run every 2 minutes for near-real-time status tracking. */
  @Cron('*/2 * * * *')
  async handleMeetingNotifications() {
    this.logger.debug('🔍 Scanning Microsoft Teams meetings for status changes & reminders...');

    const syncedUsers = await this.prisma.user.findMany({
      where: { isMicrosoftSynced: true },
      select: { id: true, name: true },
    });

    for (const user of syncedUsers) {
      try {
        const now = new Date();

        // Fetch a 4-hour window: 1 hour in the past (catch recently-started meetings)
        // and 3 hours in the future (catch upcoming reminders)
        const windowStart = new Date(now.getTime() - 60 * 60000);
        const windowEnd   = new Date(now.getTime() + 3 * 60 * 60000);

        const events = await this.microsoftService.getCalendarEvents(
          user.id,
          windowStart.toISOString(),
          windowEnd.toISOString(),
        );

        for (const event of events) {
          if (!event.isTeams) continue;

          const startTime = new Date(event.start);
          const diffMinutes = Math.round((startTime.getTime() - now.getTime()) / 60000);

          // ── 1. 15-minute reminder (fire once, between 14 and 16 minutes before) ──
          if (diffMinutes >= 14 && diffMinutes <= 16) {
            await this.sendNotificationAndPush(user.id, event, 'REMINDER',
              `📅 Meeting in 15 minutes: "${event.title}"`,
              `Your Teams meeting starts at ${new Date(event.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. Time to get ready!`);
          }

          // ── 2. Meeting-started notification (between -1 and +2 minutes) ──
          if (diffMinutes >= -1 && diffMinutes <= 2) {
            await this.sendNotificationAndPush(user.id, event, 'STARTED',
              `🎬 Meeting Starting Now: "${event.title}"`,
              `Your Teams meeting is starting now. Join using the link in the meeting details.`);
          }

          // ── 3. Status-change detection & real-time push ──
          const cacheKey = `${user.id}-${event.id}`;
          const previousStatus = this.meetingStatusCache.get(cacheKey);
          if (previousStatus !== event.status) {
            this.meetingStatusCache.set(cacheKey, event.status);

            if (previousStatus !== undefined) {
              // Status actually changed — push a live calendar refresh event via WS
              this.presenceGateway.sendNotificationToUser(user.id, {
                type: 'MICROSOFT_STATUS_CHANGE',
                eventId: event.id,
                previousStatus,
                currentStatus: event.status,
                title: event.title,
              });
              this.logger.log(`📡 Status change pushed: ${event.title} [${previousStatus} → ${event.status}] for user ${user.id}`);

              // Also store a DB notification for completed meetings
              if (event.status === 'Completed') {
                await this.sendNotificationAndPush(user.id, event, 'COMPLETED',
                  `✅ Meeting Ended: "${event.title}"`,
                  `Your Teams meeting has ended. View the transcript and AI summary in the calendar.`);
              }
            }
          }
        }
      } catch (error) {
        this.logger.error(`Error processing notifications for user ${user.id}: ${error.message}`);
      }
    }

    // Daily cleanup of in-memory sets to prevent unbounded growth
    if (new Date().getHours() === 0 && new Date().getMinutes() < 2) {
      this.processedNotifications.clear();
      this.meetingStatusCache.clear();
      this.logger.log('🧹 Daily cleanup of notification caches done.');
    }
  }

  /**
   * Creates a DB notification and immediately pushes it to the user
   * via WebSocket so the NotificationBell updates in real-time.
   */
  private async sendNotificationAndPush(
    userId: string,
    event: any,
    type: string,
    title: string,
    message: string,
  ) {
    const notificationKey = `${userId}-${event.id}-${type}-${new Date().toDateString()}`;
    if (this.processedNotifications.has(notificationKey)) return;
    this.processedNotifications.add(notificationKey);

    const notification = await this.notificationsService.createNotification({
      userId,
      type: 'MICROSOFT_MEETING',
      title,
      message,
      actionUrl: `/meetings/${event.id}`,
    });

    // 🚀 Real-time push via WebSocket — no waiting for polling
    this.presenceGateway.sendNotificationToUser(userId, {
      ...notification,
      type: 'MICROSOFT_MEETING',
      meetingType: type,
    });

    this.logger.log(`✅ Notification (${type}) sent + pushed via WS for meeting "${event.title}" → user ${userId}`);
  }
}
