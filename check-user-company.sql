-- Check if user has companyId
-- Run this in your Neon database console

-- 1. Check your user account
SELECT 
  id,
  name,
  email,
  role,
  "companyId",
  status,
  "createdAt"
FROM "User"
WHERE email = 'your-email@example.com';  -- Replace with your actual email

-- 2. Check all users and their companies
SELECT 
  u.id,
  u.name,
  u.email,
  u.role,
  u."companyId",
  c.name as company_name,
  c.slug as company_slug
FROM "User" u
LEFT JOIN "Company" c ON u."companyId" = c.id
ORDER BY u."createdAt" DESC;

-- 3. Check knowledge sources for a specific company
SELECT 
  id,
  name,
  type,
  "companyId",
  "isActive",
  LENGTH(content) as content_length,
  "lastScraped"
FROM "KnowledgeSource"
WHERE "companyId" = 'your-company-id';  -- Replace with actual company ID

-- 4. Check if Apliman company exists and has AI enabled
SELECT 
  id,
  name,
  slug,
  "aiEnabled",
  CASE 
    WHEN "aiApiKey" IS NOT NULL THEN 'HAS KEY'
    ELSE 'NO KEY'
  END as api_key_status
FROM "Company"
WHERE name ILIKE '%apliman%' OR slug ILIKE '%apliman%';

