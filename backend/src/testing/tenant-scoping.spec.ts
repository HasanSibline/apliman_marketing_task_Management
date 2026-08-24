import { AiService } from '../ai/ai.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { DepartmentsService } from '../departments/departments.service';
import { FilesService } from '../files/files.service';
import { TicketsService } from '../tickets/tickets.service';
import { WorkflowsService } from '../workflows/workflows.service';
import {
  PrismaRecorder,
  createPrismaRecorder,
  tenantScopedModels,
  tenantDiscriminator,
} from './prisma-recorder';

/**
 * Extraction is irrelevant to tenancy, so it is stubbed rather than mocked. If one of
 * these tests ever reaches it, that is itself a finding: reading a document is not
 * something an authorization check should do.
 */
const noExtraction: any = {
  extractDocumentText: async () => {
    throw new Error('extractDocumentText must not be reached from an authorization test');
  },
};


/**
 * The bug class, caught generically rather than one case at a time.
 *
 * All four cross-tenant defects the audit found were the same mistake wearing different
 * clothes: a query against a table that has a companyId, sent without one. Writing a test
 * per method only ever covers the methods somebody thought to write a test for, and the
 * next leak will be in a method nobody thought about. So this file drives real service
 * methods against a recording Prisma and inspects the transcript, asking one question of
 * every query: what confines this to a single tenant?
 *
 * Three answers are accepted, and they are the only legitimate ones here:
 *   the clause names a companyId, directly or through a relation;
 *   the clause pins one row by primary key, which the service then compares against the
 *   caller's company in JavaScript;
 *   or the clause names a person, and a person belongs to exactly one company.
 *
 * The second answer is the weak one: this file can see that a row was fetched by id, but
 * not whether anybody checked which company it came from. That check is behavioural and
 * lives in ticket-attachment-tenancy.spec.ts. What this file gives is the property the
 * other files cannot: coverage of methods nobody has written a test for yet.
 *
 * Models without a companyId of their own, TicketAttachment and Phase among them, are out
 * of scope by construction. They reach their tenant through a parent row, so there is
 * nothing in their own where clause to look for.
 */

const COMPANY_A = 'company-a';
const CALLER = 'user-in-company-a';

const TENANT_MODELS = tenantScopedModels();

const CALLER_ROW = {
  id: CALLER,
  companyId: COMPANY_A,
  role: 'EMPLOYEE',
  departmentId: 'dept-1',
  teamMemberships: [],
};

const TICKET_ROW = {
  id: 'ticket-1',
  companyId: COMPANY_A,
  requesterId: CALLER,
  requesterManagerId: null,
  receiverManagerId: null,
  assigneeId: null,
  receiverDept: null,
  assignments: [],
};

const ATTACHMENT_ROW = {
  id: 'attachment-1',
  ticketId: 'ticket-1',
  fileName: 'brief.pdf',
  filePath: 'https://res.cloudinary.com/demo/brief.pdf',
  fileType: '.pdf',
  fileSize: 10,
  mimeType: 'application/pdf',
};

/** Fixtures broad enough that any of the services below can run to completion. */
function baseHandlers(caller: Record<string, any> = CALLER_ROW) {
  return {
    user: {
      findUnique: caller,
      findFirst: caller,
      findMany: [{ id: 'user-2', name: 'Bo', email: 'bo@a.test', position: 'X', status: 'ACTIVE' }],
      count: 0,
      update: caller,
    },
    ticket: { findUnique: TICKET_ROW, findFirst: TICKET_ROW, findMany: [], count: 0 },
    ticketAttachment: { findUnique: ATTACHMENT_ROW, findMany: [ATTACHMENT_ROW] },
    department: { findUnique: { id: 'dept-1', companyId: COMPANY_A }, findMany: [] },
    phase: { findMany: [{ id: 'phase-1' }] },
    task: { count: 0, findMany: [] },
    workflow: { findUnique: { id: 'wf-1', companyId: COMPANY_A, phases: [] }, findFirst: { id: 'wf-1', companyId: COMPANY_A, phases: [] }, findMany: [] },
    knowledgeSource: { findMany: [] },
  };
}

const silentConfig = { get: (_key: string, fallback?: any) => fallback } as any;

interface Scenario {
  /** Reads as "TicketsService.findAll, as an employee". */
  name: string;
  handlers?: Record<string, Record<string, any>>;
  run(prisma: any): Promise<unknown>;
}

const SCENARIOS: Scenario[] = [
  {
    name: 'TicketsService.findAll, as an employee',
    run: (prisma) =>
      new TicketsService(prisma, {} as any, {} as any).findAll(COMPANY_A, CALLER, 'EMPLOYEE'),
  },
  {
    name: 'TicketsService.findAll, as a company admin',
    run: (prisma) =>
      new TicketsService(prisma, {} as any, {} as any).findAll(COMPANY_A, CALLER, 'COMPANY_ADMIN'),
  },
  {
    name: 'TicketsService.findAll, with a search term',
    // Search once collapsed the permission clause it was spread beside. A search must
    // narrow the result set, never widen it past the company.
    run: (prisma) =>
      new TicketsService(prisma, {} as any, {} as any).findAll(
        COMPANY_A,
        CALLER,
        'EMPLOYEE',
        1,
        undefined,
        'invoice',
      ),
  },
  {
    name: 'TicketsService.findOne',
    run: (prisma) =>
      new TicketsService(prisma, {} as any, {} as any).findOne('ticket-1', COMPANY_A, CALLER),
  },
  {
    name: 'FilesService.getTicketFiles',
    run: (prisma) => new FilesService(prisma, silentConfig, noExtraction).getTicketFiles('ticket-1', CALLER),
  },
  {
    name: 'FilesService.downloadTicketFile',
    run: (prisma) =>
      new FilesService(prisma, silentConfig, noExtraction).downloadTicketFile('attachment-1', CALLER),
  },
  {
    name: 'FilesService.deleteTicketFile',
    run: (prisma) =>
      new FilesService(prisma, silentConfig, noExtraction).deleteTicketFile('attachment-1', CALLER),
  },
  {
    name: 'AnalyticsService.getTeamAnalytics',
    run: (prisma) => new AnalyticsService(prisma, silentConfig).getTeamAnalytics(CALLER),
  },
  {
    name: 'AnalyticsService.getUserAnalytics',
    run: (prisma) => new AnalyticsService(prisma, silentConfig).getUserAnalytics(CALLER, 'week'),
  },
  {
    name: 'AnalyticsService.exportData',
    run: (prisma) => new AnalyticsService(prisma, silentConfig).exportData(CALLER, 'csv'),
  },
  {
    name: 'WorkflowsService.getWorkflows',
    run: (prisma) => new WorkflowsService(prisma).getWorkflows(undefined, CALLER),
  },
  {
    name: 'WorkflowsService.getDefaultWorkflow',
    run: (prisma) => new WorkflowsService(prisma).getDefaultWorkflow('GENERAL', CALLER),
  },
  {
    name: 'WorkflowsService.getWorkflowById',
    run: (prisma) => new WorkflowsService(prisma).getWorkflowById('wf-1', CALLER),
  },
  {
    name: 'DepartmentsService.findAll',
    run: (prisma) => new DepartmentsService(prisma).findAll(COMPANY_A),
  },
  {
    name: 'DepartmentsService.findOne',
    run: (prisma) => new DepartmentsService(prisma).findOne('dept-1', COMPANY_A),
  },
  {
    name: 'AiService knowledge sources',
    run: (prisma) => {
      const ai = new AiService(
        { post: jest.fn() } as any,
        silentConfig,
        prisma,
        {} as any,
        { registerProber: jest.fn() } as any,
      );
      return (ai as any).getActiveKnowledgeSources(CALLER);
    },
  },
];

/**
 * Queries that carry no tenant discriminator and are known to, each with the reason it
 * has not been treated as a leak. This list is the point of the file: it must only ever
 * shrink, and a query that is not on it and not scoped fails the test below.
 */
const ACCEPTED: { scenario: string; model: string; method: string; because: string }[] = [];

function describeCall(call: { model: string; method: string; args: any }) {
  return `${call.model}.${call.method}(${JSON.stringify(call.args?.where ?? {})})`;
}

function unscopedCalls(scenario: Scenario, recorder: PrismaRecorder) {
  return recorder.calls
    .filter((call) => TENANT_MODELS.includes(call.model))
    .filter((call) => call.method !== 'aggregate' && call.method !== 'groupBy')
    .filter((call) => tenantDiscriminator(call.args) === null)
    .filter(
      (call) =>
        !ACCEPTED.some(
          (allowed) =>
            allowed.scenario === scenario.name &&
            allowed.model === call.model &&
            allowed.method === call.method,
        ),
    );
}

describe('the models that own a companyId', () => {
  it('are read from the schema, so a model added later is covered without anybody remembering', () => {
    expect(TENANT_MODELS).toEqual(expect.arrayContaining(['ticket', 'task', 'user', 'knowledgeSource']));
  });

  it('do not include child tables, which are protected by their parent instead', () => {
    expect(TENANT_MODELS).not.toContain('ticketAttachment');
    expect(TENANT_MODELS).not.toContain('phase');
  });
});

describe('every tenant-owned query a service makes', () => {
  let logSpy: jest.SpyInstance;

  beforeAll(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterAll(() => logSpy.mockRestore());

  it.each(SCENARIOS.map((scenario) => [scenario.name, scenario] as const))(
    'names a company, a row or a person: %s',
    async (_name, scenario) => {
      const recorder = createPrismaRecorder(scenario.handlers ?? baseHandlers());

      await scenario.run(recorder.prisma);

      // Nothing was exercised means nothing was proved, and a scenario that silently
      // stops calling Prisma would pass forever.
      expect(recorder.calls.length).toBeGreaterThan(0);

      expect(unscopedCalls(scenario, recorder).map(describeCall)).toEqual([]);
    },
  );
});

describe('the scan itself', () => {
  it('reports a query with no company, no row and no person', () => {
    // Without this the file could pass by never detecting anything, which is exactly the
    // failure mode the whole suite exists to rule out.
    const recorder = createPrismaRecorder({});
    recorder.prisma.knowledgeSource.findMany({ where: { isActive: true } });

    const scenario = { name: 'synthetic', run: async () => undefined };
    expect(unscopedCalls(scenario, recorder)).toHaveLength(1);
  });

  it.each([
    ['a company named outright', { where: { companyId: COMPANY_A } }],
    ['a company reached through a relation', { where: { workflow: { companyId: COMPANY_A } } }],
    ['a company inside an AND', { where: { AND: [{ companyId: COMPANY_A }, { isActive: true }] } }],
    ['one row by id', { where: { id: 'ticket-1' } }],
    ['one row by compound unique', { where: { companyId_name: { companyId: COMPANY_A, name: 'x' } } }],
    ['one person', { where: { assignedToId: CALLER, taskType: { not: 'SUBTASK' } } }],
  ])('accepts %s', (_why, args) => {
    expect(tenantDiscriminator(args)).not.toBeNull();
  });

  it.each([
    ['an empty clause', { where: {} }],
    ['a filter on a flag alone', { where: { isActive: true } }],
    ['a companyId that came through as undefined', { where: { companyId: undefined } }],
    ['a list of ids from some other query', { where: { currentPhaseId: { in: ['p1', 'p2'] } } }],
  ])('rejects %s', (_why, args) => {
    expect(tenantDiscriminator(args)).toBeNull();
  });
});
