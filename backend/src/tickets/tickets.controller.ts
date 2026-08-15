import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Request, Query, BadRequestException } from '@nestjs/common';
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
@Controller('tickets')
@UseGuards(JwtAuthGuard)
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Get()
  findAll(
    @Request() req, 
    @Query('page') page: string = '1',
    @Query('search') search?: string,
    @Query('departmentId') departmentId?: string,
    @Query('statusType') statusType?: string,
    @Query('limit') limit?: string
  ) {
    return this.ticketsService.findAll(
      req.user.companyId, 
      req.user.id, 
      req.user.role, 
      Number.parseInt(page, 10),
      departmentId,
      search,
      statusType,
      limit ? Number.parseInt(limit, 10) : undefined
    );
  }

  @Get(':id')
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
  preflight(
    @Body()
    draft: { title: string; description?: string; receiverDeptId?: string; category?: string },
    @Request() req,
  ) {
    return this.ticketsService.preflight(req.user.companyId, req.user.id, draft);
  }

  @Post()
  create(@Body() createTicketDto: { title: string; description: string; receiverDeptId: string; isInternal?: boolean }, @Request() req) {
    return this.ticketsService.create(req.user.companyId, req.user.id, createTicketDto);
  }

  /**
   * Declared before the parameterised routes below, so "bulk" is never read as an id.
   */
  @Post('bulk/decide')
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

  @Post(':id/accept')
  acceptAssignment(@Param('id') id: string, @Request() req) {
    return this.ticketsService.acceptAssignment(id, req.user.id, req.user.companyId);
  }

  @Post(':id/decline')
  declineAssignment(@Param('id') id: string, @Body('reason') reason: string, @Request() req) {
    return this.ticketsService.declineAssignment(id, req.user.id, reason, req.user.companyId);
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
  resolve(
    @Param('id') id: string,
    @Body() body: { resolutionNote?: string },
    @Request() req,
  ) {
    return this.ticketsService.resolve(id, req.user.id, req.user.companyId, body?.resolutionNote);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateDto: any, @Request() req) {
    return this.ticketsService.update(id, req.user.id, req.user.role, updateDto, req.user.companyId);
  }

  @Delete(':id/assignments/:assignmentId')
  removeAssignment(@Param('id') id: string, @Param('assignmentId') assignmentId: string, @Request() req) {
    return this.ticketsService.removeAssignment(id, assignmentId, req.user.id, req.user.role, req.user.companyId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req) {
    return this.ticketsService.remove(id, req.user.id, req.user.role, req.user.companyId);
  }
}
