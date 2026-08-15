-- What actually happened to a ticket, in the words of whoever closed it.
--
-- Both nullable and both additive, so this is safe to apply while the previous build
-- is still serving: an older backend neither writes nor reads them, and every existing
-- row keeps working with both as NULL.
--
-- Deliberately two columns rather than one shared "closing note". A ticket can be
-- resolved, reopened and later cancelled; a single column would overwrite the answer
-- with the reason for abandoning it, which is the one combination where the first note
-- is the more valuable of the two.
ALTER TABLE "tickets" ADD COLUMN "resolutionNote" TEXT;
ALTER TABLE "tickets" ADD COLUMN "cancellationReason" TEXT;
