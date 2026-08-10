-- A task now sits in one of three places: TODO, IN_PROGRESS, COMPLETED.
--
-- Adding the value only. The states the removed approval step needed stay in the
-- type because PostgreSQL cannot drop an enum value while rows may still hold it,
-- and rewriting the type in place would rewrite every task row to do it.
ALTER TYPE "TaskPhase" ADD VALUE IF NOT EXISTS 'TODO';
