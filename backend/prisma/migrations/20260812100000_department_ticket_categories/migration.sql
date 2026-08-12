-- What a department can be asked for belongs to that department.
--
-- Every ticket previously chose from one hardcoded list, so a request to Finance was
-- offered "QA / Bug" and a request to Design was offered "Purchase Order". Four of
-- the seven entries in that list were not even valid values of the TicketType enum,
-- so choosing one failed to create the ticket at all.
--
-- Categories are free text per department rather than a shared enum: what Finance is
-- asked for has nothing in common with what Design is asked for, and a shared list
-- forces every department to carry every other department's vocabulary.
ALTER TABLE "departments" ADD COLUMN "ticketCategories" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "tickets" ADD COLUMN "category" TEXT;
