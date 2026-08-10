-- A quarter now records when it actually ended, so a cycle the team finished early
-- can be reported as such instead of silently appearing to have run its full span.
-- Nullable on purpose: quarters closed before this existed have no honest value, and
-- back-filling them with their planned end date would assert something untrue.
ALTER TABLE "quarters" ADD COLUMN "closedAt" TIMESTAMP(3);
