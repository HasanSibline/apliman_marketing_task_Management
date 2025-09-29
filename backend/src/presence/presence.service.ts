import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { UserStatus } from '../types/prisma';

@Injectable()
export class PresenceService {
  private readonly userSessions = new Map<string, { 
    socketId: string; 
    lastActivity: Date; 
    status: UserStatus;
  }>();

  constructor(private readonly prisma: PrismaService) {}

  async setUserOnline(userId: string, socketId: string) {
    this.userSessions.set(userId, {
      socketId,
      lastActivity: new Date(),
      status: UserStatus.ACTIVE,
    });

    await this.updateUserStatus(userId, UserStatus.ACTIVE);
    return this.getUserPresence(userId);
  }

  async setUserOffline(userId: string) {
    this.userSessions.delete(userId);
    await this.updateUserStatus(userId, UserStatus.OFFLINE);
    return this.getUserPresence(userId);
  }

  async setUserAway(userId: string) {
    const session = this.userSessions.get(userId);
    if (session) {
      session.status = UserStatus.AWAY;
      session.lastActivity = new Date();
      this.userSessions.set(userId, session);
    }

    await this.updateUserStatus(userId, UserStatus.AWAY);
    return this.getUserPresence(userId);
  }

  async updateUserActivity(userId: string) {
    const session = this.userSessions.get(userId);
    if (session) {
      session.lastActivity = new Date();
      if (session.status === UserStatus.AWAY) {
        session.status = UserStatus.ACTIVE;
        await this.updateUserStatus(userId, UserStatus.ACTIVE);
      }
      this.userSessions.set(userId, session);
    }
  }

  getUserPresence(userId: string) {
    const session = this.userSessions.get(userId);
    return {
      userId,
      status: session?.status || UserStatus.OFFLINE,
      lastActivity: session?.lastActivity || null,
      isOnline: !!session,
    };
  }

  getAllUserPresences() {
    const presences = [];
    for (const [userId, session] of this.userSessions.entries()) {
      presences.push({
        userId,
        status: session.status,
        lastActivity: session.lastActivity,
        isOnline: true,
      });
    }
    return presences;
  }

  async getTeamPresence() {
    const users = await this.prisma.user.findMany({
      where: {
        status: { not: UserStatus.RETIRED },
      },
      select: {
        id: true,
        name: true,
        email: true,
        position: true,
        status: true,
        lastActiveAt: true,
      },
    });

    return users.map(user => {
      const session = this.userSessions.get(user.id);
      return {
        ...user,
        isOnline: !!session,
        currentStatus: session?.status || user.status,
        lastActivity: session?.lastActivity || user.lastActiveAt,
      };
    });
  }

  // Cron job to check for inactive users and mark them as away
  @Cron(CronExpression.EVERY_MINUTE)
  async checkInactiveUsers() {
    const now = new Date();
    const awayThreshold = 5 * 60 * 1000; // 5 minutes
    const offlineThreshold = 30 * 60 * 1000; // 30 minutes

    for (const [userId, session] of this.userSessions.entries()) {
      const timeSinceActivity = now.getTime() - session.lastActivity.getTime();

      if (timeSinceActivity > offlineThreshold) {
        // Mark as offline and remove from active sessions
        await this.setUserOffline(userId);
      } else if (timeSinceActivity > awayThreshold && session.status === UserStatus.ACTIVE) {
        // Mark as away
        await this.setUserAway(userId);
      }
    }
  }

  private async updateUserStatus(userId: string, status: UserStatus) {
    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          status,
          lastActiveAt: new Date(),
        },
      });
    } catch (error) {
      console.error(`Error updating user status for ${userId}:`, error);
    }
  }
}
