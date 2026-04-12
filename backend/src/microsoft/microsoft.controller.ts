import { Controller, Get, Query, UseGuards, Req, Res, Post, Param, Body } from '@nestjs/common';
import { MicrosoftService } from './microsoft.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Response } from 'express';
import { Client } from '@microsoft/microsoft-graph-client';

@Controller('microsoft')
export class MicrosoftController {
  constructor(private readonly microsoftService: MicrosoftService) {}

  @Get('auth-url')
  @UseGuards(JwtAuthGuard)
  getAuthUrl() {
    return { url: this.microsoftService.getAuthUrl() };
  }

  @Get('callback')
  async handleCallback(@Query('code') code: string, @Res() res: Response) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.redirect(`${frontendUrl}/auth/microsoft/callback?code=${code}`);
  }

  @Post('sync')
  @UseGuards(JwtAuthGuard)
  async sync(@Body('code') code: string, @Req() req: any) {
    return this.microsoftService.handleCallback(code, req.user.id);
  }

  @Get('events')
  @UseGuards(JwtAuthGuard)
  async getEvents(
    @Req() req,
    @Query('start') start?: string,
    @Query('end') end?: string,
  ) {
    return this.microsoftService.getCalendarEvents(req.user.id, start, end);
  }

  /**
   * Diagnostic endpoint — call GET /api/microsoft/debug to see exactly what
   * Microsoft Graph is returning for the logged-in user. Useful for production
   * debugging without server log access.
   */
  @Get('debug')
  @UseGuards(JwtAuthGuard)
  async debugEvents(@Req() req) {
    try {
      const token = await this.microsoftService.getAccessToken(req.user.id);
      const graphClient = Client.init({ authProvider: (done) => done(null, token) });

      const now = new Date();
      const start = new Date(now.getTime() - 7 * 24 * 3600000).toISOString();
      const end   = new Date(now.getTime() + 7 * 24 * 3600000).toISOString();

      let viewResult: any = null;
      let viewError: any = null;
      let eventsResult: any = null;
      let eventsError: any = null;

      try {
        viewResult = await graphClient.api('/me/calendar/calendarView')
          .query({ startDateTime: start, endDateTime: end })
          .header('Prefer', 'outlook.timezone="UTC"')
          .top(10)
          .get();
      } catch (e: any) { viewError = e.message || String(e); }

      try {
        eventsResult = await graphClient.api('/me/events')
          .header('Prefer', 'outlook.timezone="UTC"')
          .top(10)
          .get();
      } catch (e: any) { eventsError = e.message || String(e); }

      const processedEvents = await this.microsoftService.getCalendarEvents(req.user.id, start, end);

      // OneDrive + onlineMeetings debug
      let oneDriveFiles: any[] = []; let oneDriveError: any = null; let onlineMeetingsList: any[] = [];
      try { const dr = await graphClient.api("/me/drive/root/search(q='transcript')").select('name,id,createdDateTime,size').top(10).get().catch(()=>({value:[]})); oneDriveFiles = (dr.value||[]).map((f:any)=>({name:f.name,id:f.id,created:f.createdDateTime,size:f.size})); } catch(e:any){oneDriveError=e.message;}
      try { const mr = await graphClient.api('/me/onlineMeetings').top(5).get().catch(()=>({value:[]})); onlineMeetingsList=(mr.value||[]).map((m:any)=>({id:m.id,subject:m.subject,start:m.startDateTime})); } catch{}

      return {
        userId: req.user.id,
        queryWindow: { start, end },
        tokenOk: true,
        calendarView: {
          error: viewError,
          count: viewResult?.value?.length ?? 0,
          sample: (viewResult?.value || []).slice(0, 5).map((e: any) => ({
            id: e.id,
            subject: e.subject,
            start: e.start,
            isOnlineMeeting: e.isOnlineMeeting,
          })),
        },
        eventsEndpoint: {
          error: eventsError,
          count: eventsResult?.value?.length ?? 0,
          sample: (eventsResult?.value || []).slice(0, 5).map((e: any) => ({
            id: e.id,
            subject: e.subject,
            start: e.start,
          })),
        },
        oneDrive: { error: oneDriveError, files: oneDriveFiles },
        onlineMeetings: { count: onlineMeetingsList.length, list: onlineMeetingsList },
        processedCount: processedEvents.length,
        processedSample: processedEvents.slice(0, 5),
      };
    } catch (err: any) {
      return { error: err.message, tokenOk: false };
    }
  }

  @Get('details/:meetingId')
  @UseGuards(JwtAuthGuard)
  async getDetails(@Req() req, @Param('meetingId') meetingId: string) {
    return this.microsoftService.getMeeting(req.user.id, meetingId);
  }

  @Get('transcripts/:meetingId')
  @UseGuards(JwtAuthGuard)
  async getTranscript(@Req() req, @Param('meetingId') meetingId: string) {
    return this.microsoftService.getMeetingTranscript(req.user.id, meetingId);
  }

  @Get('summarize/:meetingId')
  @UseGuards(JwtAuthGuard)
  async summarize(@Req() req, @Param('meetingId') meetingId: string) {
    return this.microsoftService.summarizeMeeting(req.user.id, meetingId);
  }

  @Post('disconnect')
  @UseGuards(JwtAuthGuard)
  async disconnect(@Req() req) {
    return this.microsoftService.disconnect(req.user.id);
  }
}
