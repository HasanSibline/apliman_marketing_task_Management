# 🔧 Manual Deployment Steps for Knowledge Sources

## The Issue
500 error when creating knowledge sources = Prisma client not synced with database.

## Quick Fix (Choose One):

### Option 1: Force Redeploy on Render ⚡ (Fastest)

1. Go to: https://dashboard.render.com/web/srv-ctg89bd2ng1s73dchke0
2. Click **"Manual Deploy"** dropdown
3. Select **"Clear build cache & deploy"**
4. Wait 3-5 minutes for deployment

This will:
- Clear cache
- Run `prisma generate` fresh
- Apply migrations
- Restart with new Prisma client

### Option 2: Run Migration Manually via Render Shell

1. **Open Render Dashboard**: https://dashboard.render.com
2. **Select**: `taskmanagement-backendv2`
3. **Click "Shell" tab** at the top
4. **Run these commands**:

```bash
# Apply migration
npx prisma migrate deploy

# Regenerate Prisma client
npx prisma generate

# Restart (exit shell, Render will auto-restart)
exit
```

5. **Wait 1 minute** for service to restart

### Option 3: Check if Migration Was Applied

In Render Shell, check migration status:

```bash
# See which migrations are applied
npx prisma migrate status

# If 20250114000000_add_knowledge_sources is "Not yet applied", run:
npx prisma migrate deploy
```

## Verify It's Fixed

1. **Refresh frontend**: https://apliman-marketing-task-management.pages.dev
2. **Go to Knowledge Sources**
3. **Try adding a source**:
   - Name: "Test"
   - URL: https://www.apliman.com
   - Type: APLIMAN
   - Click "Create"

Should work without 500 error! ✅

## What Went Wrong?

The migration file was created and pushed, but Render might have:
- ❌ Cached old Prisma client
- ❌ Not run migration during auto-deploy
- ❌ Build completed before Prisma client regenerated

The "Clear build cache & deploy" fixes all of these.

## If Still Not Working

Check Render logs for exact error:
1. Render Dashboard → `taskmanagement-backendv2` → Logs tab
2. Look for error when you click "Create"
3. Share the error message

Common issues:
- Enum type not created: `type "KnowledgeSourceType" does not exist`
- Table not created: `relation "knowledge_sources" does not exist`
- Foreign key issue: `insert or update on table violates foreign key constraint`

---

**Recommended: Option 1 (Clear cache & deploy) - Most reliable! 🎯**

