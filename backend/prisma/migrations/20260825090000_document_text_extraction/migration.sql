-- Text read out of uploaded documents.
--
-- Extraction is asynchronous: an upload returns as soon as the file is stored, and the
-- text arrives afterwards. The columns are therefore nullable, and ocrStatus exists so
-- that an empty extractedText can be told apart from one that was never attempted.
ALTER TABLE "task_files"
  ADD COLUMN IF NOT EXISTS "extractedText" TEXT,
  ADD COLUMN IF NOT EXISTS "ocrConfidence" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "ocrStatus" TEXT NOT NULL DEFAULT 'PENDING';

ALTER TABLE "ticket_attachments"
  ADD COLUMN IF NOT EXISTS "extractedText" TEXT,
  ADD COLUMN IF NOT EXISTS "ocrConfidence" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "ocrStatus" TEXT NOT NULL DEFAULT 'PENDING';

-- Rows that predate extraction were never attempted, and saying so is more useful than
-- leaving them indistinguishable from documents that produced no text.
UPDATE "task_files" SET "ocrStatus" = 'NOT_ATTEMPTED' WHERE "extractedText" IS NULL;
UPDATE "ticket_attachments" SET "ocrStatus" = 'NOT_ATTEMPTED' WHERE "extractedText" IS NULL;
