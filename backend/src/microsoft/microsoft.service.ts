import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { Client } from '@microsoft/microsoft-graph-client';
import 'isomorphic-fetch';
import axios from 'axios';

interface MicrosoftAttendee {
  emailAddress?: { name?: string; address?: string };
  status?: { response?: string };
  type?: string;
}

interface MicrosoftEvent {
  id: string;
  subject?: string;
  start?: { dateTime: string; timeZone?: string };
  end?: { dateTime: string; timeZone?: string };
  location?: { displayName: string };
  isOnlineMeeting?: boolean;
  onlineMeeting?: { joinUrl: string };
  organizer?: { emailAddress: { name: string; address: string } };
  attendees?: MicrosoftAttendee[];
}

@Injectable()
export class MicrosoftService {
  private readonly logger = new Logger(MicrosoftService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
  ) { }

  private get config() {
    return {
      clientId: this.configService.get<string>('MS_CLIENT_ID'),
      clientSecret: this.configService.get<string>('MS_CLIENT_SECRET'),
      tenantId: this.configService.get<string>('MS_TENANT_ID'),
      redirectUri: this.configService.get<string>('MS_REDIRECT_URI')?.trim(),
    };
  }

  getAuthUrl() {
    const { clientId, redirectUri, tenantId } = this.config;
    const scopes = [
      'offline_access',
      'openid',
      'profile',
      'User.Read',
      'Calendars.ReadWrite',
      'OnlineMeetings.Read',
      'OnlineMeetingTranscript.Read.All',
      'Chat.Read',
    ].join(' ');

    return `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&response_mode=query&scope=${encodeURIComponent(scopes)}&prompt=consent`;
  }

  async handleCallback(code: string, userId: string) {
    const { clientId, clientSecret, redirectUri, tenantId } = this.config;

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
    } catch (error: any) {
      const msg = error.response?.data?.error_description || error.message;
      this.logger.error('MS Callback Error:', msg);
      throw new BadRequestException('Microsoft sync failed: ' + msg);
    }
  }

  async getAccessToken(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.microsoftRefreshToken) throw new BadRequestException('Not synced with Microsoft');

    const now = new Date();
    if (user.microsoftTokenExpiry && user.microsoftTokenExpiry.getTime() > now.getTime() + 600000) {
      if (user.microsoftAccessToken) return user.microsoftAccessToken;
    }

    const { clientId, clientSecret, tenantId } = this.config;
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
    } catch (error: any) {
      this.logger.error('Token Refresh Error:', error.response?.data || error.message);
      throw new BadRequestException('Microsoft session expired. Please re-sync.');
    }
  }

  async getCalendarEvents(userId: string, start?: string, end?: string) {
    const token = await this.getAccessToken(userId);
    const graphClient = Client.init({ authProvider: (done) => done(null, token) });

    try {
      const queryStart = start || new Date(Date.now() - 30 * 24 * 3600000).toISOString();
      const queryEnd = end || new Date(Date.now() + 30 * 24 * 3600000).toISOString();

      this.logger.log(`Major Sync: Scanning ALL calendars for user ${userId}`);

      // 1. Get all calendars for the user
      const calendarsRes = await graphClient.api('/me/calendars').select('id,name').get();
      const calendars = calendarsRes.value || [];
      
      let allEvents: any[] = [];

      // 2. Fetch events from EACH calendar in parallel
      await Promise.all(calendars.map(async (cal: any) => {
        try {
          const res = await graphClient.api(`/me/calendars/${cal.id}/calendarView`)
            .query({ startDateTime: queryStart, endDateTime: queryEnd })
            .header('Prefer', 'outlook.timezone="UTC"')
            .top(100)
            .get();
          
          if (res.value) {
            allEvents = [...allEvents, ...res.value];
          }
        } catch (err: any) {
          this.logger.warn(`Failed to fetch from calendar ${cal.name}: ${err.message}`);
        }
      }));

      // 3. Fallback to /me/events if no calendars returned anything (safety)
      if (allEvents.length === 0) {
        const fallback = await graphClient.api('/me/events')
          .header('Prefer', 'outlook.timezone="UTC"')
          .top(50)
          .get();
        allEvents = fallback.value || [];
      }

      // Deduplicate by ID just in case
      const uniqueEvents = Array.from(new Map(allEvents.map(e => [e.id, e])).values());

      this.logger.log(`Found total ${uniqueEvents.length} unique Microsoft events across ${calendars.length} calendars for ${userId}`);
      return uniqueEvents.map((e: MicrosoftEvent) => this.mapGraphEvent(e));
    } catch (error: any) {
      const msError = error.response?.data?.error?.message || error.message;
      this.logger.error('Fetch All Events Error:', msError);
      return [];
    }
  }

  async getMeeting(userId: string, meetingId: string) {
    const token = await this.getAccessToken(userId);
    const graphClient = Client.init({ authProvider: (done) => done(null, token) });

    try {
      const event = await graphClient.api(`/me/calendar/events/${meetingId}`)
        .header('Prefer', 'outlook.timezone="UTC"')
        .select('id,subject,start,end,organizer,attendees,onlineMeeting,isOnlineMeeting')
        .get();
      
      return this.mapGraphEvent(event);
    } catch (error: any) {
      this.logger.error('Get Meeting Error:', error.message);
      throw new BadRequestException('Could not find meeting details');
    }
  }

  async getMeetingTranscript(userId: string, meetingId: string) {
    const token = await this.getAccessToken(userId);
    const graphClient = Client.init({ authProvider: (done) => done(null, token) });

    try {
      // 1. Resolve Online Meeting ID
      let onlineMeetingId = null;
      
      // Check if meetingId is already an OnlineMeeting ID
      if (meetingId.includes('MSow')) {
        onlineMeetingId = meetingId;
      } else {
        const event = await graphClient.api(`/me/calendar/events/${meetingId}`).select('onlineMeeting').get();
        if (event.onlineMeeting?.joinUrl) {
          // Search for the online meeting by joinUrl
          const meetings = await graphClient.api('/me/onlineMeetings')
            .filter(`joinWebUrl eq '${event.onlineMeeting.joinUrl}'`)
            .get();
          if (meetings.value?.length > 0) {
            onlineMeetingId = meetings.value[0].id;
          }
        }
      }

      if (!onlineMeetingId) {
        return { transcript: null, message: 'This is not a registered Teams meeting.' };
      }

      // 2. Fetch Transcripts
      const transcriptsRes = await graphClient.api(`/me/onlineMeetings/${onlineMeetingId}/transcripts`).get();
      
      if (transcriptsRes.value && transcriptsRes.value.length > 0) {
        let combinedTranscript = '';
        for (const t of transcriptsRes.value) {
          const content = await graphClient.api(`/me/onlineMeetings/${onlineMeetingId}/transcripts/${t.id}/content`)
            .query({ '$format': 'text/plain' })
            .get();
          if (content) combinedTranscript += (combinedTranscript ? '\n\n' : '') + content;
        }
        if (combinedTranscript) return { transcript: combinedTranscript };
      }

      // 3. Fallback: Chat Messages
      const meetingData = await graphClient.api(`/me/onlineMeetings/${onlineMeetingId}`).get();
      if (meetingData.chatInfo?.threadId) {
        const messages = await graphClient.api(`/chats/${meetingData.chatInfo.threadId}/messages`)
          .top(50)
          .get();
        
        const chatContent = (messages.value || [])
          .filter((m: any) => m.messageType === 'message' && m.body?.content)
          .map((m: any) => `${m.from?.user?.displayName || 'Unknown'}\n${m.body.content.replace(/<[^>]*>?/gm, '')}`)
          .reverse()
          .join('\n\n');

        if (chatContent) return { transcript: chatContent, isChat: true };
      }

      return { transcript: null, message: 'No transcript or chat history found for this meeting.' };
    } catch (error: any) {
      this.logger.error('Transcript Fetch Error:', error.message);
      return { transcript: null, error: error.message };
    }
  }

  async summarizeMeeting(userId: string, meetingId: string) {
    const { transcript, error } = await this.getMeetingTranscript(userId, meetingId);
    if (!transcript) throw new BadRequestException(error || 'No transcript available to summarize');

    const prompt = `Please provide a concise but comprehensive summary of this meeting transcript. Include key decisions and action items:\n\n${transcript.substring(0, 15000)}`;
    const summary = await this.aiService.summarizeText(prompt, 2000, userId);
    return { summary };
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

  async getRecentMeetingContext(userId: string, limit: number = 3) {
    try {
      const events = await this.getCalendarEvents(userId, 
          new Date(Date.now() - 7 * 24 * 3600000).toISOString(),
          new Date().toISOString()
      );

      const pastMeetings = events
          .filter((e: any) => e.status === 'Completed' || e.status === 'Live')
          .sort((a: any, b: any) => new Date(b.start).getTime() - new Date(a.start).getTime())
          .slice(0, limit);

      const context = [];
      for (const m of pastMeetings) {
          const { transcript } = await this.getMeetingTranscript(userId, m.id).catch(() => ({ transcript: null }));
          if (transcript) {
              context.push({
                  title: m.title,
                  date: m.start,
                  transcript: transcript.substring(0, 3000)
              });
          }
      }
      return context;
    } catch (error: any) {
      this.logger.error('Recent Meeting Context Error:', error.message);
      return [];
    }
  }

  private mapGraphEvent(event: MicrosoftEvent) {
    const startStr = event.start?.dateTime;
    const endStr = event.end?.dateTime;
    
    // Ensure ISO format with Z for UTC
    const start = new Date(startStr ? (startStr.endsWith('Z') ? startStr : startStr + 'Z') : Date.now());
    const end = new Date(endStr ? (endStr.endsWith('Z') ? endStr : endStr + 'Z') : Date.now());
    const now = new Date();

    let status = 'Upcoming';
    if (now >= start && now <= end) status = 'Live';
    else if (now > end) status = 'Completed';

    return {
      id: event.id,
      title: event.subject || 'Meeting',
      subject: event.subject || 'Meeting', // Compatibility
      start: start.toISOString(),
      end: end.toISOString(),
      dueDate: start.toISOString(), // Calendar expects this
      location: event.location?.displayName || 'Teams Meeting',
      isTeams: event.isOnlineMeeting || !!event.onlineMeeting,
      joinUrl: event.onlineMeeting?.joinUrl,
      status,
      type: 'MICROSOFT_EVENT' as any,
      priority: 3, // Premium Amber color for meetings
      organizer: event.organizer?.emailAddress?.name,
      attendees: (event.attendees || []).map((a: MicrosoftAttendee) => ({
        name: a.emailAddress?.name || 'Unknown',
        email: a.emailAddress?.address,
        status: a.status?.response || 'none',
        type: a.type || 'required'
      }))
    };
  }
}
