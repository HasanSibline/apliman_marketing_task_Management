import { Controller, Get, Query, UseGuards, Req, Res, Post, Param, Body } from '@nestjs/common';
import { MicrosoftService } from './microsoft.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Response } from 'express';

@Controller('microsoft')
export class MicrosoftController {
  constructor(private readonly microsoftService: MicrosoftService) {}

  @Get('auth-url')
  @UseGuards(JwtAuthGuard)
  getAuthUrl() {
    return { url: this.microsoftService.getAuthUrl() };
  }

  @Get('callback')
  async handleCallback(@Query('code') code: string, @Query('state') state: string, @Res() res: Response) {
    // Note: state should ideally contain the userId or we use another session mechanism
    // For simplicity in this demo environment, we might need to handle the linkage differently
    // In a real app, 'state' would be a secure token we check
    
    // REDIRECT back to frontend with the code if needed, or handle here
    // But since this is a callback from MS, we usually redirect to frontend callback page
    res.redirect(`${process.env.FRONTEND_URL}/auth/microsoft/callback?code=${code}`);
  }

  @Post('sync')
  @UseGuards(JwtAuthGuard)
  async sync(@Body('code') code: string, @Req() req) {
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
