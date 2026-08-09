-- Carry-forward link for objectives that a year close moves into the next year.
-- Nullable and additive, so it is safe on a live table: existing rows keep NULL.
ALTER TABLE "objectives" ADD COLUMN IF NOT EXISTS "carriedFromId" TEXT;

-- Self-reference. ON DELETE SET NULL rather than CASCADE: deleting last year's
-- objective must not delete the one carrying its work forward.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'objectives_carriedFromId_fkey'
  ) THEN
    ALTER TABLE "objectives"
      ADD CONSTRAINT "objectives_carriedFromId_fkey"
      FOREIGN KEY ("carriedFromId") REFERENCES "objectives"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "objectives_carriedFromId_idx" ON "objectives"("carriedFromId");
