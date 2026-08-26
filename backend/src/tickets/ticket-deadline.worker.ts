import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MicrosoftService } from '../microsoft/microsoft.service';
import { dueSoon, isOverdue, TERMINAL_TICKET_STATUSES } from './ticket-deadline';
import { sendTicketMail } from './ticket-mail';

/**
 * Deadlines were write-only before this: a ticket could carry one and nothing would
 * ever act on it. This sweeps every non-terminal ticket with a deadline set, across
 * every company (each ticket notifies only its own participants, so nothing here
 * crosses a tenant boundary), and tells someone once when it is approaching and once
 * when it has been missed.
 *
 * Modelled on MicrosoftNotificationWorker: a plain @Cron provider, one DB
 * notification per event, no separate queue.
 */
@Injectable()
export class TicketDeadlineWorker {
  private readonly logger = new Logger(TicketDeadlineWorker.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly microsoft: MicrosoftService,
  ) {}

  @Cron('*/30 * * * *')
  async sweep() {
    const now = new Date();

    const tickets = await this.prisma.ticket.findMany({
      where: {
        status: { notIn: TERMINAL_TICKET_STATUSES as any },
        deadline: { not: null },
      },
      select: {
        id: true,
        companyId: true,
        ticketNumber: true,
        title: true,
        status: true,
        deadline: true,
        metadata: true,
        assigneeId: true,
        receiverManagerId: true,
        requesterId: true,
      },
    });

    for (const ticket of tickets) {
      try {
        const recipient = ticket.assigneeId || ticket.receiverManagerId || ticket.requesterId;
        if (!recipient) continue;

        const meta = (ticket.metadata as Record<string, any>) ?? {};

        if (dueSoon(ticket, now) && !meta.slaReminderSentAt) {
          const message = `Ticket ${ticket.ticketNumber} ("${ticket.title}") is due within a day.`;
          await this.notify(recipient, ticket.id, 'Deadline approaching', message);
          void sendTicketMail(
            { prisma: this.prisma, microsoft: this.microsoft },
            {
              userId: recipient,
              companyId: ticket.companyId,
              subject: `Deadline approaching: ${ticket.ticketNumber}`,
              bodyHtml: `<p>${message}</p>`,
            },
          );
          await this.stamp(ticket.id, meta, 'slaReminderSentAt', now);
          continue;
        }

        if (isOverdue(ticket, now) && !meta.slaOverdueSentAt) {
          const message = `Ticket ${ticket.ticketNumber} ("${ticket.title}") has passed its deadline.`;
          await this.notify(recipient, ticket.id, 'Ticket overdue', message);
          void sendTicketMail(
            { prisma: this.prisma, microsoft: this.microsoft },
            {
              userId: recipient,
              companyId: ticket.companyId,
              subject: `Overdue: ${ticket.ticketNumber}`,
              bodyHtml: `<p>${message}</p>`,
            },
          );
          await this.stamp(ticket.id, meta, 'slaOverdueSentAt', now);
        }
      } catch (error) {
        this.logger.error(`Error processing deadline for ticket ${ticket.id}: ${error.message}`);
      }
    }
  }

  private async notify(userId: string, ticketId: string, title: string, message: string) {
    await this.notifications.createNotification({
      userId,
      ticketId,
      type: 'TICKET_DEADLINE',
      title,
      message,
      actionUrl: `/tickets/${ticketId}`,
    });
  }

  /**
   * Stamped on the ticket's own `metadata`, not a separate table, so one reminder and
   * one overdue notice per ticket is a property of the row itself and survives this
   * worker restarting, unlike an in-memory set.
   */
  private async stamp(ticketId: string, meta: Record<string, any>, key: string, at: Date) {
    await this.prisma.ticket.update({
      where: { id: ticketId },
      data: { metadata: { ...meta, [key]: at.toISOString() } },
    });
  }
}
