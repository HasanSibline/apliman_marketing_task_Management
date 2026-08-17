/**
 * Who may use a workflow.
 *
 * A workflow belongs to a department, and optionally to particular teams inside it.
 * Everything about that decision lives in this one function so the task form, the
 * workflow list and the create-task guard cannot disagree — three places asking the
 * same question and answering it differently is how "why can't I pick that?" becomes
 * unanswerable.
 *
 * The rule restricts which workflows a person may *choose*. It deliberately says
 * nothing about which tasks a person may see. Restricting sight by workflow would take
 * work away from the person it is assigned to, and a task nobody can find is worse than
 * a workflow anybody can pick.
 *
 * Absence means unrestricted, at both levels. A workflow with no department is
 * company-wide, which is what every workflow created before this existed is, so adding
 * the field changed nothing until somebody deliberately narrows one. A workflow with a
 * department and no teams belongs to that whole department. Empty-means-nobody would
 * have locked every existing workflow the moment it shipped.
 */

/** Roles that configure the company and are never scoped out of their own workflows. */
const UNRESTRICTED_ROLES = ['SUPER_ADMIN', 'COMPANY_ADMIN', 'ADMIN'];

export interface WorkflowScope {
  departmentId?: string | null;
  teamIds?: string[] | null;
}

export interface WorkflowUser {
  role?: string | null;
  departmentId?: string | null;
  /** Ids of every team this person belongs to. A person may be in several. */
  teamIds?: string[] | null;
}

export function canUseWorkflow(user: WorkflowUser, workflow: WorkflowScope): boolean {
  if (user.role && UNRESTRICTED_ROLES.includes(user.role)) return true;

  // No department set: company-wide.
  if (!workflow.departmentId) return true;

  // Scoped to a department, and this person is not in it.
  if (!user.departmentId || user.departmentId !== workflow.departmentId) return false;

  const teams = workflow.teamIds ?? [];
  if (teams.length === 0) return true;

  // Narrowed to teams. Membership of any one of them is enough: a person in two teams
  // that both work this way should not be excluded for belonging to the second.
  const mine = new Set(user.teamIds ?? []);
  return teams.some((id) => mine.has(id));
}

/** The same rule over a list, for the pickers that have to show only what is usable. */
export function usableWorkflows<T extends WorkflowScope>(user: WorkflowUser, workflows: T[]): T[] {
  return workflows.filter((w) => canUseWorkflow(user, w));
}

/**
 * Why a workflow is unavailable, for a message somebody can act on.
 *
 * "You do not have permission" tells a person nothing they can do. Naming the reason
 * lets them ask the right person for the right thing.
 */
export function whyNotUsable(user: WorkflowUser, workflow: WorkflowScope): string | null {
  if (canUseWorkflow(user, workflow)) return null;
  if (!user.departmentId) return 'You are not in a department yet, and this workflow belongs to one.';
  if (workflow.departmentId !== user.departmentId) return 'This workflow belongs to another department.';
  return 'This workflow is limited to specific teams, and you are not in one of them.';
}
