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
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        },
      );

      const { access_token, refresh_token, expires_in } = response.data;
      const expiryDate = new Date();
      expiryDate.setSeconds(expiryDate.getSeconds() + expires_in);

      // Get User Profile to get their Microsoft ID
      const graphClient = Client.init({
        authProvider: (done) => done(null, access_token),
      });
      const profile = await graphClient.api('/me').get();

      // Update User in DB
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
      this.logger.error('Failed to exchange Microsoft code for tokens', error.response?.data || error.message);
      throw new BadRequestException('Failed to synchronize with Microsoft');
    }
  }

  async getAccessToken(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.microsoftRefreshToken) {
      throw new BadRequestException('User not synchronized with Microsoft');
    }

    // Check if token is expired (with 5-minute buffer)
    const now = new Date();
    if (user.microsoftTokenExpiry && user.microsoftTokenExpiry.getTime() > now.getTime() + 300000) {
      return user.microsoftAccessToken;
    }

    // Refresh Token
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
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        },
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

    let query = graphClient.api('/me/calendar/events').select('id,subject,start,end,location,isOnlineMeeting,onlineMeeting');
    
    if (start && end) {
      query = query.filter(`start/dateTime ge '${start}' and end/dateTime le '${end}'`);
    }

    const result = await query.get();
    return result.value.map((event: any) => ({
      id: event.id,
      title: event.subject,
      start: event.start.dateTime,
      end: event.end.dateTime,
      location: event.location?.displayName,
      isTeams: event.isOnlineMeeting,
      joinUrl: event.onlineMeeting?.joinUrl,
      type: 'MICROSOFT_EVENT'
    }));
  }

  async getMeetingTranscript(userId: string, meetingId: string) {
    const accessToken = await this.getAccessToken(userId);
    
    // We need the onlineMeeting ID. If the meetingId provided is an Event ID, 
    // we try to resolve it to an OnlineMeeting ID.
    const resolvedMeetingId = await this.resolveOnlineMeetingId(userId, meetingId, accessToken);
    
    const graphClient = Client.init({
      authProvider: (done) => done(null, accessToken),
    });

    try {
      // Fetch transcripts for the meeting
      const transcripts = await graphClient.api(`/me/onlineMeetings/${resolvedMeetingId}/transcripts`).get();
      
      if (!transcripts.value || transcripts.value.length === 0) {
        return { transcript: null, message: 'No transcript available for this meeting' };
      }

      // Get the latest transcript content
      const transcriptId = transcripts.value[0].id;
      const content = await graphClient.api(`/me/onlineMeetings/${resolvedMeetingId}/transcripts/${transcriptId}/content`).get();
      
      return { transcript: content };
    } catch (error) {
      this.logger.error('Failed to fetch transcript', error.message);
      return { transcript: null, error: error.message };
    }
  }

  /**
   * Resolves a Calendar Event ID or Join URL to an Online Meeting ID
   */
  private async resolveOnlineMeetingId(userId: string, meetingId: string, accessToken: string): Promise<string> {
    const graphClient = Client.init({
      authProvider: (done) => done(null, accessToken),
    });

    try {
      // 1. Try if it's already an OnlineMeeting ID (they usually contain Base64-like strings)
      if (meetingId.includes('MSow')) return meetingId;

      // 2. Try fetching the event to get the joinUrl
      const event = await graphClient.api(`/me/calendar/events/${meetingId}`).select('onlineMeeting,subject').get();
      
      if (event.onlineMeeting?.joinUrl) {
          const joinUrl = event.onlineMeeting.joinUrl;
          // Search for the online meeting by joinUrl
          const meetings = await graphClient.api('/me/onlineMeetings').filter(`joinWebUrl eq '${joinUrl}'`).get();
          if (meetings.value?.length > 0) {
              return meetings.value[0].id;
          }
      }
      
      return meetingId; // Fallback
    } catch (error) {
      return meetingId;
    }
  }

  async summarizeMeeting(userId: string, meetingId: string) {
    const { transcript, error } = await this.getMeetingTranscript(userId, meetingId);
    
    if (error || !transcript) {
        throw new BadRequestException(error || 'No transcript found to summarize');
    }

    // Call AI Service to summarize
    // We use a custom prompt for meeting intelligence
    const summary = await this.aiService.summarizeText(
        `Please provide a professional summary of this meeting transcript. 
        Include:
        1. Key Decisions Made
        2. Main Themes
        3. Sentiment/Atmosphere
        4. Action Items (List them clearly)
        
        Transcript: ${transcript}`,
        1000,
        userId
    );

    return { summary };
  }

  async getRecentMeetingContext(userId: string, limit: number = 3) {
    const accessToken = await this.getAccessToken(userId).catch(() => null);
    if (!accessToken) return [];

    const graphClient = Client.init({
      authProvider: (done) => done(null, accessToken),
    });

    try {
      const events = await graphClient.api('/me/calendar/events')
        .filter('isOnlineMeeting eq true')
        .orderby('start/dateTime desc')
        .top(limit)
        .select('id,subject,start,onlineMeeting')
        .get();

      const contextItems = [];
      for (const event of events.value) {
          const { transcript } = await this.getMeetingTranscript(userId, event.id).catch(() => ({ transcript: null }));
          if (transcript) {
              contextItems.push({
                  title: event.subject,
                  date: event.start.dateTime,
                  transcript: transcript.substring(0, 2000) // Limit context size
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
