import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Request, Query } from '@nestjs/common';
import { TicketsService } from './tickets.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

@Controller('tickets')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Get()
  findAll(
    @Request() req, 
    @Query('page') page: string = '1',
    @Query('search') search?: string,
    @Query('departmentId') departmentId?: string,
    @Query('statusType') statusType?: string
  ) {
    return this.ticketsService.findAll(
      req.user.companyId, 
      req.user.id, 
      req.user.role, 
      parseInt(page),
      departmentId,
      search,
      statusType
    );
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req) {
    return this.ticketsService.findOne(id, req.user.companyId);
  }

  @Post()
  create(@Body() createTicketDto: { title: string; description: string; receiverDeptId: string; isInternal?: boolean }, @Request() req) {
    return this.ticketsService.create(req.user.companyId, req.user.id, createTicketDto);
  }

  @Patch(':id/approve')
  approve(@Param('id') id: string, @Request() req) {
    return this.ticketsService.approve(id, req.user.id, req.user.companyId);
  }

  @Patch(':id/reject')
  reject(@Param('id') id: string, @Body('reason') reason: string, @Request() req) {
    return this.ticketsService.reject(id, req.user.id, req.user.companyId, reason);
  }


  @Patch(':id/approve-receiver')
  approveByReceiverManager(@Param('id') id: string, @Request() req) {
    return this.ticketsService.approveByReceiverManager(id, req.user.id, req.user.companyId);
  }

  @Post(':id/assign')
  assign(@Param('id') id: string, @Body('assigneeId') assigneeId: string, @Request() req) {
    return this.ticketsService.assign(id, req.user.id, assigneeId, req.user.companyId);
  }

  @Post(':id/invite')
  invite(@Param('id') id: string, @Body('personId') personId: string, @Request() req) {
    return this.ticketsService.invite(id, req.user.id, personId, req.user.companyId);
  }

  @Patch(':id/start')
  startProgress(@Param('id') id: string, @Request() req) {
    return this.ticketsService.startProgress(id, req.user.id, req.user.companyId);
  }

  @Post(':id/comments')
  addComment(@Param('id') id: string, @Body('comment') comment: string, @Request() req) {
    return this.ticketsService.addComment(id, req.user.id, comment, req.user.companyId);
  }

  @Patch(':id/resolve')
  resolve(@Param('id') id: string, @Request() req) {
    return this.ticketsService.resolve(id, req.user.id, req.user.companyId);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateDto: any, @Request() req) {
    return this.ticketsService.update(id, req.user.id, req.user.role, updateDto, req.user.companyId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req) {
    return this.ticketsService.remove(id, req.user.id, req.user.role, req.user.companyId);
  }
}
