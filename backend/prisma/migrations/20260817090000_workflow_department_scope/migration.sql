-- Which department, and optionally which teams, a workflow belongs to.
--
-- Both additive and both defaulting to "no restriction", so every workflow that exists
-- today stays available to the whole company and nothing changes for anyone until an
-- admin deliberately narrows one. That also makes this safe to apply while the previous
-- build is still serving: the old code neither writes nor reads either column.
--
-- departmentId is a real foreign key so a department cannot be deleted out from under a
-- workflow silently. teamIds is an array rather than a join table, matching the pattern
-- already used by phases.allowedUsers and departments.ticketCategories; a stale id in it
-- simply stops matching anybody, which is the harmless failure.
ALTER TABLE "workflows" ADD COLUMN "departmentId" TEXT;
ALTER TABLE "workflows" ADD COLUMN "teamIds" TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE "workflows"
  ADD CONSTRAINT "workflows_departmentId_fkey"
  FOREIGN KEY ("departmentId") REFERENCES "departments"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Reading "every workflow this person may use" is on the hot path of the task form.
CREATE INDEX "workflows_departmentId_idx" ON "workflows"("departmentId");
