import { isOverdue, dueSoon, TERMINAL_TICKET_STATUSES } from './ticket-deadline';

describe('isOverdue', () => {
  const now = new Date('2026-08-26T12:00:00.000Z');

  it('is false when there is no deadline', () => {
    expect(isOverdue({ deadline: null, status: 'OPEN' }, now)).toBe(false);
  });

  it('is true for an open ticket whose deadline has passed', () => {
    expect(isOverdue({ deadline: new Date('2026-08-25T12:00:00.000Z'), status: 'OPEN' }, now)).toBe(true);
  });

  it('is false for a ticket whose deadline is in the future', () => {
    expect(isOverdue({ deadline: new Date('2026-08-27T12:00:00.000Z'), status: 'OPEN' }, now)).toBe(false);
  });

  it.each(TERMINAL_TICKET_STATUSES)('is false for a %s ticket even with a past deadline', (status) => {
    expect(isOverdue({ deadline: new Date('2026-08-01T00:00:00.000Z'), status }, now)).toBe(false);
  });

  it('is false exactly at the deadline instant', () => {
    expect(isOverdue({ deadline: new Date(now), status: 'OPEN' }, now)).toBe(false);
  });

  it('is true one millisecond past the deadline', () => {
    expect(isOverdue({ deadline: new Date(now.getTime() - 1), status: 'IN_PROGRESS' }, now)).toBe(true);
  });

  it('accepts an ISO string deadline the same as a Date', () => {
    expect(isOverdue({ deadline: '2026-08-25T12:00:00.000Z', status: 'ASSIGNED' }, now)).toBe(true);
  });

  it('is false for an unparsable deadline string', () => {
    expect(isOverdue({ deadline: 'not-a-date', status: 'OPEN' }, now)).toBe(false);
  });
});

describe('dueSoon', () => {
  const now = new Date('2026-08-26T12:00:00.000Z');

  it('is false when there is no deadline', () => {
    expect(dueSoon({ deadline: null, status: 'OPEN' }, now)).toBe(false);
  });

  it('is false once the deadline has already passed (that is isOverdue territory)', () => {
    expect(dueSoon({ deadline: new Date('2026-08-25T12:00:00.000Z'), status: 'OPEN' }, now)).toBe(false);
  });

  it('is true within the default 24-hour window', () => {
    expect(dueSoon({ deadline: new Date('2026-08-27T00:00:00.000Z'), status: 'OPEN' }, now)).toBe(true);
  });

  it('is false just outside the default 24-hour window', () => {
    expect(dueSoon({ deadline: new Date('2026-08-27T12:00:01.000Z'), status: 'OPEN' }, now)).toBe(false);
  });

  it('is false far in the future', () => {
    expect(dueSoon({ deadline: new Date('2026-09-26T12:00:00.000Z'), status: 'OPEN' }, now)).toBe(false);
  });

  it.each(TERMINAL_TICKET_STATUSES)('is false for a %s ticket even inside the window', (status) => {
    expect(dueSoon({ deadline: new Date('2026-08-27T00:00:00.000Z'), status }, now)).toBe(false);
  });

  it('honours a custom hoursAhead window', () => {
    const deadline = new Date('2026-08-28T12:00:00.000Z'); // 48h out
    expect(dueSoon({ deadline, status: 'OPEN' }, now, 24)).toBe(false);
    expect(dueSoon({ deadline, status: 'OPEN' }, now, 72)).toBe(true);
  });

  it('is false exactly at the deadline instant', () => {
    expect(dueSoon({ deadline: new Date(now), status: 'OPEN' }, now)).toBe(false);
  });
});
