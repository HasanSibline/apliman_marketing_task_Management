# Multi-Tenancy Migration Guide

## Overview
This guide covers migrating your existing single-tenant database to a multi-tenant architecture.

## Important Notes

⚠️ **BACKUP YOUR DATABASE FIRST** ⚠️

```bash
# On your local machine or Render
pg_dump $DATABASE_URL > backup_before_migration.sql
```

## Migration Steps

### Step 1: Run Prisma Migration

This will create the new tables and add `companyId` columns:

```bash
cd backend
npx prisma migrate dev --name add_multi_tenancy
```

### Step 2: Create Default "Apliman" Company

We'll create a script to migrate existing data to a default company:

```bash
npx ts-node prisma/migrate-to-multi-tenant.ts
```

## What the Migration Does

1. **Creates new tables:**
   - `companies`
   - `company_settings`
   - `subscription_history`
   - `company_ai_usage`

2. **Adds `companyId` to existing tables:**
   - `users`
   - `tasks`
   - `workflows`
   - `knowledge_sources`
   - `chat_sessions`

3. **Creates default Apliman company:**
   - Name: "Apliman"
   - Slug: "apliman"
   - Plan: ENTERPRISE (lifetime)
   - All existing users are assigned to this company
   - All existing data is assigned to this company

4. **Updates user roles:**
   - First SUPER_ADMIN becomes system admin (no companyId)
   - Other SUPER_ADMINs become COMPANY_ADMIN for Apliman
   - All roles are preserved

## After Migration

### Verify Data

```sql
-- Check company was created
SELECT * FROM companies;

-- Check all users have companyId (except system admin)
SELECT id, email, role, "companyId" FROM users;

-- Check all tasks have companyId
SELECT COUNT(*) FROM tasks WHERE "companyId" IS NOT NULL;
```

### Test System

1. Login as system admin (YOU)
2. Access `/companies` endpoint
3. Create a test company
4. Verify isolation (companies can't see each other's data)

## Rollback Plan

If something goes wrong:

```bash
# Restore from backup
psql $DATABASE_URL < backup_before_migration.sql

# OR reset migrations
npx prisma migrate reset
```

## Next Steps

After successful migration:
1. Deploy backend changes to Render
2. Deploy frontend Super Admin CMS
3. Start creating new companies!

## Troubleshooting

### Error: Foreign key constraint failed

**Solution:** Run the migration script which properly orders the operations.

### Error: Unique constraint violation

**Solution:** Check for duplicate company names/slugs in the migration script.

### Users can't login after migration

**Solution:** Verify users have correct `companyId` and roles:

```sql
SELECT id, email, role, "companyId" FROM users WHERE role = 'SUPER_ADMIN';
```

## Support

If you encounter issues, check:
- Prisma migration status: `npx prisma migrate status`
- Database connection: `npx prisma db pull`
- Logs in `backend/prisma/migrate-to-multi-tenant.log`

