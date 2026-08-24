import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FilesService } from './files.service';
import { createPrismaRecorder, ModelHandlers } from '../testing/prisma-recorder';

/**
 * The bug class: an attachment endpoint that trusts the id it was handed.
 *
 * A ticket id is a uuid in a URL. Nothing about holding one proves the holder is in the
 * tenant that owns the ticket, and the role on the JWT says which powers somebody has,
 * not which company they have them in. Two of the four verbs got this wrong at once,
 * which is what happens when each verb writes its own check, so all four now route
 * through authorizeTicketAccess and all four are tested here.
 *
 * Locks down three audited defects:
 *   uploadTicketFiles had no authorization at all, so anybody could attach a file to any
 *   ticket in any company;
 *   getTicketFiles treated COMPANY_ADMIN as company-agnostic, so an admin of one tenant
 *   could read another tenant's attachments;
 *   and the involvement check missed the TicketAssignment join table, so an assignee
 *   recorded only there was refused access to their own ticket.
 */

const COMPANY_A = 'company-a';
const COMPANY_B = 'company-b';

const OUTSIDER = 'user-in-company-a';
const FOREIGN_TICKET = 'ticket-owned-by-company-b';

/** A ticket in the other tenant, shaped as authorizeTicketAccess selects it. */
function foreignTicket(overrides: Record<string, any> = {}) {
  return {
    id: FOREIGN_TICKET,
    companyId: COMPANY_B,
    requesterId: 'someone-in-company-b',
    requesterManagerId: null,
    receiverManagerId: null,
    assigneeId: null,
    receiverDept: null,
    assignments: [],
    ...overrides,
  };
}

function localTicket(overrides: Record<string, any> = {}) {
  return {
    id: 'ticket-owned-by-company-a',
    companyId: COMPANY_A,
    requesterId: 'someone-else-in-company-a',
    requesterManagerId: null,
    receiverManagerId: null,
    assigneeId: null,
    receiverDept: null,
    assignments: [],
    ...overrides,
  };
}

/** An attachment row on that ticket. The http path keeps the code off the disk. */
function attachmentOn(ticketId: string) {
  return {
    id: 'attachment-1',
    ticketId,
    fileName: 'contract.pdf',
    filePath: 'https://res.cloudinary.com/demo/contract.pdf',
    fileType: '.pdf',
    fileSize: 1024,
    mimeType: 'application/pdf',
  };
}

function anUpload() {
  return {
    originalname: 'contract.pdf',
    mimetype: 'application/pdf',
    path: '/tmp/does-not-exist/contract.pdf',
    size: 1024,
  } as any;
}

function buildService(handlers: ModelHandlers) {
  const recorder = createPrismaRecorder(handlers);
  const config = { get: () => undefined } as any;
  return { service: new FilesService(recorder.prisma, config), recorder };
}

/** The caller, the ticket they are reaching for, and the file on it. */
function scenario(
  caller: { companyId: string | null; role: string },
  ticket: Record<string, any> | null,
) {
  return buildService({
    user: { findUnique: caller },
    ticket: { findUnique: ticket },
    ticketAttachment: {
      findUnique: ticket ? attachmentOn(ticket.id) : attachmentOn(FOREIGN_TICKET),
      findMany: [attachmentOn(ticket?.id ?? FOREIGN_TICKET)],
    },
  });
}

describe('ticket attachments belonging to another company', () => {
  let logSpy: jest.SpyInstance;

  beforeAll(() => {
    // The Cloudinary banner the constructor prints is not what is under test.
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterAll(() => logSpy.mockRestore());

  describe('an ordinary employee reaching into the other tenant', () => {
    const caller = { companyId: COMPANY_A, role: 'EMPLOYEE' };

    it('cannot list them', async () => {
      const { service } = scenario(caller, foreignTicket());

      await expect(service.getTicketFiles(FOREIGN_TICKET, OUTSIDER, 'EMPLOYEE')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('cannot upload one, and no attachment row is written', async () => {
      const { service, recorder } = scenario(caller, foreignTicket());

      await expect(
        service.uploadTicketFiles(FOREIGN_TICKET, [anUpload()], OUTSIDER),
      ).rejects.toThrow(NotFoundException);

      // The refusal has to happen before the write, not alongside it.
      expect(recorder.callsTo('ticketAttachment', 'create')).toHaveLength(0);
    });

    it('cannot download one', async () => {
      const { service } = scenario(caller, foreignTicket());

      await expect(service.downloadTicketFile('attachment-1', OUTSIDER)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('cannot delete one, and no row is removed', async () => {
      const { service, recorder } = scenario(caller, foreignTicket());

      await expect(service.deleteTicketFile('attachment-1', OUTSIDER)).rejects.toThrow(
        NotFoundException,
      );
      expect(recorder.callsTo('ticketAttachment', 'delete')).toHaveLength(0);
    });

    it('is refused in the same words whether the ticket exists or not, so the id gives nothing away', async () => {
      const exists = scenario(caller, foreignTicket());
      const doesNot = scenario(caller, null);

      const refusals = await Promise.all(
        [exists, doesNot].map(({ service }) =>
          service.getTicketFiles(FOREIGN_TICKET, OUTSIDER, 'EMPLOYEE').catch((error) => error),
        ),
      );

      expect(refusals[0]).toBeInstanceOf(NotFoundException);
      expect(refusals[1]).toBeInstanceOf(NotFoundException);
      expect(refusals[0].message).toBe(refusals[1].message);
      expect(refusals[0].message).toBe('Ticket not found');
    });

    it('is refused even when the ticket names somebody with the same id in the other company', async () => {
      // Ids are uuids and never collide in practice, but the check must be the company,
      // not involvement, or a shared id would be a way across.
      const { service } = scenario(caller, foreignTicket({ requesterId: OUTSIDER }));

      await expect(service.getTicketFiles(FOREIGN_TICKET, OUTSIDER, 'EMPLOYEE')).rejects.toThrow(
        'Ticket not found',
      );
    });
  });

  describe('roles that carry authority', () => {
    it.each(['COMPANY_ADMIN', 'ADMIN'])(
      'a %s administers one company and is refused the other one entirely',
      async (role) => {
        const { service, recorder } = scenario({ companyId: COMPANY_A, role }, foreignTicket());

        await expect(service.getTicketFiles(FOREIGN_TICKET, OUTSIDER, role)).rejects.toThrow(
          NotFoundException,
        );
        expect(recorder.callsTo('ticketAttachment', 'findMany')).toHaveLength(0);
      },
    );

    it('a COMPANY_ADMIN does see its own company, without being involved in the ticket', async () => {
      const ticket = localTicket();
      const { service } = scenario({ companyId: COMPANY_A, role: 'COMPANY_ADMIN' }, ticket);

      await expect(service.getTicketFiles(ticket.id, OUTSIDER, 'COMPANY_ADMIN')).resolves.toEqual([
        attachmentOn(ticket.id),
      ]);
    });

    it('a SUPER_ADMIN, who belongs to no company, is the only role that crosses', async () => {
      const { service } = scenario({ companyId: null, role: 'SUPER_ADMIN' }, foreignTicket());

      await expect(
        service.getTicketFiles(FOREIGN_TICKET, 'the-platform-owner', 'SUPER_ADMIN'),
      ).resolves.toEqual([attachmentOn(FOREIGN_TICKET)]);
    });

    it('believes the database about the caller, not the role string the controller passed', async () => {
      // The role travels on a JWT the caller holds. Claiming SUPER_ADMIN in the argument
      // must not be enough, or every check here is decoration.
      const { service } = scenario({ companyId: COMPANY_A, role: 'EMPLOYEE' }, foreignTicket());

      await expect(
        service.getTicketFiles(FOREIGN_TICKET, OUTSIDER, 'SUPER_ADMIN'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('a caller with no company of their own', () => {
    it('is refused rather than treated as belonging everywhere', async () => {
      const { service } = scenario({ companyId: null, role: 'EMPLOYEE' }, foreignTicket());

      await expect(service.getTicketFiles(FOREIGN_TICKET, OUTSIDER, 'EMPLOYEE')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('is refused on their own company\'s tickets too, having no company to match', async () => {
      const ticket = localTicket();
      const { service } = scenario({ companyId: null, role: 'EMPLOYEE' }, ticket);

      await expect(service.getTicketFiles(ticket.id, OUTSIDER, 'EMPLOYEE')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});

describe('who counts as involved in a ticket', () => {
  let logSpy: jest.SpyInstance;

  beforeAll(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterAll(() => logSpy.mockRestore());

  const ME = 'employee-in-company-a';
  const employee = { companyId: COMPANY_A, role: 'EMPLOYEE' };

  // Six ways to be part of a ticket, listed one by one rather than as a single "involved"
  // fixture, because the join table route was missed once already and a combined case
  // would have stayed green without it.
  const routes: [string, Record<string, any>][] = [
    ['the person who raised it', { requesterId: ME }],
    ['the manager who has to approve it', { requesterManagerId: ME }],
    ['the manager of the department it was sent to', { receiverManagerId: ME }],
    ['the assignee named on the deprecated column', { assigneeId: ME }],
    ['the manager on the receiving department record', { receiverDept: { managerId: ME } }],
    ['an assignee recorded only in the assignments table', { assignments: [{ userId: ME }] }],
  ];

  it.each(routes)('%s may read the attachments', async (_route, involvement) => {
    const ticket = localTicket(involvement);
    const { service } = scenario(employee, ticket);

    await expect(service.getTicketFiles(ticket.id, ME, 'EMPLOYEE')).resolves.toEqual([
      attachmentOn(ticket.id),
    ]);
  });

  it.each(routes)('%s may upload an attachment', async (_route, involvement) => {
    const ticket = localTicket(involvement);
    const { service, recorder } = scenario(employee, ticket);

    await service.uploadTicketFiles(ticket.id, [anUpload()], ME);

    expect(recorder.callsTo('ticketAttachment', 'create')).toHaveLength(1);
  });

  it('a colleague in the same company with no part in it is still refused', async () => {
    const ticket = localTicket();
    const { service } = scenario(employee, ticket);

    await expect(service.getTicketFiles(ticket.id, ME, 'EMPLOYEE')).rejects.toThrow(
      'Access denied to this ticket',
    );
  });

  it('being involved is not the same as being allowed to delete, which stays with the requester', async () => {
    const ticket = localTicket({ assignments: [{ userId: ME }] });
    const { service, recorder } = scenario(employee, ticket);

    await expect(service.deleteTicketFile('attachment-1', ME)).rejects.toThrow(
      BadRequestException,
    );
    expect(recorder.callsTo('ticketAttachment', 'delete')).toHaveLength(0);
  });

  it('the requester may delete their own ticket\'s attachment', async () => {
    const ticket = localTicket({ requesterId: ME });
    const { service, recorder } = scenario(employee, ticket);

    await expect(service.deleteTicketFile('attachment-1', ME)).resolves.toEqual({
      message: 'Attachment deleted',
    });
    expect(recorder.callsTo('ticketAttachment', 'delete')).toHaveLength(1);
  });
});
