import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TicketStatus } from '@prisma/client';

@Injectable()
export class TicketsService {
  constructor(private prisma: PrismaService) {}

  async findAll(companyId: string, departmentId?: string) {
    return this.prisma.ticket.findMany({
      where: {
        companyId,
        ...(departmentId && {
          OR: [
            { requester: { departmentId } },
            { receiverDeptId: departmentId },
          ],
        }),
      },
      include: {
        requester: { select: { id: true, name: true, department: { select: { name: true } } } },
        receiverDept: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, companyId: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id },
      include: {
        requester: { select: { id: true, name: true, managerId: true, department: { select: { id: true, name: true } } } },
        requesterManager: { select: { id: true, name: true } },
        receiverDept: { include: { manager: { select: { id: true, name: true } } } },
        receiverManager: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true } },
        comments: {
          include: { user: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!ticket || ticket.companyId !== companyId) {
      throw new NotFoundException('Ticket not found');
    }

    return ticket;
  }

  async create(companyId: string, userId: string, data: { title: string; description: string; receiverDeptId: string; isInternal?: boolean }) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const ticketNumber = await this.generateTicketNumber(companyId);

    return this.prisma.ticket.create({
      data: {
        companyId,
        ticketNumber,
        title: data.title,
        description: data.description,
        receiverDeptId: data.receiverDeptId,
        requesterId: userId,
        requesterManagerId: user.managerId,
        isInternal: data.isInternal || false,
        status: TicketStatus.PENDING_REQ_MGR,
      },
    });
  }

  async approve(id: string, userId: string, companyId: string) {
    const ticket = await this.findOne(id, companyId);
    
    if (ticket.status === TicketStatus.PENDING_REQ_MGR) {
      return this.approveByRequesterManager(id, userId, companyId);
    } else if (ticket.status === TicketStatus.PENDING_REC_MGR) {
      return this.approveByReceiverManager(id, userId, companyId);
    } else {
      throw new BadRequestException('Ticket is not in an approval stage');
    }
  }

  async reject(id: string, userId: string, companyId: string, reason?: string) {
    const ticket = await this.findOne(id, companyId);
    
    // Authorization check
    let canReject = false;
    if (ticket.status === TicketStatus.PENDING_REQ_MGR && ticket.requesterManagerId === userId) {
      canReject = true;
    } else if (ticket.status === TicketStatus.PENDING_REC_MGR && (ticket.receiverManagerId === userId || ticket.receiverDept?.managerId === userId)) {
      canReject = true;
    }

    if (!canReject) {
      throw new ForbiddenException('You do not have permission to reject this ticket');
    }

    const comment = reason ? `Rejected: ${reason}` : 'Rejected';
    await this.addComment(id, userId, comment, companyId);

    return this.prisma.ticket.update({
      where: { id },
      data: { status: TicketStatus.CANCELLED }, // Cancelled or rejected
    });
  }

  async approveByRequesterManager(id: string, managerId: string, companyId: string) {
    const ticket = await this.findOne(id, companyId);
    
    if (ticket.requesterManagerId !== managerId) {
      throw new ForbiddenException('Only the requester manager can approve this stage');
    }

    if (ticket.status !== TicketStatus.PENDING_REQ_MGR) {
      throw new BadRequestException('Ticket is not in requester approval stage');
    }

    // Move to receiver manager stage
    const receiverDept = await this.prisma.department.findUnique({ where: { id: ticket.receiverDeptId } });

    return this.prisma.ticket.update({
      where: { id },
      data: {
        status: TicketStatus.PENDING_REC_MGR,
        receiverManagerId: receiverDept?.managerId || null,
      },
    });
  }

  async approveByReceiverManager(id: string, managerId: string, companyId: string) {
    const ticket = await this.findOne(id, companyId);
    
    // Check if user is the manager of the receiver department or has approval rights
    const manager = await this.prisma.user.findUnique({ where: { id: managerId } });
    if (!manager?.isTicketApprover && ticket.receiverManagerId !== managerId) {
      throw new ForbiddenException('Only the receiver department manager or designated approver can approve this stage');
    }

    if (ticket.status !== TicketStatus.PENDING_REC_MGR) {
      throw new BadRequestException('Ticket is not in receiver approval stage');
    }

    return this.prisma.ticket.update({
      where: { id },
      data: { status: TicketStatus.OPEN },
    });
  }

  async assign(id: string, managerId: string, assigneeId: string, companyId: string) {
    const ticket = await this.findOne(id, companyId);
    
    if (ticket.status !== TicketStatus.OPEN && ticket.status !== TicketStatus.ASSIGNED) {
      throw new BadRequestException('Ticket cannot be assigned in its current status');
    }

    return this.prisma.ticket.update({
      where: { id },
      data: {
        assigneeId,
        status: TicketStatus.ASSIGNED,
      },
    });
  }

  async addComment(id: string, userId: string, comment: string, companyId: string) {
    await this.findOne(id, companyId);
    return this.prisma.ticketComment.create({
      data: { ticketId: id, userId, comment },
    });
  }

  private async generateTicketNumber(companyId: string): Promise<string> {
    const lastTicket = await this.prisma.ticket.findFirst({
      where: { companyId, ticketNumber: { startsWith: 'TKT-' } },
      orderBy: { createdAt: 'desc' },
      select: { ticketNumber: true },
    });

    if (!lastTicket || !lastTicket.ticketNumber) {
      return 'TKT-1001';
    }

    const lastNum = parseInt(lastTicket.ticketNumber.split('-')[1]);
    if (isNaN(lastNum)) return 'TKT-1001';
    return `TKT-${lastNum + 1}`;
  }
}
