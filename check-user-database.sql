-- SQL queries to check user and database state
-- Run these in your Neon database console

-- 1. Check if the user from the JWT token exists
SELECT 
  id,
  name,
  email,
  role,
  "companyId",
  status,
  "createdAt"
FROM "User"
WHERE id = '24971ac0-2cdd-4f97-a25e-e94d1ba0af66';

-- 2. Check all users with email angy.barakat@apliman.com
SELECT 
  id,
  name,
  email,
  role,
  "companyId",
  status,
  "createdAt",
  "updatedAt"
FROM "User"
WHERE email = 'angy.barakat@apliman.com'
ORDER BY "createdAt" DESC;

-- 3. Check the company
SELECT 
  id,
  name,
  slug,
  "isActive",
  "aiEnabled",
  CASE 
    WHEN "aiApiKey" IS NOT NULL THEN 'HAS KEY'
    ELSE 'NO KEY'
  END as api_key_status,
  "createdAt"
FROM "Company"
WHERE id = '371d82d4-16fc-4035-9059-2ebfc93268a1';

-- 4. Check all companies
SELECT 
  id,
  name,
  slug,
  "isActive",
  "aiEnabled",
  "createdAt"
FROM "Company"
ORDER BY "createdAt" DESC;

-- 5. Check all COMPANY_ADMIN users
SELECT 
  u.id,
  u.name,
  u.email,
  u.role,
  u."companyId",
  c.name as company_name,
  u."createdAt"
FROM "User" u
LEFT JOIN "Company" c ON u."companyId" = c.id
WHERE u.role = 'COMPANY_ADMIN'
ORDER BY u."createdAt" DESC;

-- 6. Count total users
SELECT 
  role,
  COUNT(*) as count
FROM "User"
GROUP BY role;

