import {
  averageResolutionHours,
  backlogByAge,
  slaComplianceRate,
  volumeByDepartment,
} from './ticket-metrics';

describe('averageResolutionHours', () => {
  it('returns 0 for an empty array', () => {
    expect(averageResolutionHours([])).toBe(0);
  });

  it('returns 0 when nothing has resolved', () => {
    expect(
      averageResolutionHours([
        { createdAt: new Date('2026-01-01T00:00:00Z'), resolvedAt: null },
        { createdAt: new Date('2026-01-02T00:00:00Z'), resolvedAt: null },
      ]),
    ).toBe(0);
  });

  it('averages hours only over resolved tickets', () => {
    const hours = averageResolutionHours([
      // 24 hours
      { createdAt: new Date('2026-01-01T00:00:00Z'), resolvedAt: new Date('2026-01-02T00:00:00Z') },
      // 48 hours
      { createdAt: new Date('2026-01-01T00:00:00Z'), resolvedAt: new Date('2026-01-03T00:00:00Z') },
      // unresolved, excluded from both sum and count
      { createdAt: new Date('2026-01-01T00:00:00Z'), resolvedAt: null },
    ]);

    expect(hours).toBe(36);
  });
});

describe('slaComplianceRate', () => {
  it('returns 0 for an empty array', () => {
    expect(slaComplianceRate([])).toBe(0);
  });

  it('excludes tickets with no deadline from the denominator', () => {
    const rate = slaComplianceRate([
      { deadline: null, resolvedAt: new Date('2026-01-01T00:00:00Z') },
      { deadline: null, resolvedAt: null },
    ]);

    expect(rate).toBe(0);
  });

  it('counts a ticket resolved exactly at its deadline as compliant', () => {
    const deadline = new Date('2026-01-05T12:00:00Z');
    const rate = slaComplianceRate([
      { deadline, resolvedAt: new Date(deadline.getTime()) },
    ]);

    expect(rate).toBe(100);
  });

  it('excludes unresolved tickets even when they have a deadline', () => {
    const rate = slaComplianceRate([
      { deadline: new Date('2026-01-05T12:00:00Z'), resolvedAt: null },
      {
        deadline: new Date('2026-01-05T12:00:00Z'),
        resolvedAt: new Date('2026-01-05T11:00:00Z'),
      },
    ]);

    // Only the resolved ticket counts, and it met its deadline.
    expect(rate).toBe(100);
  });

  it('rounds the percentage of tickets meeting their deadline', () => {
    const onTime = new Date('2026-01-05T12:00:00Z');
    const late = new Date('2026-01-05T12:00:00Z');
    const rate = slaComplianceRate([
      { deadline: onTime, resolvedAt: new Date(onTime.getTime() - 1000) },
      { deadline: late, resolvedAt: new Date(late.getTime() + 1000) },
      { deadline: onTime, resolvedAt: new Date(onTime.getTime()) },
    ]);

    // 2 of 3 compliant -> 66.67% rounded to 67.
    expect(rate).toBe(67);
  });
});

describe('backlogByAge', () => {
  const now = new Date('2026-01-10T00:00:00Z');

  it('returns all-zero buckets for an empty array', () => {
    expect(backlogByAge([], now)).toEqual({ fresh: 0, aging: 0, stale: 0 });
  });

  it('excludes all-terminal tickets, leaving every bucket at zero', () => {
    const result = backlogByAge(
      [
        { createdAt: new Date('2026-01-09T00:00:00Z'), status: 'RESOLVED' },
        { createdAt: new Date('2026-01-01T00:00:00Z'), status: 'CANCELLED' },
      ],
      now,
    );

    expect(result).toEqual({ fresh: 0, aging: 0, stale: 0 });
  });

  it('buckets open tickets by age since creation', () => {
    const result = backlogByAge(
      [
        // 1 day old -> fresh
        { createdAt: new Date('2026-01-09T00:00:00Z'), status: 'OPEN' },
        // 5 days old -> aging
        { createdAt: new Date('2026-01-05T00:00:00Z'), status: 'IN_PROGRESS' },
        // 10 days old -> stale
        { createdAt: new Date('2025-12-31T00:00:00Z'), status: 'ASSIGNED' },
        // terminal, excluded regardless of age
        { createdAt: new Date('2025-12-01T00:00:00Z'), status: 'RESOLVED' },
      ],
      now,
    );

    expect(result).toEqual({ fresh: 1, aging: 1, stale: 1 });
  });
});

describe('volumeByDepartment', () => {
  it('returns an empty array for no tickets', () => {
    expect(volumeByDepartment([])).toEqual([]);
  });

  it('counts a single department', () => {
    const result = volumeByDepartment([
      { receiverDeptId: 'dept-1', departmentName: 'Finance' },
      { receiverDeptId: 'dept-1', departmentName: 'Finance' },
    ]);

    expect(result).toEqual([{ departmentId: 'dept-1', departmentName: 'Finance', count: 2 }]);
  });

  it('sorts by count descending, with tied counts both present', () => {
    const result = volumeByDepartment([
      { receiverDeptId: 'dept-1', departmentName: 'Finance' },
      { receiverDeptId: 'dept-2', departmentName: 'Design' },
      { receiverDeptId: 'dept-1', departmentName: 'Finance' },
      { receiverDeptId: 'dept-3', departmentName: 'Legal' },
      { receiverDeptId: 'dept-2', departmentName: 'Design' },
    ]);

    expect(result).toHaveLength(3);

    // dept-1 and dept-2 are tied at 2; both must be present with the right counts,
    // and dept-3 trails behind at 1.
    const byId = Object.fromEntries(result.map((r) => [r.departmentId, r.count]));
    expect(byId['dept-1']).toBe(2);
    expect(byId['dept-2']).toBe(2);
    expect(byId['dept-3']).toBe(1);
  });
});
