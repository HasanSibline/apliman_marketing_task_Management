# 🗄️ Database Migration Scripts

This directory contains scripts to help you migrate from Render PostgreSQL to Neon.tech.

## Scripts Overview

### 📤 Export Scripts
- **`export-database.sh`** (Linux/macOS)
- **`export-database.ps1`** (Windows PowerShell)

Exports your existing Render database to a SQL dump file.

**Usage (Windows):**
```powershell
cd backend/scripts
$env:DATABASE_URL = "your-render-database-url"
.\export-database.ps1
```

**Usage (Linux/macOS):**
```bash
cd backend/scripts
export DATABASE_URL="your-render-database-url"
./export-database.sh
```

---

### 📥 Import Scripts
- **`import-to-neon.sh`** (Linux/macOS)
- **`import-to-neon.ps1`** (Windows PowerShell)

Imports your SQL dump into your new Neon database.

**Usage (Windows):**
```powershell
cd backend/scripts
$env:NEON_DATABASE_URL = "your-neon-database-url"
.\import-to-neon.ps1 database_backup_20250107_123456.sql
```

**Usage (Linux/macOS):**
```bash
cd backend/scripts
export NEON_DATABASE_URL="your-neon-database-url"
./import-to-neon.sh database_backup_20250107_123456.sql
```

---

### 🔍 Verification Scripts
- **`verify-neon-connection.sh`** (Linux/macOS)
- **`verify-neon-connection.ps1`** (Windows PowerShell)

Tests your Neon connection and provides diagnostic information.

**Usage (Windows):**
```powershell
cd backend/scripts
$env:DATABASE_URL = "your-neon-database-url"
.\verify-neon-connection.ps1
```

**Usage (Linux/macOS):**
```bash
cd backend/scripts
export DATABASE_URL="your-neon-database-url"
./verify-neon-connection.sh
```

---

## Prerequisites

All scripts require **PostgreSQL client tools** installed:

### Windows
Download from: https://www.postgresql.org/download/windows/

### macOS
```bash
brew install postgresql
```

### Linux (Ubuntu/Debian)
```bash
sudo apt-get install postgresql-client
```

---

## Migration Workflow

### Option A: Fresh Start (Recommended)
1. Create Neon database
2. Update `DATABASE_URL` on Render backend
3. Redeploy → Done! ✅

### Option B: Preserve Data
1. Run export script on old Render database
2. Create Neon database
3. Run import script to restore data
4. Verify with verification script
5. Update `DATABASE_URL` on Render backend
6. Redeploy → Done! ✅

---

## Troubleshooting

### "Command not found" errors
**Cause**: PostgreSQL client tools not installed  
**Fix**: Install PostgreSQL (see Prerequisites above)

### "Connection refused"
**Cause**: Wrong connection string or database not ready  
**Fix**: 
- Verify connection string format
- Check Neon dashboard for database status
- Ensure `?sslmode=require` is in the URL

### "Permission denied" (Linux/macOS)
**Cause**: Script not executable  
**Fix**: 
```bash
chmod +x export-database.sh
chmod +x import-to-neon.sh
chmod +x verify-neon-connection.sh
```

### "Import failed: duplicate key"
**Cause**: Database already has data  
**Fix**: 
- Either use fresh Neon database
- Or clear existing data before import

---

## Important Notes

⚠️ **Backup First**: Always keep your SQL dump file safe until migration is verified

⚠️ **Pooled Connection**: Use "Pooled connection" from Neon (better performance)

⚠️ **SSL Required**: Neon requires SSL - add `?sslmode=require` to connection string

✅ **Auto-Migration**: If starting fresh, backend will auto-create tables on deploy

✅ **Seed Data**: Fresh database gets super admin user automatically:
   - Email: `superadmin@apliman.com`
   - Password: `SuperAdmin@2024`

---

## Support

For detailed migration guide, see:
- **Quick Start**: `../QUICK_NEON_SETUP.md`
- **Full Guide**: `../NEON_MIGRATION_GUIDE.md`

Need help? Check Render deployment logs or Neon dashboard for errors.

