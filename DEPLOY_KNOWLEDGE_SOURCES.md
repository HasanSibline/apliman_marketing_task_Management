# 🚀 Deploy Knowledge Sources to Production

## The Issue
The production database doesn't have the `knowledge_sources` table yet, causing 500 errors.

## Solution - Deploy the Migration

### Option 1: Automatic Deploy (Recommended)

1. **Commit and push the migration**:
   ```bash
   git add .
   git commit -m "Add knowledge sources migration"
   git push origin main
   ```

2. **Render will automatically**:
   - Pull the new code
   - Run `npm run build` which includes `prisma generate`
   - Run `prisma migrate deploy` (as configured in start script)
   - Restart the service

3. **Wait 2-3 minutes** for Render to complete deployment

4. **Verify**: Visit https://taskmanagement-backendv2.onrender.com/api/knowledge-sources

### Option 2: Manual Deploy (If Auto Fails)

1. **Go to Render Dashboard**:
   - https://dashboard.render.com
   - Select: `taskmanagement-backendv2`

2. **Click "Shell" tab** (or Connect via SSH)

3. **Run migration**:
   ```bash
   npx prisma migrate deploy
   ```

4. **Restart the service**:
   - Go to "Settings" → Click "Manual Deploy" → "Deploy latest commit"

### Option 3: Using Render Database Console

1. **Access PostgreSQL**:
   - Render Dashboard → taskmanagement-backendv2
   - Go to "PostgreSQL" database
   - Click "Connect" → "External Connection"

2. **Run the migration SQL directly**:
   ```sql
   -- Copy content from: backend/prisma/migrations/20250114000000_add_knowledge_sources/migration.sql
   -- Paste and execute in PostgreSQL console
   ```

## Verify It's Working

1. **Check backend logs** on Render:
   - Should see: "Migration applied successfully"

2. **Test the endpoint**:
   ```bash
   curl https://taskmanagement-backendv2.onrender.com/api/knowledge-sources/active
   ```
   Should return `[]` (empty array, not 500 error)

3. **Test in frontend**:
   - Login as Admin
   - Click "Knowledge Sources"
   - Should load without errors

## Troubleshooting

### If migration fails:
```bash
# Check current migrations
npx prisma migrate status

# If stuck, reset and reapply
npx prisma migrate resolve --applied 20250114000000_add_knowledge_sources
npx prisma migrate deploy
```

### If still 500 error:
1. Check Render logs for specific error
2. Verify DATABASE_URL is set correctly
3. Try restarting the service manually

## After Successful Deploy

✅ Knowledge Sources page will work
✅ AI will use knowledge sources for content generation
✅ Scraping will function properly

**Estimated time**: 5 minutes for automatic deploy

