/**
 * A stand-in for PrismaService that answers from fixtures and keeps a transcript.
 *
 * It exists so that services can be tested for the one thing no unit test in this
 * repository checked before: which rows a query is allowed to see. Every service takes
 * PrismaService through the constructor, so handing it this object instead runs the real
 * service code against a database that never existed, and leaves behind a list of every
 * model, method and argument object the service asked for.
 *
 * Nothing here interprets a where clause. That is deliberate: a fake query engine would
 * be a second implementation of Prisma to get wrong, and the tenant checks in this
 * codebase are made in JavaScript after the row comes back, which a transcript captures
 * exactly. Tests assert on the arguments and on what the service does with the row.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

export interface PrismaCall {
  model: string;
  method: string;
  args: any;
}

/** `{ user: { findUnique: row }, task: { count: (args) => 3 } }` */
export type ModelHandlers = Record<string, Record<string, any>>;

const DEFAULT_RESULTS: Record<string, () => any> = {
  findMany: () => [],
  findFirst: () => null,
  findUnique: () => null,
  findUniqueOrThrow: () => null,
  count: () => 0,
  groupBy: () => [],
  aggregate: () => ({ _count: {}, _sum: {}, _avg: {} }),
  create: () => ({}),
  createMany: () => ({ count: 0 }),
  update: () => ({}),
  updateMany: () => ({ count: 0 }),
  upsert: () => ({}),
  delete: () => ({}),
  deleteMany: () => ({ count: 0 }),
};

export interface PrismaRecorder {
  /** Pass this where a PrismaService is expected. */
  prisma: any;
  /** Every call made, in order. */
  calls: PrismaCall[];
  /** The calls made against one model, optionally narrowed to one method. */
  callsTo(model: string, method?: string): PrismaCall[];
}

export function createPrismaRecorder(handlers: ModelHandlers = {}): PrismaRecorder {
  const calls: PrismaCall[] = [];
  const delegates = new Map<string, any>();

  const makeDelegate = (model: string) =>
    new Proxy(
      {},
      {
        get(_target, method: string | symbol) {
          if (typeof method !== 'string' || method === 'then') return undefined;

          return (args?: any) => {
            calls.push({ model, method, args: args ?? {} });

            const configured = handlers[model]?.[method];
            const value = typeof configured === 'function' ? configured(args) : configured;
            if (value !== undefined) return Promise.resolve(value);

            const fallback = DEFAULT_RESULTS[method];
            return Promise.resolve(fallback ? fallback() : undefined);
          };
        },
      },
    );

  const prisma: any = new Proxy(
    {},
    {
      get(_target, model: string | symbol) {
        if (typeof model !== 'string' || model === 'then') return undefined;

        if (model === '$transaction') {
          return (work: any) =>
            Array.isArray(work) ? Promise.all(work) : Promise.resolve(work(prisma));
        }
        if (model.startsWith('$')) return () => Promise.resolve(undefined);

        if (!delegates.has(model)) delegates.set(model, makeDelegate(model));
        return delegates.get(model);
      },
    },
  );

  return {
    prisma,
    calls,
    callsTo: (model, method) =>
      calls.filter((call) => call.model === model && (!method || call.method === method)),
  };
}

/**
 * The Prisma delegate names of every model that carries a companyId of its own.
 *
 * Read from schema.prisma rather than listed here, so a model added next month is
 * covered by the tenant scan without anybody remembering to add it. Child tables such as
 * TicketAttachment do not appear: they reach their tenant through a parent, and only a
 * behavioural test can say whether that parent was checked.
 */
export function tenantScopedModels(): string[] {
  const schemaPath = join(__dirname, '..', '..', 'prisma', 'schema.prisma');
  const schema = readFileSync(schemaPath, 'utf8');
  const models: string[] = [];

  const modelBlock = /^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm;
  let match: RegExpExecArray | null;

  while ((match = modelBlock.exec(schema)) !== null) {
    const [, name, body] = match;
    if (/^\s*companyId\s+String/m.test(body)) {
      models.push(name.charAt(0).toLowerCase() + name.slice(1));
    }
  }

  return models;
}

/** True when a companyId appears anywhere in the clause, including through a relation. */
export function mentionsCompany(node: any): boolean {
  if (!node || typeof node !== 'object') return false;
  if (node instanceof Date) return false;
  if (Array.isArray(node)) return node.some(mentionsCompany);

  for (const [key, value] of Object.entries(node)) {
    if (key === 'companyId' && value !== undefined && value !== null) return true;
    if (mentionsCompany(value)) return true;
  }

  return false;
}

/**
 * Columns that name a person. A row reached through one of these is already confined to
 * that person's company, because a person belongs to exactly one.
 */
const PERSON_COLUMNS = new Set([
  'assignedToId',
  'assigneeId',
  'createdById',
  'managerId',
  'ownerId',
  'receiverManagerId',
  'requesterId',
  'requesterManagerId',
  'senderId',
  'uploadedById',
  'userId',
]);

/** True when the clause pins one row by primary key or by a compound unique. */
export function pinsOneRow(where: any): boolean {
  if (!where || typeof where !== 'object') return false;
  if (typeof where.id === 'string') return true;

  return Object.keys(where).some(
    (key) => key.includes('_') && where[key] && typeof where[key] === 'object',
  );
}

/** True when the clause is narrowed to a named person's own rows. */
export function pinsToAPerson(node: any): boolean {
  if (!node || typeof node !== 'object') return false;
  if (node instanceof Date) return false;
  if (Array.isArray(node)) return node.some(pinsToAPerson);

  for (const [key, value] of Object.entries(node)) {
    if (PERSON_COLUMNS.has(key) && typeof value === 'string') return true;
    if (pinsToAPerson(value)) return true;
  }

  return false;
}

/**
 * Why a query counts as confined to one tenant, or null when nothing confines it.
 *
 * The three answers are the only legitimate ones in this codebase: name the company,
 * name the row, or name the person whose rows these are.
 */
export function tenantDiscriminator(args: any): string | null {
  const where = args?.where ?? {};

  if (mentionsCompany(where)) return 'companyId';
  if (pinsOneRow(where)) return 'single row by id';
  if (pinsToAPerson(where)) return 'one person by id';

  return null;
}
