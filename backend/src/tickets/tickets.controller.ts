import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Request, Query, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TicketsService } from './tickets.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

/**
 * Tickets are open to every authenticated role by design, anyone can raise one and
 * follow their own. Company scoping happens in the service via req.user.companyId,
 * not through role checks.
 *
 * RolesGuard is deliberately absent: it is a no-op without @Roles, and listing it
 * here made the controller look role-restricted when it is not. Access decisions
 * live in the service.
 */
@ApiTags('Tickets')
@ApiBearerAuth()
@Controller('tickets')
@UseGuards(JwtAuthGuard)
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Get()
  @ApiOperation({ summary: 'Get tickets visible to the current user, filtered, searched and paginated' })
  findAll(
    @Request() req,
    @Query('page') page: string = '1',
    @Query('search') search?: string,
    @Query('departmentId') departmentId?: string,
    @Query('statusType') statusType?: string,
    @Query('limit') limit?: string,
    @Query('priority') priority?: string,
    @Query('sortBy') sortBy?: 'createdAt' | 'deadline' | 'priority',
    @Query('sortDir') sortDir?: 'asc' | 'desc',
  ) {
    return this.ticketsService.findAll(
      req.user.companyId,
      req.user.id,
      req.user.role,
      Number.parseInt(page, 10),
      departmentId,
      search,
      statusType,
      limit ? Number.parseInt(limit, 10) : undefined,
      priority,
      sortBy,
      sortDir,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single ticket, checking the requester is related to it' })
  findOne(@Param('id') id: string, @Request() req) {
    return this.ticketsService.findOne(id, req.user.companyId, req.user.id);
  }

  /**
   * What to tell someone before their ticket exists.
   *
   * A POST because it is a question about a body, not a resource to fetch, but it
   * writes nothing: calling it twice creates nothing and changes nothing.
   */
  @Post('preflight')
  @ApiOperation({ summary: 'Check a ticket draft for likely duplicates before it is raised' })
  preflight(
    @Body()
    draft: { title: string; description?: string; receiverDeptId?: string; category?: string },
    @Request() req,
  ) {
    return this.ticketsService.preflight(req.user.companyId, req.user.id, draft);
  }

  @Post()
  @ApiOperation({ summary: 'Raise a new ticket, routing it to approval when required or a threshold forces it' })
  create(@Body() createTicketDto: { title: string; description: string; receiverDeptId: string; isInternal?: boolean }, @Request() req) {
    return this.ticketsService.create(req.user.companyId, req.user.id, createTicketDto);
  }

  /**
   * Declared before the parameterised routes below, so "bulk" is never read as an id.
   */
  @Post('bulk/decide')
  @ApiOperation({ summary: 'Approve or reject several tickets at once, reporting per-ticket success or failure' })
  bulkDecide(
    @Body() body: { ids?: unknown; action?: unknown; reason?: unknown },
    @Request() req,
  ) {
    // Coercing anything that is not "reject" into "approve" meant a missing field, a
    // typo, or the word the UI itself says out loud, "decline", silently approved the
    // whole batch. An action that is not one of the two is a mistake, not a default.
    if (body?.action !== 'approve' && body?.action !== 'reject') {
      throw new BadRequestException('action must be "approve" or "reject".');
    }

    // An inline body type means the global ValidationPipe has no class to check, so
    // nothing here has been validated: a bare string would iterate character by
    // character, and a non-array would throw inside the service.
    const ids = Array.isArray(body?.ids) ? body.ids.filter((v): v is string => typeof v === 'string') : [];
    if (ids.length === 0) {
      throw new BadRequestException('ids must be a non-empty array of ticket ids.');
    }

    return this.ticketsService.bulkDecide(
      ids,
      body.action,
      req.user.id,
      req.user.companyId,
      typeof body?.reason === 'string' ? body.reason : undefined,
    );
  }

  @Patch(':id/approve')
  @ApiOperation({ summary: 'Approve a ticket waiting on receiver-manager sign-off' })
  approve(@Param('id') id: string, @Request() req) {
    return this.ticketsService.approve(id, req.user.id, req.user.companyId);
  }

  @Patch(':id/reject')
  @ApiOperation({ summary: 'Decline a ticket waiting on approval' })
  reject(@Param('id') id: string, @Body('reason') reason: string, @Request() req) {
    return this.ticketsService.reject(id, req.user.id, req.user.companyId, reason);
  }


  @Patch(':id/approve-receiver')
  @ApiOperation({ summary: 'Approve a ticket as the receiving department\'s manager, opening it for work' })
  approveByReceiverManager(@Param('id') id: string, @Request() req) {
    return this.ticketsService.approveByReceiverManager(id, req.user.id, req.user.companyId);
  }

  @Post(':id/assign')
  @ApiOperation({ summary: 'Assign a person to a ticket, moving it to ASSIGNED' })
  assign(@Param('id') id: string, @Body('assigneeId') assigneeId: string, @Request() req) {
    return this.ticketsService.assign(id, req.user.id, assigneeId, req.user.companyId);
  }

  @Post(':id/invite')
  @ApiOperation({ summary: 'Invite another person onto a ticket, pending their acceptance' })
  invite(@Param('id') id: string, @Body('personId') personId: string, @Request() req) {
    return this.ticketsService.invite(id, req.user.id, personId, req.user.companyId);
  }

  @Post(':id/accept')
  @ApiOperation({ summary: 'Accept an invitation to join a ticket' })
  acceptAssignment(@Param('id') id: string, @Request() req) {
    return this.ticketsService.acceptAssignment(id, req.user.id, req.user.companyId);
  }

  @Post(':id/decline')
  @ApiOperation({ summary: 'Decline an invitation to join a ticket, with a reason' })
  declineAssignment(@Param('id') id: string, @Body('reason') reason: string, @Request() req) {
    return this.ticketsService.declineAssignment(id, req.user.id, reason, req.user.companyId);
  }

  @Patch(':id/start')
  @ApiOperation({ summary: 'Move an assigned ticket into progress, as the assignee' })
  startProgress(@Param('id') id: string, @Request() req) {
    return this.ticketsService.startProgress(id, req.user.id, req.user.companyId);
  }

  @Post(':id/comments')
  @ApiOperation({ summary: 'Add a comment to a ticket, notifying any @mentioned users' })
  addComment(@Param('id') id: string, @Body('comment') comment: string, @Request() req) {
    return this.ticketsService.addComment(id, req.user.id, comment, req.user.companyId);
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Cancel a ticket with a required reason' })
  cancel(@Param('id') id: string, @Body() body: { reason?: string }, @Request() req) {
    return this.ticketsService.cancel(id, req.user.id, req.user.companyId, body?.reason);
  }

  @Patch(':id/resolve')
  @ApiOperation({ summary: 'Close a ticket with a required resolution note' })
  resolve(
    @Param('id') id: string,
    @Body() body: { resolutionNote?: string },
    @Request() req,
  ) {
    return this.ticketsService.resolve(id, req.user.id, req.user.companyId, body?.resolutionNote);
  }

  @Patch(':id/reopen')
  @ApiOperation({ summary: 'Reopen a resolved or cancelled ticket back into active work' })
  reopen(
    @Param('id') id: string,
    @Body() body: { reason?: string },
    @Request() req,
  ) {
    return this.ticketsService.reopen(id, req.user.id, req.user.companyId, body?.reason);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update ticket fields, refusing to close it (use resolve or cancel for that)' })
  update(@Param('id') id: string, @Body() updateDto: any, @Request() req) {
    return this.ticketsService.update(id, req.user.id, req.user.role, updateDto, req.user.companyId);
  }

  @Delete(':id/assignments/:assignmentId')
  @ApiOperation({ summary: 'Remove a person\'s assignment from a ticket, except the requester' })
  removeAssignment(@Param('id') id: string, @Param('assignmentId') assignmentId: string, @Request() req) {
    return this.ticketsService.removeAssignment(id, assignmentId, req.user.id, req.user.role, req.user.companyId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a ticket (admin only)' })
  remove(@Param('id') id: string, @Request() req) {
    return this.ticketsService.remove(id, req.user.id, req.user.role, req.user.companyId);
  }
}
