-- Platform-wide AI credential.
-- A super admin sets one key in Settings → AI Platform and every company that has no
-- key of its own uses it. Companies with their own key keep using theirs; the platform
-- key also covers them while their own key is rate-limited.
ALTER TABLE "system_settings"
  ADD COLUMN IF NOT EXISTS "platformAiEnabled"  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "platformAiProvider" TEXT    NOT NULL DEFAULT 'anthropic',
  ADD COLUMN IF NOT EXISTS "platformAiApiKey"   TEXT,
  ADD COLUMN IF NOT EXISTS "platformAiModel"    TEXT;

-- Clear the permanent AI lockouts left behind by the old quota logic, which flagged a
-- company on its first 429 and — on FREE_TRIAL — never set a reset time, so AI stayed
-- off forever. Quota is now strike-based and every lockout expires.
UPDATE "companies"
   SET "aiQuotaExhausted" = false,
       "aiQuotaResetAt"   = NULL
 WHERE "aiQuotaExhausted" = true;
