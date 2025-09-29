import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { UseGuards } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { PresenceService } from './presence.service';
import { UserStatus } from '../types/prisma';

interface AuthenticatedSocket extends Socket {
  userId?: string;
}

@WebSocketGateway({
  cors: {
    origin: ['http://localhost:3000', 'http://localhost:5173'],
    credentials: true,
  },
  namespace: '/presence',
})
export class PresenceGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly presenceService: PresenceService,
    private readonly jwtService: JwtService,
  ) {}

  async handleConnection(client: AuthenticatedSocket) {
    try {
      // Extract token from handshake
      const token = (client as any).handshake?.auth?.token || (client as any).handshake?.headers?.authorization?.replace('Bearer ', '');
      
      if (!token) {
        (client as any).disconnect();
        return;
      }

      // Verify JWT token
      const payload = this.jwtService.verify(token);
      client.userId = payload.sub;

      // Set user as online
      const presence = await this.presenceService.setUserOnline(client.userId!, (client as any).id);
      
      // Join user to their own room for targeted messages
      (client as any).join(`user:${client.userId}`);
      
      // Broadcast presence update to all clients
      this.server.emit('presence:update', presence);
      
      console.log(`User ${client.userId} connected with socket ${(client as any).id}`);
    } catch (error) {
      console.error('WebSocket authentication error:', error);
      (client as any).disconnect();
    }
  }

  async handleDisconnect(client: AuthenticatedSocket) {
    if (client.userId) {
      const presence = await this.presenceService.setUserOffline(client.userId);
      
      // Broadcast presence update to all clients
      this.server.emit('presence:update', presence);
      
      console.log(`User ${client.userId} disconnected`);
    }
  }

  @SubscribeMessage('presence:activity')
  async handleActivity(@ConnectedSocket() client: AuthenticatedSocket) {
    if (client.userId) {
      await this.presenceService.updateUserActivity(client.userId);
      
      const presence = this.presenceService.getUserPresence(client.userId);
      this.server.emit('presence:update', presence);
    }
  }

  @SubscribeMessage('presence:set_status')
  async handleSetStatus(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { status: UserStatus },
  ) {
    if (!client.userId) return;

    let presence;
    
    switch (data.status) {
      case UserStatus.ACTIVE:
        await this.presenceService.updateUserActivity(client.userId);
        presence = this.presenceService.getUserPresence(client.userId);
        break;
      case UserStatus.AWAY:
        presence = await this.presenceService.setUserAway(client.userId);
        break;
      case UserStatus.OFFLINE:
        presence = await this.presenceService.setUserOffline(client.userId);
        (client as any).disconnect();
        break;
      default:
        return;
    }

    this.server.emit('presence:update', presence);
  }

  @SubscribeMessage('presence:get_team')
  async handleGetTeamPresence(@ConnectedSocket() client: AuthenticatedSocket) {
    if (client.userId) {
      const teamPresence = await this.presenceService.getTeamPresence();
      (client as any).emit('presence:team', teamPresence);
    }
  }

  // Method to broadcast presence updates from other parts of the application
  broadcastPresenceUpdate(presence: any) {
    this.server.emit('presence:update', presence);
  }

  // Method to send notifications to specific users
  sendNotificationToUser(userId: string, notification: any) {
    this.server.to(`user:${userId}`).emit('notification', notification);
  }

  // Method to broadcast system-wide notifications
  broadcastNotification(notification: any) {
    this.server.emit('notification', notification);
  }
}
