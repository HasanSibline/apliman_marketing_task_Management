-- Move existing tasks off the approval states.
--
-- Separate from the migration that added TODO on purpose: PostgreSQL will not let a
-- newly added enum value be used until the transaction that added it has committed.
--
-- Everything before work starts becomes TODO. That is the honest reading of a task
-- waiting for approval, just approved, or assigned to someone: nobody had started it.
-- IN_PROGRESS, COMPLETED and ARCHIVED are left exactly as they are.
UPDATE "tasks"
SET "phase" = 'TODO'
WHERE "phase" IN ('PENDING_APPROVAL', 'APPROVED', 'ASSIGNED', 'REJECTED');
