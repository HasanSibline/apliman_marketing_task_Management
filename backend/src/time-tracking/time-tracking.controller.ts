import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TimeTrackingService } from './time-tracking.service';

@Controller('time-tracking')
@UseGuards(JwtAuthGuard)
export class TimeTrackingController {
  constructor(private timeTrackingService: TimeTrackingService) {}

  @Post('start')
  async startTimeEntry(
    @Body() data: { taskId?: string; subtaskId?: string; description?: string },
    @Request() req
  ) {
    return this.timeTrackingService.startTimeEntry(
      req.user.id,
      data.taskId,
      data.subtaskId,
      data.description
    );
  }

  @Post(':id/stop')
  async stopTimeEntry(@Param('id') id: string, @Request() req) {
    return this.timeTrackingService.stopTimeEntry(id, req.user.id);
  }

  @Get('active')
  async getActiveTimeEntry(@Request() req) {
    return this.timeTrackingService.getActiveTimeEntry(req.user.id);
  }

  @Get()
  async getTimeEntries(
    @Query('taskId') taskId?: string,
    @Query('subtaskId') subtaskId?: string,
    @Request() req
  ) {
    return this.timeTrackingService.getTimeEntries(req.user.id, taskId, subtaskId);
  }

  @Put(':id')
  async updateTimeEntry(
    @Param('id') id: string,
    @Body() data: { description?: string; duration?: number },
    @Request() req
  ) {
    return this.timeTrackingService.updateTimeEntry(id, req.user.id, data);
  }

  @Delete(':id')
  async deleteTimeEntry(@Param('id') id: string, @Request() req) {
    return this.timeTrackingService.deleteTimeEntry(id, req.user.id);
  }
}
