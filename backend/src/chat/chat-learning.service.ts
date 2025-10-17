import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { ChatService } from './chat.service';

@Injectable()
export class ChatLearningService {
  private readonly logger = new Logger(ChatLearningService.name);
  private isLearning = false;

  constructor(
    private prisma: PrismaService,
    private chatService: ChatService,
  ) {}

  /**
   * Automatically learn from task history for active users
   * Runs daily at 2 AM
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async scheduledLearning() {
    if (this.isLearning) {
      this.logger.log('Learning already in progress, skipping...');
      return;
    }

    this.isLearning = true;
    this.logger.log('Starting scheduled learning from task history...');

    try {
      // Get users who have been active in the last 7 days
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const activeUsers = await this.prisma.user.findMany({
        where: {
          lastActiveAt: {
            gte: sevenDaysAgo,
          },
        },
        select: {
          id: true,
          name: true,
        },
      });

      this.logger.log(`Found ${activeUsers.length} active users to learn from`);

      // Learn from each user's history
      let successCount = 0;
      for (const user of activeUsers) {
        try {
          const learned = await this.chatService.learnFromTaskHistory(user.id);
          if (learned) {
            successCount++;
            this.logger.log(`✅ Learned from user ${user.name}'s task history`);
          }
        } catch (error) {
          this.logger.error(`Failed to learn from user ${user.name}: ${error.message}`);
        }

        // Small delay to avoid overwhelming the AI service
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      this.logger.log(`✅ Scheduled learning complete: ${successCount}/${activeUsers.length} users processed`);
    } catch (error) {
      this.logger.error(`Scheduled learning failed: ${error.message}`);
    } finally {
      this.isLearning = false;
    }
  }

  /**
   * Learn from recently completed tasks
   * Runs every 6 hours
   */
  @Cron(CronExpression.EVERY_6_HOURS)
  async learnFromRecentCompletions() {
    if (this.isLearning) {
      return;
    }

    this.logger.log('Checking for recently completed tasks...');

    try {
      // Get tasks completed in the last 6 hours
      const sixHoursAgo = new Date();
      sixHoursAgo.setHours(sixHoursAgo.getHours() - 6);

      const recentlyCompletedTasks = await this.prisma.task.findMany({
        where: {
          completedAt: {
            gte: sixHoursAgo,
          },
        },
        select: {
          id: true,
          createdById: true,
          assignedToId: true,
          assignments: {
            select: {
              userId: true,
            },
          },
        },
      });

      // Get unique user IDs from these tasks
      const userIds = new Set<string>();
      recentlyCompletedTasks.forEach(task => {
        if (task.createdById) userIds.add(task.createdById);
        if (task.assignedToId) userIds.add(task.assignedToId);
        task.assignments.forEach(a => userIds.add(a.userId));
      });

      if (userIds.size > 0) {
        this.logger.log(`Learning from ${userIds.size} users with recent completions...`);
        
        for (const userId of userIds) {
          try {
            await this.chatService.learnFromTaskHistory(userId);
          } catch (error) {
            this.logger.error(`Failed to learn from user ${userId}: ${error.message}`);
          }
          
          // Small delay
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    } catch (error) {
      this.logger.error(`Recent completions learning failed: ${error.message}`);
    }
  }

  /**
   * Manually trigger learning for a specific user
   */
  async triggerManualLearning(userId: string): Promise<any> {
    this.logger.log(`Manual learning triggered for user ${userId}`);
    return await this.chatService.learnFromTaskHistory(userId);
  }
}

