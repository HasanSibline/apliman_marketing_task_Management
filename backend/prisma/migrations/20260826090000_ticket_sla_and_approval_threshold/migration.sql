-- When a ticket was actually resolved, distinct from updatedAt (which moves on
-- every later edit: a comment, a reopen-and-reresolve cycle). Needed for accurate
-- resolution-time and SLA-compliance reporting.
ALTER TABLE "tickets"
  ADD COLUMN IF NOT EXISTS "resolvedAt" TIMESTAMP(3);

-- Purchase-order tickets at or above this amount require receiver-manager approval
-- regardless of what the requester chose at creation. Null (the default) means the
-- gate is off: no company is opted into it just because the column exists.
ALTER TABLE "company_settings"
  ADD COLUMN IF NOT EXISTS "ticketApprovalThreshold" DOUBLE PRECISION;
