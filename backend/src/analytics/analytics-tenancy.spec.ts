import { AnalyticsService } from './analytics.service';
import { createPrismaRecorder, ModelHandlers } from '../testing/prisma-recorder';

/**
 * The bug class: an aggregate that is right for the platform and wrong for the tenant.
 *
 * A count has no owner. It comes back as a number that looks plausible whatever rows went
 * into it, so a missing company filter here produces no error, no empty screen and no
 * complaint: just a dashboard quietly reporting other people's work as this team's. It is
 * the least visible kind of cross-tenant leak and the one most likely to survive a code
 * review, which is why the assertions below are on the queries rather than the totals.
 *
 * Locks down the audited defect in getTeamAnalytics, which counted every tenant's
 * completed work.
 */

const COMPANY_A = 'company-a';
const CALLER = 'manager-in-company-a';

const ROSTER = [
  { id: 'user-1', name: 'Ada', email: 'ada@a.test', position: 'Lead', status: 'ACTIVE' },
  { id: 'user-2', name: 'Bo', email: 'bo@a.test', position: 'Designer', status: 'ACTIVE' },
];

function buildService(handlers: ModelHandlers) {
  const recorder = createPrismaRecorder(handlers);
  const config = { get: () => undefined } as any;
  return { service: new AnalyticsService(recorder.prisma, config), recorder };
}

function forCaller(role: string, companyId: string | null) {
  return buildService({
    user: { findUnique: { companyId, role }, findMany: ROSTER, count: 0 },
    phase: { findMany: [{ id: 'phase-done' }] },
    task: { count: 0, findMany: [] },
  });
}

describe('getTeamAnalytics', () => {
  it('builds the roster from the caller\'s company alone', async () => {
    const { service, recorder } = forCaller('MANAGER', COMPANY_A);

    await service.getTeamAnalytics(CALLER);

    const [roster] = recorder.callsTo('user', 'findMany');
    expect(roster.args.where).toMatchObject({ companyId: COMPANY_A });
  });

  it('counts the work finished this week inside the company, not across the platform', async () => {
    const { service, recorder } = forCaller('MANAGER', COMPANY_A);

    await service.getTeamAnalytics(CALLER);

    // The weekly figure is the one the audit found reading every tenant's rows. It is
    // the only task count in this method narrowed by a date, so it is identifiable
    // without depending on the order the counts happen to run in.
    const weekly = recorder
      .callsTo('task', 'count')
      .filter((call) => call.args.where?.updatedAt !== undefined);

    expect(weekly).toHaveLength(1);
    expect(weekly[0].args.where).toMatchObject({ companyId: COMPANY_A });
  });

  it('never asks a company-owning model a question with no company in it', async () => {
    const { service, recorder } = forCaller('MANAGER', COMPANY_A);

    await service.getTeamAnalytics(CALLER);

    const unscoped = recorder
      .callsTo('user')
      .filter((call) => call.method === 'findMany' || call.method === 'count')
      .filter((call) => call.args.where?.companyId === undefined);

    expect(unscoped).toEqual([]);
  });

  it('leaves a SUPER_ADMIN unscoped on purpose, having no company to be scoped to', async () => {
    // The platform owner's view is meant to span tenants. Stated here so that the
    // absence of a filter in this one case reads as a decision rather than an oversight.
    const { service, recorder } = forCaller('SUPER_ADMIN', null);

    await service.getTeamAnalytics('the-platform-owner');

    const [roster] = recorder.callsTo('user', 'findMany');
    expect(roster.args.where.companyId).toBeUndefined();
  });

  it('scopes to nothing rather than to everything when the caller cannot be identified', async () => {
    const { service, recorder } = buildService({
      user: { findUnique: null, findMany: [] },
      phase: { findMany: [] },
    });

    await service.getTeamAnalytics('ghost');

    expect(recorder.callsTo('user', 'findMany')).toHaveLength(1);
  });
});

describe('exportData', () => {
  it('exports one company\'s tasks, so a spreadsheet cannot say more than the dashboard', async () => {
    const { service, recorder } = buildService({
      user: { findUnique: { companyId: COMPANY_A, role: 'COMPANY_ADMIN' } },
      task: { findMany: [] },
    });

    await service.exportData(CALLER, 'csv');

    const [query] = recorder.callsTo('task', 'findMany');
    expect(query.args.where).toMatchObject({ companyId: COMPANY_A });
  });
});
