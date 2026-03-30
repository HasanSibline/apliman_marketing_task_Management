import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TicketStatus } from '@prisma/client';

@Injectable()
export class TicketsService {
  constructor(private prisma: PrismaService) { }

  async resolve(id: string, userId: string, companyId: string) {
    const ticket = await this.findOne(id, companyId);
    return this.prisma.ticket.update({
      where: { id },
      data: { status: 'RESOLVED' }
    });
  }

  async findAll(companyId: string, userId: string, role: string, page: number = 1, departmentId?: string, search?: string, statusType?: string) {
    const isAdmin = ['COMPANY_ADMIN', 'SUPER_ADMIN'].includes(role);
    const take = 10;
    const skip = (page - 1) * take;

    const historyStatuses: TicketStatus[] = [TicketStatus.RESOLVED, TicketStatus.CANCELLED];

    const where: any = {
      companyId,
      ...(isAdmin ? {} : {
        OR: [
          { requesterId: userId },
          { requesterManagerId: userId },
          { receiverManagerId: userId },
          { assigneeId: userId },
          { receiverDept: { managerId: userId } }
        ]
      }),
      ...(statusType === 'HISTORY'
        ? { status: { in: historyStatuses } }
        : { status: { notIn: historyStatuses } }
      ),
      ...(departmentId && {
        OR: [
          { requester: { departmentId } },
          { receiverDeptId: departmentId },
        ],
      }),
      ...(search && {
        OR: [
          { title: { contains: search, mode: 'insensitive' as any } },
          { ticketNumber: { contains: search, mode: 'insensitive' as any } },
          { requester: { name: { contains: search, mode: 'insensitive' as any } } }
        ]
      })
    };

    const [tickets, total] = await Promise.all([
      this.prisma.ticket.findMany({
        where,
        include: {
          requester: { select: { id: true, name: true, department: { select: { name: true } } } },
          requesterManager: { select: { id: true, name: true } },
          receiverDept: { select: { id: true, name: true, managerId: true } },
          receiverManager: { select: { id: true, name: true } },
          assignee: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.ticket.count({ where })
    ]);

    return { tickets, total };
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
        attachments: {
          orderBy: { uploadedAt: 'desc' },
        },
      },
    });

    if (!ticket || ticket.companyId !== companyId) {
      throw new NotFoundException('Ticket not found');
    }

    return ticket;
  }

  async create(companyId: string, userId: string, data: {
    title: string;
    description: string;
    receiverDeptId: string;
    assigneeId?: string;
    isInternal?: boolean;
    type?: string;
    priority?: string;
    amount?: number;
    providerName?: string;
    deadline?: string;
  }) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { department: true }
    });
    if (!user) throw new NotFoundException('User not found');

    const ticketNumber = await this.generateTicketNumber(companyId);
    const receiverDept = await this.prisma.department.findUnique({ where: { id: data.receiverDeptId } });

    // Determine initial status:
    // 1. If specifically to a user, no manager approval required.
    // 2. If to a department, requires manager approval.
    let initialStatus: TicketStatus = TicketStatus.PENDING_REQ_MGR;
    const isDirectToUser = !!data.assigneeId;
    const isSameDept = user.departmentId === data.receiverDeptId;
    const isAdmin = ['COMPANY_ADMIN', 'SUPER_ADMIN'].includes(user.role);

    if (isDirectToUser) {
      initialStatus = TicketStatus.OPEN;
    } else if (!user.managerId || isAdmin || isSameDept) {
      initialStatus = TicketStatus.PENDING_REC_MGR;
    }

    return this.prisma.ticket.create({
      data: {
        companyId,
        ticketNumber,
        title: data.title,
        description: data.description,
        type: (data.type as any) || 'GENERAL',
        priority: data.priority || 'MEDIUM',
        receiverDeptId: data.receiverDeptId,
        assigneeId: data.assigneeId || null,
        requesterId: userId,
        requesterManagerId: user.managerId,
        receiverManagerId: receiverDept?.managerId || null,
        isInternal: data.isInternal || isSameDept || false,
        amount: data.amount ? parseFloat(data.amount.toString()) : null,
        providerName: data.providerName || null,
        deadline: data.deadline ? new Date(data.deadline) : null,
        status: initialStatus,
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
    const manager = await this.prisma.user.findUnique({ where: { id: managerId } });

    const isAdmin = ['COMPANY_ADMIN', 'SUPER_ADMIN'].includes(manager?.role || '');
    if (ticket.requesterManagerId !== managerId && !isAdmin) {
      throw new ForbiddenException('Only the requester manager or system admin can approve this stage');
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
    const isAdmin = ['COMPANY_ADMIN', 'SUPER_ADMIN'].includes(manager?.role || '');

    if (!manager?.isTicketApprover && ticket.receiverManagerId !== managerId && !isAdmin) {
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

  async update(id: string, userId: string, role: string, data: any, companyId: string) {
    const ticket = await this.findOne(id, companyId);
    const isAdmin = ['COMPANY_ADMIN', 'SUPER_ADMIN'].includes(role);
    const isOwner = ticket.requesterId === userId;

    if (!isAdmin && !isOwner) {
      throw new ForbiddenException('No permission to edit this ticket');
    }

    if (data.receiverDeptId === null || data.receiverDeptId === '') {
      throw new BadRequestException('A receiver department is mandatory. Select a new one before removing.');
    }

    // If receiver department changed, update the receiver manager too
    let receiverManagerId = ticket.receiverManagerId;
    if (data.receiverDeptId && data.receiverDeptId !== ticket.receiverDeptId) {
      const dept = await this.prisma.department.findUnique({ where: { id: data.receiverDeptId } });
      receiverManagerId = dept?.managerId || null;
    }

    return this.prisma.ticket.update({
      where: { id },
      data: {
        ...data,
        receiverManagerId,
        id: undefined,
        companyId: undefined,
        ticketNumber: undefined,
        requesterId: undefined,
      }
    });
  }

  async remove(id: string, userId: string, role: string, companyId: string) {
    const ticket = await this.findOne(id, companyId);
    const isAdmin = ['COMPANY_ADMIN', 'SUPER_ADMIN'].includes(role);

    if (!isAdmin) {
      throw new ForbiddenException('Only Administrators can delete tickets.');
    }

    return this.prisma.ticket.delete({ where: { id } });
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
