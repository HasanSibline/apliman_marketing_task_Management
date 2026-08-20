-- A company's AI providers, in the order the gateway should try them.
--
-- Purely additive: Company.aiApiKey and Company.aiProvider are left in place and keep
-- working, so a tenant configured the old way is untouched until somebody migrates it.
-- The gateway reads the chain when rows exist and falls back to the legacy pair when
-- they do not, which is what makes this safe to deploy under a running build.
CREATE TABLE "ai_provider_configs" (
  "id"            TEXT NOT NULL,
  "companyId"     TEXT NOT NULL,
  "provider"      TEXT NOT NULL,
  "model"         TEXT,
  "encryptedKey"  TEXT NOT NULL,
  "label"         TEXT,
  "priority"      INTEGER NOT NULL DEFAULT 100,
  "enabled"       BOOLEAN NOT NULL DEFAULT true,
  "isEmergency"   BOOLEAN NOT NULL DEFAULT false,
  "monthlyBudget" DOUBLE PRECISION,
  "status"        TEXT NOT NULL DEFAULT 'HEALTHY',
  "cooldownUntil" TIMESTAMP(3),
  "lastError"     TEXT,
  "lastSuccessAt" TIMESTAMP(3),
  "failureCount"  INTEGER NOT NULL DEFAULT 0,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ai_provider_configs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ai_provider_configs_companyId_enabled_priority_idx"
  ON "ai_provider_configs"("companyId", "enabled", "priority");

ALTER TABLE "ai_provider_configs"
  ADD CONSTRAINT "ai_provider_configs_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Aggregated per day per entry. One row per request is the right shape for a warehouse
-- and the wrong shape for a table that only ever grows.
CREATE TABLE "ai_provider_usage" (
  "id"             TEXT NOT NULL,
  "configId"       TEXT NOT NULL,
  "companyId"      TEXT NOT NULL,
  "date"           DATE NOT NULL,
  "requests"       INTEGER NOT NULL DEFAULT 0,
  "failures"       INTEGER NOT NULL DEFAULT 0,
  "inputTokens"    INTEGER NOT NULL DEFAULT 0,
  "outputTokens"   INTEGER NOT NULL DEFAULT 0,
  "estimatedCost"  DOUBLE PRECISION NOT NULL DEFAULT 0,
  "totalLatencyMs" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "ai_provider_usage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ai_provider_usage_configId_date_key"
  ON "ai_provider_usage"("configId", "date");
CREATE INDEX "ai_provider_usage_companyId_date_idx"
  ON "ai_provider_usage"("companyId", "date");

ALTER TABLE "ai_provider_usage"
  ADD CONSTRAINT "ai_provider_usage_configId_fkey"
  FOREIGN KEY ("configId") REFERENCES "ai_provider_configs"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
