# Database Cleanup Script

## Purpose
This script removes all existing workflows, tasks, and related data from your database to give you a fresh start.

## ⚠️ WARNING
**This will delete ALL existing data including:**
- All workflows
- All tasks (and their subtasks)
- All notifications
- All task comments
- All file attachments
- All task assignments
- Phase history
- Task approvals

**This action CANNOT be undone!**

## How to Run

1. **Backup your database first** (if needed):
   ```bash
   cp prisma/dev.db prisma/dev.db.backup
   ```

2. **Run the cleanup script**:
   ```bash
   cd backend
   npx ts-node prisma/clear-workflows.ts
   ```

3. **Verify** the cleanup was successful - you should see output like:
   ```
   ✅ Database cleaned successfully!
   📋 Summary:
      - 3 workflows removed
      - 12 phases removed
      - 9 transitions removed
      - X tasks removed
   ```

## What Remains After Cleanup
- System settings (file upload limits, etc.)
- User accounts (admin and all other users)
- User authentication data

## After Running the Script
Users can now create fresh workflows from the Workflows page without any pre-seeded data.

