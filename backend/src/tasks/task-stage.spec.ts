import { taskStage, phasesForStage, isTaskStage, TASK_STAGES } from './task-stage';

describe('taskStage', () => {
  it('reads the three stages straight off the enum', () => {
    expect(taskStage({ phase: 'TODO' })).toBe('TODO');
    expect(taskStage({ phase: 'IN_PROGRESS' })).toBe('IN_PROGRESS');
    expect(taskStage({ phase: 'COMPLETED' })).toBe('COMPLETED');
  });

  it('folds every state the approval step needed into To do', () => {
    // None of these described anything a person cared about, and in all of them
    // nobody had started the work.
    for (const phase of ['PENDING_APPROVAL', 'APPROVED', 'ASSIGNED', 'REJECTED']) {
      expect(taskStage({ phase })).toBe('TODO');
    }
  });

  it('treats archived as finished rather than as a fourth place', () => {
    expect(taskStage({ phase: 'ARCHIVED' })).toBe('COMPLETED');
  });

  it('believes a completion date over the phase column', () => {
    // These have disagreed: the phase moved and the date did not, or the reverse.
    expect(taskStage({ phase: 'IN_PROGRESS', completedAt: new Date() })).toBe('COMPLETED');
    expect(taskStage({ phase: 'ASSIGNED', completedAt: '2026-01-01T00:00:00Z' })).toBe('COMPLETED');
  });

  it('believes a workflow end phase too', () => {
    expect(taskStage({ phase: 'IN_PROGRESS', currentPhase: { isEndPhase: true } })).toBe('COMPLETED');
  });

  it('does not mistake an ordinary workflow phase for completion', () => {
    expect(taskStage({ phase: 'IN_PROGRESS', currentPhase: { isEndPhase: false } })).toBe('IN_PROGRESS');
  });

  it('puts anything it does not recognise where it can be seen', () => {
    // Hiding an unknown state in Completed would bury work; To do surfaces it.
    expect(taskStage({ phase: 'SOMETHING_ELSE' })).toBe('TODO');
    expect(taskStage({ phase: null })).toBe('TODO');
    expect(taskStage({})).toBe('TODO');
  });
});

describe('phasesForStage', () => {
  it('covers every legacy value, so nothing falls outside all three stages', () => {
    const everyPhase = [
      'TODO', 'PENDING_APPROVAL', 'APPROVED', 'ASSIGNED',
      'REJECTED', 'IN_PROGRESS', 'COMPLETED', 'ARCHIVED',
    ];
    const covered = TASK_STAGES.flatMap(phasesForStage);

    for (const phase of everyPhase) expect(covered).toContain(phase);
  });

  it('claims each phase for exactly one stage', () => {
    const covered = TASK_STAGES.flatMap(phasesForStage);
    expect(new Set(covered).size).toBe(covered.length);
  });

  it('agrees with taskStage on every value it claims', () => {
    for (const stage of TASK_STAGES) {
      for (const phase of phasesForStage(stage)) {
        expect(taskStage({ phase })).toBe(stage);
      }
    }
  });
});

describe('isTaskStage', () => {
  it('accepts the three and nothing else', () => {
    expect(isTaskStage('TODO')).toBe(true);
    expect(isTaskStage('COMPLETED')).toBe(true);
    expect(isTaskStage('ASSIGNED')).toBe(false);
    expect(isTaskStage('')).toBe(false);
    expect(isTaskStage(undefined)).toBe(false);
  });
});
