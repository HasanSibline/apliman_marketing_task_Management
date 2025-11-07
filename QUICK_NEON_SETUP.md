# 🚀 Quick Setup: Neon Database Migration

## TL;DR - What You Need to Do

1. **Create Neon account** (2 minutes)
   - Go to https://neon.tech
   - Sign up with GitHub
   - Create project named "apliman-marketing-tasks"

2. **Get connection string** (1 minute)
   - After project creation, copy the **"Pooled connection"** string
   - Should look like: `postgres://user:pass@ep-xxx.region.aws.neon.tech/dbname?sslmode=require`

3. **Update Render backend** (2 minutes)
   - Go to https://dashboard.render.com
   - Find your **backend service** (NestJS API)
   - Go to **Environment** tab
   - Update `DATABASE_URL` with your Neon connection string
   - Click **Save Changes**

4. **Wait for deployment** (3-5 minutes)
   - Render will auto-deploy
   - Prisma will migrate schema automatically
   - Seed data will be created

5. **Done!** ✅
   - Test your app at: https://apliman-marketing-task-management.pages.dev
   - Login: `superadmin@apliman.com` / `SuperAdmin@2024`

---

## Why This Works

- **No code changes needed** - Neon is PostgreSQL, drop-in replacement
- **Auto-migration** - Your backend already runs Prisma migrations on startup
- **Auto-seed** - Super admin user created automatically
- **Free forever** - Neon free tier doesn't expire

---

## Troubleshooting

### ❌ "Migration failed"
**Cause**: Wrong connection string format  
**Fix**: Make sure you copied **"Pooled connection"** not "Direct connection" from Neon

### ❌ "Cannot connect to database"
**Cause**: Missing `?sslmode=require` in connection string  
**Fix**: Add `?sslmode=require` to the end of your DATABASE_URL

### ❌ "Login failed" after migration
**Cause**: Fresh database, old credentials don't exist  
**Fix**: Use seed credentials:
- Email: `superadmin@apliman.com`
- Password: `SuperAdmin@2024`

---

## What Happens Behind the Scenes

```
1. You update DATABASE_URL on Render
   ↓
2. Render detects env var change → triggers deploy
   ↓
3. Backend starts → Prisma connects to Neon
   ↓
4. Prisma runs migrations (creates all tables)
   ↓
5. Seed script runs (creates super admin)
   ↓
6. Backend is ready → Frontend can connect
```

---

## Need to Preserve Old Data?

If your Render database still has data you want to keep:

1. Run export script:
   ```bash
   # Windows PowerShell
   cd backend/scripts
   .\export-database.ps1
   ```

2. Set your old Render database URL when prompted

3. After Neon is set up, run import:
   ```bash
   .\import-to-neon.ps1 database_backup_XXXXXX.sql
   ```

---

## Support

If you run into any issues:
1. Check the full guide: `NEON_MIGRATION_GUIDE.md`
2. Look at Render deployment logs
3. Check Neon dashboard for connection status
4. Let me know and I'll help debug!

