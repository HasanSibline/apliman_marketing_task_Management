-- The platform-wide AI key feature was removed: a company now either has its own
-- provider chain or has no AI at all. The columns outlived the feature, and
-- "platformAiApiKey" was still holding an encrypted provider credential that no code
-- read and nobody was watching.
--
-- Null the secret before dropping the column, not after. DROP COLUMN removes the
-- column from the live table but the old row versions still hold the ciphertext until
-- they are vacuumed, and any backup taken in between carries it. Overwriting first
-- means the value is gone from the row before the structure changes.
UPDATE "system_settings" SET "platformAiApiKey" = NULL;

ALTER TABLE "system_settings" DROP COLUMN IF EXISTS "platformAiApiKey";
ALTER TABLE "system_settings" DROP COLUMN IF EXISTS "platformAiEnabled";
ALTER TABLE "system_settings" DROP COLUMN IF EXISTS "platformAiProvider";
ALTER TABLE "system_settings" DROP COLUMN IF EXISTS "platformAiModel";
