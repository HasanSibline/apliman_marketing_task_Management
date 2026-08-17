import { canUseWorkflow, usableWorkflows, whyNotUsable } from './workflow-access';

/**
 * The cases that matter are the empty ones. Both levels of this rule treat absence as
 * "unrestricted", and getting either backwards locks every workflow that already exists
 * the moment the feature ships, which is the failure worth having tests for.
 */
describe('canUseWorkflow', () => {
  const inMarketing = { role: 'EMPLOYEE', departmentId: 'dept-marketing', teamIds: ['team-social'] };

  describe('a workflow with no department', () => {
    it('is available to anyone, which is every workflow created before this existed', () => {
      expect(canUseWorkflow(inMarketing, {})).toBe(true);
      expect(canUseWorkflow(inMarketing, { departmentId: null, teamIds: [] })).toBe(true);
    });

    it('is available even to somebody with no department of their own', () => {
      expect(canUseWorkflow({ role: 'EMPLOYEE', departmentId: null }, { departmentId: null })).toBe(true);
    });
  });

  describe('a workflow scoped to a department', () => {
    it('admits that department', () => {
      expect(canUseWorkflow(inMarketing, { departmentId: 'dept-marketing' })).toBe(true);
    });

    it('excludes every other department', () => {
      expect(canUseWorkflow(inMarketing, { departmentId: 'dept-finance' })).toBe(false);
    });

    it('excludes somebody who is in no department at all', () => {
      const nobody = { role: 'EMPLOYEE', departmentId: null };
      expect(canUseWorkflow(nobody, { departmentId: 'dept-marketing' })).toBe(false);
    });

    it('admits the whole department when no teams are named', () => {
      const noTeams = { role: 'EMPLOYEE', departmentId: 'dept-marketing', teamIds: [] };
      expect(canUseWorkflow(noTeams, { departmentId: 'dept-marketing', teamIds: [] })).toBe(true);
    });
  });

  describe('a workflow narrowed to teams', () => {
    const scoped = { departmentId: 'dept-marketing', teamIds: ['team-social', 'team-brand'] };

    it('admits a member of one of them', () => {
      expect(canUseWorkflow(inMarketing, scoped)).toBe(true);
    });

    it('admits somebody in several teams for belonging to any one of them', () => {
      const both = { role: 'EMPLOYEE', departmentId: 'dept-marketing', teamIds: ['team-events', 'team-brand'] };
      expect(canUseWorkflow(both, scoped)).toBe(true);
    });

    it('excludes a colleague in the same department but another team', () => {
      const other = { role: 'EMPLOYEE', departmentId: 'dept-marketing', teamIds: ['team-events'] };
      expect(canUseWorkflow(other, scoped)).toBe(false);
    });

    it('excludes somebody in no team', () => {
      const teamless = { role: 'EMPLOYEE', departmentId: 'dept-marketing', teamIds: [] };
      expect(canUseWorkflow(teamless, scoped)).toBe(false);
    });

    it('excludes on the department first, before teams are even considered', () => {
      const outsider = { role: 'EMPLOYEE', departmentId: 'dept-finance', teamIds: ['team-social'] };
      expect(canUseWorkflow(outsider, scoped)).toBe(false);
    });
  });

  describe('roles that configure the company', () => {
    it.each(['SUPER_ADMIN', 'COMPANY_ADMIN', 'ADMIN'])('%s is never scoped out', (role) => {
      const admin = { role, departmentId: 'dept-finance', teamIds: [] };
      expect(canUseWorkflow(admin, { departmentId: 'dept-marketing', teamIds: ['team-social'] })).toBe(true);
    });

    it('does not extend to a manager, who belongs to one department like anybody else', () => {
      const manager = { role: 'MANAGER', departmentId: 'dept-finance', teamIds: [] };
      expect(canUseWorkflow(manager, { departmentId: 'dept-marketing' })).toBe(false);
    });
  });
});

describe('usableWorkflows', () => {
  it('keeps the company-wide ones alongside the ones they are scoped into', () => {
    const user = { role: 'EMPLOYEE', departmentId: 'dept-marketing', teamIds: ['team-social'] };
    const all = [
      { id: 'company-wide' },
      { id: 'marketing', departmentId: 'dept-marketing' },
      { id: 'social-only', departmentId: 'dept-marketing', teamIds: ['team-social'] },
      { id: 'events-only', departmentId: 'dept-marketing', teamIds: ['team-events'] },
      { id: 'finance', departmentId: 'dept-finance' },
    ];

    expect(usableWorkflows(user, all).map((w) => w.id)).toEqual([
      'company-wide',
      'marketing',
      'social-only',
    ]);
  });
});

describe('whyNotUsable', () => {
  it('says nothing when the workflow is usable', () => {
    expect(whyNotUsable({ role: 'EMPLOYEE', departmentId: 'd1' }, { departmentId: 'd1' })).toBeNull();
  });

  it('distinguishes the wrong department from the wrong team, since the fix differs', () => {
    const user = { role: 'EMPLOYEE', departmentId: 'dept-marketing', teamIds: ['team-events'] };

    expect(whyNotUsable(user, { departmentId: 'dept-finance' })).toMatch(/another department/);
    expect(
      whyNotUsable(user, { departmentId: 'dept-marketing', teamIds: ['team-social'] }),
    ).toMatch(/specific teams/);
  });

  it('names having no department as its own case', () => {
    expect(whyNotUsable({ role: 'EMPLOYEE' }, { departmentId: 'd1' })).toMatch(/not in a department/);
  });
});
