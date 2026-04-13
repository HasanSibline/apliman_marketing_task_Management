import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { Client } from '@microsoft/microsoft-graph-client';
import 'isomorphic-fetch';
import axios from 'axios';

/** 
 * AUTHORITATIVE MICROSOFT SERVICE REBUILD
 * Optimized for high-depth synchronization and 100% transcript resolution.
 */

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
      'Files.Read',        // Required for OneDrive transcript VTT file search
    ].join(' ');

    // Use 'common' endpoint so ANY Microsoft account type (personal MSA, work, school)
    // can authenticate. Using a specific tenantId would restrict auth to only accounts
    // in that Azure AD tenant and their calendarView would return empty for other accounts.
    // prompt=select_account forces the Microsoft account picker every time — critical for
    // multi-tenant apps where users' app email != their Microsoft work email.
    return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&response_mode=query&scope=${encodeURIComponent(scopes)}&prompt=select_account`;
  }

  async handleCallback(code: string, userId: string) {
    const { clientId, clientSecret, redirectUri, tenantId } = this.config;

    try {
      this.logger.log(`Handling OAuth callback for user: ${userId}`);
      const response = await axios.post(
        `https://login.microsoftonline.com/common/oauth2/v2.0/token`,
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

      const graphClient = Client.init({ authProvider: (done) => done(null, access_token) });
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
      this.logger.error('OAuth Callback Failed', msg);
      throw new BadRequestException('Microsoft Synchronization Failed: ' + msg);
    }
  }

  async getAccessToken(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.microsoftRefreshToken) throw new BadRequestException('User not synced');

    const now = new Date();
    if (user.microsoftTokenExpiry && user.microsoftTokenExpiry.getTime() > now.getTime() + 300000) {
      return user.microsoftAccessToken;
    }

    const { clientId, clientSecret, tenantId } = this.config;
    try {
      const response = await axios.post(
        `https://login.microsoftonline.com/common/oauth2/v2.0/token`,
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
      this.logger.error('Token Refresh Error', error.message);
      throw new BadRequestException('Microsoft session expired. Please re-sync.');
    }
  }

  async getCalendarEvents(userId: string, start?: string, end?: string) {
    const token = await this.getAccessToken(userId);
    const graphClient = Client.init({ authProvider: (done) => done(null, token) });

    try {
      const queryStart = start || new Date(Date.now() - 30 * 24 * 3600000).toISOString();
      const queryEnd = end || new Date(Date.now() + 30 * 24 * 3600000).toISOString();

      this.logger.log(`Major Rebuild Sync for ${userId}: ${queryStart} to ${queryEnd}`);

      // 1. Parallel fetch from BOTH authoritative endpoints (Coverage Guard)
      // calendarView is the PRIMARY source for any Teams meeting in the date window.
      // /me/events is a FALLBACK/SUPPLEMENT — used without $filter since Graph does not
      // reliably support OData filter on complex properties (start/dateTime) for this endpoint.
      const [viewRes, eventsRes] = await Promise.all([
        graphClient.api('/me/calendar/calendarView')
          .query({ startDateTime: queryStart, endDateTime: queryEnd })
          .header('Prefer', 'outlook.timezone="UTC"')
          .top(999)
          .get()
          .catch((err) => {
            this.logger.error(`calendarView FAILED: ${err?.message || err}`);
            return { value: [] };
          }),
        graphClient.api('/me/events')
          .header('Prefer', 'outlook.timezone="UTC"')
          .top(200)  // Simple cap — date range handled by calendarView above
          .get()
          .catch((err) => {
            this.logger.error(`/me/events FAILED: ${err?.message || err}`);
            return { value: [] };
          })
      ]);

      this.logger.log(`RAW results — calendarView: ${(viewRes.value || []).length}, /me/events: ${(eventsRes.value || []).length}`);


      const allEvents = [...(viewRes.value || []), ...(eventsRes.value || [])];
      const noiseKeywords = ['tax day', 'holiday', 'birthday'];
      const eventMap = new Map();

      allEvents.forEach(e => {
        if (!e.id || eventMap.has(e.id)) return;
        const subject = (e.subject || '').toLowerCase();
        if (noiseKeywords.some(kw => subject.includes(kw))) return;

        try {
          const mapped = this.mapGraphEvent(e);
          if (mapped) eventMap.set(e.id, mapped);
        } catch (err) {
          this.logger.warn(`Mapping failed for event ${e.id}`);
        }
      });

      this.logger.log(`Sync Ready: ${eventMap.size} meetings identified for ${userId}`);
      return Array.from(eventMap.values());
    } catch (error: any) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error('Fetch Event List Failed', error.message);
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
      
      const mapped = this.mapGraphEvent(event);
      // Inject organizer into attendees (Graph API excludes organizer from attendees array)
      if (event.organizer?.emailAddress) {
        const orgEmail = event.organizer.emailAddress.address;
        const alreadyListed = (mapped.attendees || []).some((a: any) => a.email === orgEmail);
        if (!alreadyListed) {
          mapped.attendees = [{
            name: event.organizer.emailAddress.name || 'Organizer',
            email: orgEmail,
            status: 'organizer',
            type: 'organizer'
          }, ...(mapped.attendees || [])];
        }
      }
      return mapped;
    } catch (error: any) {
      this.logger.error('Get Meeting Logic Error', error.message);
      throw new BadRequestException('Could not find meeting details');
    }
  }

  async getMeetingTranscript(userId: string, meetingId: string) {
    const token = await this.getAccessToken(userId);
    const graphClient = Client.init({ authProvider: (done) => done(null, token) });

    try {
      let onlineMeetingId: string | null = null;
      let event: any = null;

      // 1. Resolve the Online Meeting ID
      if (meetingId.startsWith('MSo') || meetingId.includes('MSow')) {
        onlineMeetingId = meetingId;
      } else {
        try {
          event = await graphClient
            .api(`/me/calendar/events/${meetingId}`)
            .select('onlineMeeting,isOnlineMeeting,subject')
            .get();

          this.logger.log(`Transcript resolve: isOnlineMeeting=${event.isOnlineMeeting}, hasJoinUrl=${!!event.onlineMeeting?.joinUrl}`);

          if (!event.isOnlineMeeting || !event.onlineMeeting?.joinUrl) {
            return { transcript: null, message: 'This event is not a Teams online meeting.' };
          }

          // Strategy 1: OData filter by joinWebUrl — use axios directly (NOT Graph SDK)
          // because the SDK double-encodes already-encoded chars: %3a becomes %253a,
          // causing the exact-match filter to fail.
          const joinUrl = event.onlineMeeting.joinUrl;
          try {
            const ft = await this.getAccessToken(userId);
            const rawFilter = encodeURIComponent(`joinWebUrl eq '${joinUrl.replace(/'/g, "''")}'`);
            const fResp = await axios.get(
              `https://graph.microsoft.com/v1.0/me/onlineMeetings?$filter=${rawFilter}`,
              { headers: { Authorization: `Bearer ${ft}` } }
            ).catch(() => ({ data: { value: [] } }));
            if (fResp.data?.value?.length > 0) {
              onlineMeetingId = fResp.data.value[0].id;
              this.logger.log(`Transcript: resolved via raw joinWebUrl axios filter`);
            } else {
              this.logger.log(`Transcript: joinWebUrl filter returned 0 results`);
            }
          } catch (fe: any) { this.logger.warn(`JoinWebUrl filter error: ${fe.message}`); }

          // Strategy 2: Match by start time (robust fallback — OData filter fails when URL
          // encoding differs between calendar event joinUrl and onlineMeeting joinWebUrl)
          if (!onlineMeetingId) {
            try {
              const eventStart = new Date(
                event.start?.dateTime
                  ? (event.start.dateTime.endsWith('Z') ? event.start.dateTime : event.start.dateTime + 'Z')
                  : Date.now()
              ).getTime();

              const allMeetings = await graphClient
                .api('/me/onlineMeetings')
                .top(50)
                .get()
                .catch(() => ({ value: [] }));

              const match = (allMeetings.value || []).find((m: any) => {
                if (!m.startDateTime) return false;
                const diff = Math.abs(new Date(m.startDateTime).getTime() - eventStart);
                return diff < 5 * 60 * 1000; // within 5 minutes of the scheduled start
              });

              if (match) {
                onlineMeetingId = match.id;
                this.logger.log(`Transcript: resolved via start-time match (diff ok)`);
              }
            } catch (matchErr: any) {
              this.logger.warn(`Start-time match failed: ${matchErr.message}`);
            }
          }
        } catch (err: any) {
          this.logger.warn(`onlineMeetingId resolution failed: ${err.message}`);
        }
      }

      if (!onlineMeetingId) {
        return { transcript: null, message: 'Could not find the Teams meeting record. It may not have been organized via Teams.' };
      }

      // 2. Fetch transcripts — try v1 then beta (beta often indexes faster)
      const tryFetchTranscripts = async (version: string) => {
        const baseUrl = `https://graph.microsoft.com/${version}/me/onlineMeetings/${onlineMeetingId}/transcripts`;
        const token = await this.getAccessToken(userId);
        const res = await axios.get(baseUrl, {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        });
        return res.data?.value || [];
      };

      let transcriptList: any[] = [];
      try {
        transcriptList = await tryFetchTranscripts('v1.0');
        this.logger.log(`Transcripts v1.0: ${transcriptList.length} found`);
        if (transcriptList.length === 0) {
          transcriptList = await tryFetchTranscripts('beta');
          this.logger.log(`Transcripts beta: ${transcriptList.length} found`);
        }
      } catch (transcriptErr: any) {
        this.logger.warn(`Transcript fetch failed: ${transcriptErr.response?.data?.error?.message || transcriptErr.message}`);
      }

      if (transcriptList.length > 0) {
        let combinedTranscript = '';
        for (const t of transcriptList) {
          // Try text/vtt first (most reliable), then text/plain as fallback
          for (const fmt of ['text/vtt', 'text/plain']) {
            try {
              const token = await this.getAccessToken(userId);
              const contentRes = await axios.get(
                `https://graph.microsoft.com/v1.0/me/onlineMeetings/${onlineMeetingId}/transcripts/${t.id}/content?$format=${fmt}`,
                { headers: { Authorization: `Bearer ${token}` }, responseType: 'text' }
              );
              if (contentRes.data) {
                this.logger.log(`Transcript content fetched via ${fmt}, length=${String(contentRes.data).length}`);
                // Parse VTT format into readable text
                const parsed = fmt === 'text/vtt' ? this.parseVTT(contentRes.data) : contentRes.data;
                if (parsed) combinedTranscript += (combinedTranscript ? '\n\n' : '') + parsed;
                break; // success — don't try next format
              }
            } catch (ce: any) {
              this.logger.warn(`Content fetch (${fmt}) failed: ${ce.response?.status} ${ce.response?.data?.error?.message || ce.message}`);
            }
          }
        }
        if (combinedTranscript) return { transcript: combinedTranscript };
      }

      // 3. Fallback: Teams chat messages
      try {
        const meetingData = await graphClient.api(`/me/onlineMeetings/${onlineMeetingId}`).get();
        if (meetingData.chatInfo?.threadId) {
          const messages = await graphClient
            .api(`/chats/${meetingData.chatInfo.threadId}/messages`)
            .top(50)
            .get();
          const chatContent = (messages.value || [])
            .filter((m: any) => m.messageType === 'message' && m.body?.content)
            .map((m: any) => `${m.from?.user?.displayName || 'Unknown'}: ${m.body.content.replace(/<[^>]*>?/gm, '')}`)
            .reverse()
            .join('\n\n');
          if (chatContent) return { transcript: chatContent, isChat: true };
        }
      } catch (chatErr: any) {
        this.logger.warn(`Chat fallback failed: ${chatErr.message}`);
      }

      // 4. OneDrive VTT file fallback — Teams saves transcript as .vtt in OneDrive
      //    This is often available much sooner than the Graph transcripts API
      try {
        const subject = event ? event.subject || '' : meetingId;
        this.logger.log(`Searching OneDrive for .vtt transcript: "${subject}"`);

        // Teams saves recordings + transcripts to Documents/Recordings in the user's OneDrive.
        // List that folder directly instead of doing a fuzzy search (much more reliable).
        const driveToken = await this.getAccessToken(userId);
        const foldersToCheck = [
          '/me/drive/root:/Documents/Recordings:/children',
          '/me/drive/root:/Recordings:/children',
        ];

        let allDriveFiles: any[] = [];
        for (const folderPath of foldersToCheck) {
          const folderRes = await axios.get(
            `https://graph.microsoft.com/v1.0${folderPath}?$select=name,id,file,createdDateTime,size&$top=50`,
            { headers: { Authorization: `Bearer ${driveToken}` } }
          ).catch(() => ({ data: { value: [] } }));
          const items = folderRes.data?.value || [];
          this.logger.log(`Folder ${folderPath}: ${items.length} files → ${JSON.stringify(items.map((f: any) => f.name))}`);
          allDriveFiles = [...allDriveFiles, ...items];
        }

        // Also do a subject-based search as fallback
        const searchRes = await graphClient
          .api(`/me/drive/root/search(q='${subject.replace(/'/g, "''")}')`)
          .select('name,id,file,createdDateTime,size')
          .top(20)
          .get()
          .catch(() => ({ value: [] }));
        allDriveFiles = [...allDriveFiles, ...(searchRes.value || [])];

        // Deduplicate by id
        const seen = new Set<string>();
        const allFiles = allDriveFiles.filter((f: any) => {
          if (seen.has(f.id)) return false;
          seen.add(f.id);
          return true;
        });

        this.logger.log(`Total files to check for VTT: ${allFiles.length} → names: ${JSON.stringify(allFiles.map((f: any) => f.name))}`);

        const vttFiles = allFiles.filter((f: any) =>
          f.file && (f.name?.toLowerCase().endsWith('.vtt') || f.name?.toLowerCase().includes('transcript'))
        );

        this.logger.log(`VTT/transcript files: ${vttFiles.length}`);

        for (const vttFile of vttFiles) {
          try {
            const fileRes = await axios.get(
              `https://graph.microsoft.com/v1.0/me/drive/items/${vttFile.id}/content`,
              { headers: { Authorization: `Bearer ${driveToken}` }, responseType: 'text' }
            );
            if (fileRes.data) {
              const parsed = this.parseVTT(fileRes.data);
              if (parsed) {
                this.logger.log(`Transcript loaded from: ${vttFile.name}`);
                return { transcript: parsed };
              }
            }
          } catch { continue; }
        }
      } catch (driveErr: any) {
        this.logger.warn(`Drive/SharePoint fallback failed: ${driveErr.message}`);
      }

      return { transcript: null, message: 'No transcript found. Ensure Teams transcription is enabled in your organization.' };
    } catch (error: any) {
      this.logger.error('Transcript Engine Error', error.message);
      return { transcript: null, error: error.message };
    }
  }

  /**
   * Parse Teams WebVTT transcript file into speaker-separated readable text.
   * Teams saves transcripts as .vtt files in OneDrive with format:
   *   00:00:11.000 --> 00:00:12.000
   *   <v Speaker Name>Text content
   */
  private parseVTT(vttContent: string): string | null {
    try {
      const lines = vttContent.replace(/\r\n/g, '\n').split('\n');
      const utterances: { speaker: string; text: string }[] = [];
      let currentSpeaker = '';
      let currentText = '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'WEBVTT' || trimmed.startsWith('NOTE') || trimmed.includes('-->')) {
          if (trimmed.includes('-->') && currentSpeaker && currentText.trim()) {
            utterances.push({ speaker: currentSpeaker, text: currentText.trim() });
            currentSpeaker = '';
            currentText = '';
          }
          continue;
        }
        // Match speaker tag: <v Speaker Name>text
        const speakerMatch = trimmed.match(/^<v ([^>]+)>(.*)/);
        if (speakerMatch) {
          if (currentSpeaker && currentText.trim()) {
            utterances.push({ speaker: currentSpeaker, text: currentText.trim() });
          }
          currentSpeaker = speakerMatch[1].trim();
          currentText = speakerMatch[2].replace(/<[^>]+>/g, '').trim();
        } else if (currentSpeaker) {
          currentText += ' ' + trimmed.replace(/<[^>]+>/g, '');
        }
      }

      if (currentSpeaker && currentText.trim()) {
        utterances.push({ speaker: currentSpeaker, text: currentText.trim() });
      }

      if (utterances.length === 0) return null;

      // Group consecutive utterances by the same speaker
      const grouped: { speaker: string; text: string }[] = [];
      for (const u of utterances) {
        const last = grouped[grouped.length - 1];
        if (last && last.speaker === u.speaker) {
          last.text += ' ' + u.text;
        } else {
          grouped.push({ ...u });
        }
      }

      return grouped.map(u => `${u.speaker}\n${u.text}`).join('\n\n');
    } catch {
      return null;
    }
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
          try {
            const { transcript } = await this.getMeetingTranscript(userId, m.id);
            if (transcript) {
                context.push({ title: m.title, date: m.start, transcript: transcript.substring(0, 3000) });
            }
          } catch { continue; }
      }
      return context;
    } catch (error: any) {
      this.logger.error('Recent Meeting Context Error', error.message);
      return [];
    }
  }

  async summarizeMeeting(userId: string, meetingId: string) {
    const { transcript, isChat } = await this.getMeetingTranscript(userId, meetingId);
    if (!transcript) return { summary: 'No transcript found to summarize.' };

    const prompt = `Please summarize the following Teams ${isChat ? 'chat history' : 'meeting transcript'}. 
    Focus on key decisions, action items, and main discussion points:
    
    ${transcript.substring(0, 10000)}`;

    const summary = await this.aiService.summarizeText(prompt, 500, userId);
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

  private mapGraphEvent(event: MicrosoftEvent) {
    const startStr = event.start?.dateTime;
    const endStr = event.end?.dateTime;
    
    // Hard UTC Normalization
    const start = new Date(startStr ? (startStr.endsWith('Z') ? startStr : startStr + 'Z') : Date.now());
    const end = new Date(endStr ? (endStr.endsWith('Z') ? endStr : endStr + 'Z') : Date.now());
    const now = new Date();

    let status = 'Upcoming';
    if (now >= start && now <= end) status = 'Live';
    else if (now > end) status = 'Completed';

    return {
      id: event.id,
      title: event.subject || 'Meeting',
      subject: event.subject || 'Meeting',
      start: start.toISOString(),
      end: end.toISOString(),
      dueDate: start.toISOString(), 
      location: event.location?.displayName || 'Teams Meeting',
      isTeams: event.isOnlineMeeting || !!event.onlineMeeting,
      joinUrl: event.onlineMeeting?.joinUrl,
      status,
      type: 'MICROSOFT_EVENT' as any,
      priority: 3,
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
