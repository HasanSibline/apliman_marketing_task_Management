-- Fix script to ensure user has companyId
-- Run this in your Neon database console if user is missing companyId

-- Step 1: Find users without companyId (excluding SUPER_ADMIN)
SELECT 
  id,
  name,
  email,
  role,
  "companyId"
FROM "User"
WHERE "companyId" IS NULL
  AND role != 'SUPER_ADMIN';

-- Step 2: If you find your user above, update it with the correct companyId
-- First, find the Apliman company ID:
SELECT id, name, slug FROM "Company" WHERE name ILIKE '%apliman%';

-- Step 3: Update your user with the correct companyId
-- Replace 'your-email@example.com' with your actual email
-- Replace 'company-id-from-step-2' with the actual company ID
UPDATE "User"
SET "companyId" = 'company-id-from-step-2'
WHERE email = 'your-email@example.com'
  AND "companyId" IS NULL;

-- Step 4: Verify the update
SELECT 
  u.id,
  u.name,
  u.email,
  u.role,
  u."companyId",
  c.name as company_name
FROM "User" u
LEFT JOIN "Company" c ON u."companyId" = c.id
WHERE u.email = 'your-email@example.com';

-- Step 5: Check knowledge sources are linked to the company
SELECT 
  ks.id,
  ks.name,
  ks.type,
  ks."companyId",
  ks."isActive",
  LENGTH(ks.content) as content_length,
  c.name as company_name
FROM "KnowledgeSource" ks
LEFT JOIN "Company" c ON ks."companyId" = c.id
WHERE ks.name ILIKE '%apliman%';

-- Step 6: If knowledge source has no companyId, fix it
-- Replace 'knowledge-source-id' and 'company-id' with actual IDs
UPDATE "KnowledgeSource"
SET "companyId" = 'company-id-from-step-2'
WHERE id = 'knowledge-source-id'
  AND "companyId" IS NULL;

