-- Plans become the single source of truth for what each subscription allows.
--
-- The "plans" table was created by `db push` and never by a migration, so a database
-- built from migrations alone may not have it. Create it if it is missing, with the
-- columns schema.prisma declares.
CREATE TABLE IF NOT EXISTS "plans" (
  "id"         TEXT NOT NULL,
  "name"       TEXT NOT NULL,
  "maxUsers"   INTEGER NOT NULL DEFAULT 10,
  "maxTasks"   INTEGER NOT NULL DEFAULT 100,
  "maxStorage" INTEGER NOT NULL DEFAULT 5,
  "price"      DOUBLE PRECISION NOT NULL DEFAULT 0,
  "aiEnabled"  BOOLEAN NOT NULL DEFAULT false,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL,
  CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "plans_name_key" ON "plans"("name");

-- The three plans the Create Company form used to hard-code. A plan a Super Admin
-- already configured is left as it is: the table, not this file, is the authority.
-- -1 means unlimited.
INSERT INTO "plans" ("id", "name", "maxUsers", "maxTasks", "maxStorage", "price", "updatedAt") VALUES
  (gen_random_uuid()::text, 'FREE_TRIAL', 3,  500,  2,  0,   CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'PRO',        25, 5000, 10, 99,  CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'ENTERPRISE', -1, -1,   -1, 299, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

-- A free trial allows three users. This one value is set deliberately, overriding
-- whatever the trial allowed before: it is a product decision, not a default.
UPDATE "plans" SET "maxUsers" = 3, "updatedAt" = CURRENT_TIMESTAMP WHERE "name" = 'FREE_TRIAL';

-- The form copied its hard-coded numbers onto every company it created, as if they
-- were custom limits, which froze each company at whatever the form said that day.
-- Where a company still holds exactly the number its plan's preset gave it, clear it
-- so the company follows its plan. Anything else was set on purpose and stays.
UPDATE "companies" SET "maxUsers" = NULL
WHERE ("subscriptionPlan" = 'FREE_TRIAL' AND "maxUsers" = 10)
   OR ("subscriptionPlan" = 'PRO'        AND "maxUsers" = 25)
   OR ("subscriptionPlan" = 'ENTERPRISE' AND "maxUsers" = -1);

UPDATE "companies" SET "maxTasks" = NULL
WHERE ("subscriptionPlan" = 'FREE_TRIAL' AND "maxTasks" = 500)
   OR ("subscriptionPlan" = 'PRO'        AND "maxTasks" = 5000)
   OR ("subscriptionPlan" = 'ENTERPRISE' AND "maxTasks" = -1);

UPDATE "companies" SET "maxStorage" = NULL
WHERE ("subscriptionPlan" = 'FREE_TRIAL' AND "maxStorage" = 2)
   OR ("subscriptionPlan" = 'PRO'        AND "maxStorage" = 10)
   OR ("subscriptionPlan" = 'ENTERPRISE' AND "maxStorage" IN (-1, 100));

-- Until now nothing enforced subscriptionEnd, so companies whose date passed long ago
-- kept working, and enforcing it from this deploy would lock them out on the spot,
-- admins included, with no warning. Each such company instead starts its grace period
-- today: seven days of red warnings and a place on the Super Admin's billing page,
-- then a block only if nobody renews. Suspended companies are left as they are.
UPDATE "companies" SET "subscriptionEnd" = (now() AT TIME ZONE 'UTC')
WHERE "subscriptionEnd" < (now() AT TIME ZONE 'UTC')
  AND "isActive" = true
  AND "subscriptionStatus" <> 'SUSPENDED';

-- Payments recorded by the Super Admin. See the Invoice model.
CREATE TABLE IF NOT EXISTS "invoices" (
  "id"          TEXT NOT NULL,
  "number"      TEXT NOT NULL,
  "companyId"   TEXT NOT NULL,
  "plan"        TEXT NOT NULL,
  "amount"      DOUBLE PRECISION NOT NULL,
  "currency"    TEXT NOT NULL DEFAULT 'USD',
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd"   TIMESTAMP(3) NOT NULL,
  "paidAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "method"      TEXT,
  "reference"   TEXT,
  "note"        TEXT,
  "recordedBy"  TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "invoices_number_key" ON "invoices"("number");
CREATE INDEX IF NOT EXISTS "invoices_companyId_idx" ON "invoices"("companyId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_companyId_fkey') THEN
    ALTER TABLE "invoices"
      ADD CONSTRAINT "invoices_companyId_fkey" FOREIGN KEY ("companyId")
      REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
