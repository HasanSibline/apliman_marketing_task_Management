import { AiService } from './ai.service';
import { createPrismaRecorder, ModelHandlers } from '../testing/prisma-recorder';

/**
 * The bug class: a company filter applied only when a company happens to be known.
 *
 * "No tenant" and "all tenants" are one keystroke apart when the filter is spread in
 * conditionally, and the difference only shows up for the accounts that have no company:
 * SUPER_ADMIN, whose companyId the seed leaves null by design. Nothing throws, no request
 * fails, and every other tenant's knowledge quietly joins the prompt.
 *
 * Locks down the audited defect in getActiveKnowledgeSources, which dropped the companyId
 * filter whenever the caller had no company, and so returned every tenant's knowledge to
 * the model.
 */

const COMPANY_A = 'company-a';

const SOURCES = [
  { id: 'src-1', name: 'Brand voice', type: 'TEXT', content: 'Warm, plain', priority: 10 },
];

function buildService(handlers: ModelHandlers) {
  const recorder = createPrismaRecorder(handlers);

  const service = new AiService(
    { post: jest.fn(), get: jest.fn() } as any,
    { get: (_key: string, fallback?: any) => fallback } as any,
    recorder.prisma,
    {} as any,
    { registerProber: jest.fn() } as any,
  );

  return { service, recorder };
}

/** The method is private because nothing outside the service should choose the scope. */
function knowledgeFor(service: AiService, userId: string) {
  return (service as any).getActiveKnowledgeSources(userId);
}

describe('the knowledge sources put in front of the model', () => {
  it('are confined to the caller\'s company, by the query rather than by the caller', async () => {
    const { service, recorder } = buildService({
      user: { findUnique: { companyId: COMPANY_A } },
      knowledgeSource: { findMany: SOURCES },
    });

    await expect(knowledgeFor(service, 'user-a')).resolves.toHaveLength(1);

    const [query] = recorder.callsTo('knowledgeSource', 'findMany');
    expect(query.args.where).toMatchObject({ companyId: COMPANY_A, isActive: true });
  });

  it('are empty for a caller with no company, which is every SUPER_ADMIN the seed makes', async () => {
    const { service, recorder } = buildService({
      user: { findUnique: { companyId: null } },
      knowledgeSource: { findMany: SOURCES },
    });

    await expect(knowledgeFor(service, 'the-platform-owner')).resolves.toEqual([]);

    // Not merely filtered out afterwards. No company means there is nothing to ask for,
    // so the question is never put to the database at all.
    expect(recorder.callsTo('knowledgeSource', 'findMany')).toHaveLength(0);
  });

  it('are empty when the caller cannot be identified at all', async () => {
    const { service, recorder } = buildService({ knowledgeSource: { findMany: SOURCES } });

    await expect(knowledgeFor(service, '')).resolves.toEqual([]);
    expect(recorder.callsTo('knowledgeSource', 'findMany')).toHaveLength(0);
  });

  it('are empty when the user row has gone, rather than falling back to everything', async () => {
    const { service, recorder } = buildService({
      user: { findUnique: null },
      knowledgeSource: { findMany: SOURCES },
    });

    await expect(knowledgeFor(service, 'deleted-user')).resolves.toEqual([]);
    expect(recorder.callsTo('knowledgeSource', 'findMany')).toHaveLength(0);
  });

  it('reach the prompt payload empty, not absent, when the caller has no company', async () => {
    // The end of the road for the leak: whatever this method returns is what the AI
    // service is sent, so the assertion is on the request body rather than the helper.
    const { service } = buildService({
      user: { findUnique: { companyId: null } },
      knowledgeSource: { findMany: SOURCES },
    });

    const upstream = jest
      .spyOn(service as any, 'callAiService')
      .mockResolvedValue({ description: 'd', goals: 'g' });

    await service.generateContentFromAI('Launch plan', 'GENERAL', 'the-platform-owner');

    expect(upstream).toHaveBeenCalledWith(
      'the-platform-owner',
      '/generate-content',
      expect.objectContaining({ knowledge_sources: [] }),
      expect.anything(),
    );
  });
});
