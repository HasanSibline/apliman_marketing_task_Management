import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { Client } from '@microsoft/microsoft-graph-client';
import 'isomorphic-fetch';
import axios from 'axios';

@Injectable()
export class MicrosoftService {
  private readonly logger = new Logger(MicrosoftService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
  ) { }

  private get clientCredentials() {
    return {
      clientId: this.configService.get<string>('MS_CLIENT_ID'),
      clientSecret: this.configService.get<string>('MS_CLIENT_SECRET'),
      tenantId: this.configService.get<string>('MS_TENANT_ID'),
      redirectUri: this.configService.get<string>('MS_REDIRECT_URI')?.trim(),
    };
  }

  getAuthUrl() {
    const { clientId, redirectUri, tenantId } = this.clientCredentials;
    const scopes = [
      'offline_access',
      'openid',
      'profile',
      'User.Read',
      'Calendars.ReadWrite',
      'OnlineMeetings.Read',
      'OnlineMeetingTranscript.Read.All',
    ].join(' ');

    return `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&response_mode=query&scope=${encodeURIComponent(scopes)}&prompt=consent`;
  }

  async handleCallback(code: string, userId: string) {
    const { clientId, clientSecret, redirectUri, tenantId } = this.clientCredentials;

    try {
      const response = await axios.post(
        `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
        new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }).toString(),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      );

      const { access_token, refresh_token, expires_in } = response.data;
      const expiryDate = new Date();
      expiryDate.setSeconds(expiryDate.getSeconds() + expires_in);

      const graphClient = Client.init({
        authProvider: (done) => done(null, access_token),
      });
      const profile = await graphClient.api('/me').get();

      await this.prisma.user.update({
        where: { id: userId },
        data: {
          microsoftId: profile.id,
          microsoftAccessToken: access_token,
          microsoftRefreshToken: refresh_token,
          microsoftTokenExpiry: expiryDate,
          isMicrosoftSynced: true,
        },
      });

      return { success: true };
    } catch (error) {
      const msError = error.response?.data ? JSON.stringify(error.response.data) : error.message;
      this.logger.error('Failed to exchange Microsoft code for tokens', msError);
      throw new BadRequestException('Failed to synchronize with Microsoft: ' + msError);
    }
  }

  async getAccessToken(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.microsoftRefreshToken) {
      throw new BadRequestException('User not synchronized with Microsoft');
    }

    const now = new Date();
    if (user.microsoftTokenExpiry && user.microsoftTokenExpiry.getTime() > now.getTime() + 300000) {
      return user.microsoftAccessToken;
    }

    const { clientId, clientSecret, tenantId } = this.clientCredentials;
    try {
      const response = await axios.post(
        `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
        new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: user.microsoftRefreshToken,
          grant_type: 'refresh_token',
        }).toString(),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      );

      const { access_token, refresh_token, expires_in } = response.data;
      const expiryDate = new Date();
      expiryDate.setSeconds(expiryDate.getSeconds() + expires_in);

      await this.prisma.user.update({
        where: { id: userId },
        data: {
          microsoftAccessToken: access_token,
          microsoftRefreshToken: refresh_token || user.microsoftRefreshToken,
          microsoftTokenExpiry: expiryDate,
        },
      });

      return access_token;
    } catch (error) {
      this.logger.error('Failed to refresh Microsoft token', error.response?.data || error.message);
      throw new BadRequestException('Microsoft session expired. Please re-sync.');
    }
  }

  async getCalendarEvents(userId: string, start?: string, end?: string) {
    const accessToken = await this.getAccessToken(userId);
    const graphClient = Client.init({
      authProvider: (done) => done(null, accessToken),
    });

    const queryStart = start || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    const queryEnd = end || new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString();

    try {
      const result = await graphClient.api('/me/calendar/calendarView')
        .query({ startDateTime: queryStart, endDateTime: queryEnd })
        .header('Prefer', 'outlook.timezone="UTC"')
        .header('Cache-Control', 'no-cache, no-store, must-revalidate')
        .select('id,subject,start,end,location,isOnlineMeeting,onlineMeeting')
        .top(999)
        .get();
      
      const now = new Date();
      const nowTime = now.getTime();
      
      return result.value.map((event: any) => {
        const startObj = this.parseMsDate(event.start);
        const endObj = this.parseMsDate(event.end);
        const startTime = startObj.getTime();
        const endTime = endObj.getTime();
        
        let status = 'Upcoming';
        if (nowTime >= startTime && nowTime <= endTime) status = 'Live';
        else if (nowTime > endTime) status = 'Completed';

        return {
          id: event.id,
          title: event.subject,
          start: startObj.toISOString(),
          end: endObj.toISOString(),
          location: event.location?.displayName,
          isTeams: event.isOnlineMeeting,
          joinUrl: event.onlineMeeting?.joinUrl,
          status,
          type: 'MICROSOFT_EVENT'
        };
      });
    } catch (error) {
      this.logger.error('Failed to fetch calendar events from Graph API', error?.response?.data || error?.message);
      return [];
    }
  }

  async getMeeting(userId: string, meetingId: string) {
    const accessToken = await this.getAccessToken(userId);
    const graphClient = Client.init({
      authProvider: (done) => done(null, accessToken),
    });

    try {
      const event = await graphClient.api(`/me/calendar/events/${meetingId}`)
        .header('Prefer', 'outlook.timezone="UTC"')
        .select('id,subject,start,end,attendees,organizer,onlineMeeting').get();
      
      const startObj = this.parseMsDate(event.start);
      const endObj = this.parseMsDate(event.end);
      const now = new Date();
      const startTime = startObj.getTime();
      const endTime = endObj.getTime();
      const nowTime = now.getTime();

      let status = 'Upcoming';
      if (nowTime >= startTime && nowTime <= endTime) status = 'Live';
      else if (nowTime > endTime) status = 'Completed';

      return {
        id: event.id,
        title: event.subject,
        start: startObj.toISOString(),
        end: endObj.toISOString(),
        status,
        organizer: event.organizer?.emailAddress?.name,
        attendees: event.attendees?.map((a: any) => a.emailAddress?.name),
        isTeams: !!event.onlineMeeting,
        joinUrl: event.onlineMeeting?.joinUrl,
        type: 'MICROSOFT_EVENT'
      };
    } catch (error) {
      this.logger.error('Failed to fetch meeting details', error.message);
      return null;
    }
  }

  async getMeetingTranscript(userId: string, meetingId: string) {
    const accessToken = await this.getAccessToken(userId);
    const graphClient = Client.init({
      authProvider: (done) => done(null, accessToken),
    });

    try {
      const resolvedMeetingId = await this.resolveOnlineMeetingId(userId, meetingId, accessToken);
      if (!resolvedMeetingId) return { transcript: null, message: 'Could not resolve Teams meeting' };

      const transcripts = await graphClient.api(`/me/onlineMeetings/${resolvedMeetingId}/transcripts`).get();
      
      if (transcripts.value && transcripts.value.length > 0) {
        let fullTranscript = '';
        for (const tInfo of transcripts.value) {
            const content = await graphClient.api(`/me/onlineMeetings/${resolvedMeetingId}/transcripts/${tInfo.id}/content`)
              .query({ '$format': 'text/plain' })
              .get();
            if (content) fullTranscript += (fullTranscript ? '\n\n' : '') + content;
        }
        if (fullTranscript) return { transcript: fullTranscript };
      }

      // Fallback to meeting chat
      const meetingDetails = await graphClient.api(`/me/onlineMeetings/${resolvedMeetingId}`).get();
      const chatId = meetingDetails?.chatInfo?.threadId;
      
      if (chatId) {
          const messages = await graphClient.api(`/chats/${chatId}/messages`).top(50).get();
          if (messages.value && messages.value.length > 0) {
              const chatItems = messages.value
                  .filter((m: any) => m.messageType === 'message' && m.body?.content)
                  .reverse()
                  .map((m: any) => {
                      const from = m.from?.user?.displayName || 'Unknown';
                      const body = m.body.content.replace(/<[^>]*>?/gm, '');
                      return `${from}\n${body}`;
                  });
              
              if (chatItems.length > 0) {
                  return { transcript: chatItems.join('\n\n'), isChat: true, message: 'Synced from meeting chat' };
              }
          }
      }

      return { transcript: null, message: 'No conversation available yet.' };
    } catch (error) {
      this.logger.error(`Transcript fetch failed: ${error.message}`);
      return { transcript: null, error: error.message };
    }
  }

  private parseMsDate(dateObj: any): Date {
    if (!dateObj || !dateObj.dateTime) return new Date();
    const dt = dateObj.dateTime;
    return new Date(dt.endsWith('Z') ? dt : dt + 'Z');
  }

  private async resolveOnlineMeetingId(userId: string, meetingId: string, accessToken: string): Promise<string | null> {
    const graphClient = Client.init({ authProvider: (done) => done(null, accessToken) });

    try {
      if (meetingId.startsWith('MSow') || meetingId.length > 50) return meetingId;

      const event = await graphClient.api(`/me/calendar/events/${meetingId}`).select('onlineMeeting').get();
      if (event.onlineMeeting?.joinUrl) {
          const meetings = await graphClient.api('/me/onlineMeetings').filter(`joinWebUrl eq '${event.onlineMeeting.joinUrl}'`).get();
          if (meetings.value?.length > 0) return meetings.value[0].id;
      }
      return meetingId;
    } catch {
      return meetingId;
    }
  }

  async summarizeMeeting(userId: string, meetingId: string) {
    const { transcript, error } = await this.getMeetingTranscript(userId, meetingId);
    if (error || !transcript) throw new BadRequestException(error || 'No transcript found');

    const summary = await this.aiService.summarizeText(
        `Summarize this meeting: ${transcript.substring(0, 10000)}`,
        1000,
        userId
    );

    return { summary };
  }

  async getRecentMeetingContext(userId: string, limit: number = 3) {
    const accessToken = await this.getAccessToken(userId).catch(() => null);
    if (!accessToken) return [];

    try {
      const events = await this.getCalendarEvents(userId, 
          new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
          new Date().toISOString()
      );

      const completedMeetings = events
          .filter(e => e.status === 'Completed' || e.status === 'Live')
          .sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime())
          .slice(0, limit);

      const contextItems = [];
      for (const meeting of completedMeetings) {
          const { transcript } = await this.getMeetingTranscript(userId, meeting.id).catch(() => ({ transcript: null }));
          if (transcript) {
              contextItems.push({
                  title: meeting.title,
                  date: meeting.start,
                  transcript: transcript.substring(0, 5000)
              });
          }
      }
      return contextItems;
    } catch (error) {
      return [];
    }
  }

  async disconnect(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        microsoftId: null,
        microsoftAccessToken: null,
        microsoftRefreshToken: null,
        microsoftTokenExpiry: null,
        isMicrosoftSynced: false,
      },
    });
    return { success: true };
  }
}
