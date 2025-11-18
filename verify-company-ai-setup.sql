-- SQL to verify the company AI setup
-- Run this in your Neon database console

-- 1. Check the company details
SELECT 
  id,
  name,
  slug,
  "isActive",
  "aiEnabled",
  CASE 
    WHEN "aiApiKey" IS NOT NULL AND LENGTH("aiApiKey") > 0 THEN 'HAS KEY (' || LENGTH("aiApiKey") || ' chars)'
    ELSE 'NO KEY'
  END as api_key_status,
  "aiProvider",
  "createdAt"
FROM "Company"
WHERE id = 'c5b9399a-9b94-4a11-b1f4-53a1477284ea';

-- 2. Check the user's company relationship
SELECT 
  u.id as user_id,
  u.name as user_name,
  u.email,
  u.role,
  u."companyId",
  c.name as company_name,
  c."aiEnabled",
  CASE 
    WHEN c."aiApiKey" IS NOT NULL THEN 'HAS KEY'
    ELSE 'NO KEY'
  END as company_has_key
FROM "User" u
LEFT JOIN "Company" c ON u."companyId" = c.id
WHERE u.id = '3a6efd8e-3a58-4f9a-95a0-41f9e52460ed';

-- 3. Check knowledge sources for this company
SELECT 
  id,
  name,
  type,
  "isActive",
  CASE 
    WHEN content IS NOT NULL AND LENGTH(content) > 0 THEN 'HAS CONTENT (' || LENGTH(content) || ' chars)'
    ELSE 'NO CONTENT'
  END as content_status,
  "companyId",
  "createdAt"
FROM "KnowledgeSource"
WHERE "companyId" = 'c5b9399a-9b94-4a11-b1f4-53a1477284ea'
ORDER BY "createdAt" DESC;

-- 4. Verify the AI key is properly encrypted (base64)
SELECT 
  id,
  name,
  CASE 
    WHEN "aiApiKey" IS NOT NULL THEN 
      CASE 
        WHEN "aiApiKey" ~ '^[A-Za-z0-9+/=]+$' THEN 'VALID BASE64'
        ELSE 'INVALID FORMAT (not base64)'
      END
    ELSE 'NO KEY'
  END as key_format_check,
  LENGTH("aiApiKey") as key_length
FROM "Company"
WHERE id = 'c5b9399a-9b94-4a11-b1f4-53a1477284ea';

