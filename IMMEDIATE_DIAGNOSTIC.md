# IMMEDIATE DIAGNOSTIC SCRIPT

## Run this to check your database state:

```sql
-- Check how many workflows exist
SELECT COUNT(*) as workflow_count FROM Workflow;

-- Check workflows details
SELECT id, name, taskType, isDefault, isActive FROM Workflow;

-- Check how many tasks exist
SELECT COUNT(*) as task_count FROM Task;

-- Check recent tasks (last 5)
SELECT id, title, taskType, workflowId, createdById, assignedToId, createdAt 
FROM Task 
ORDER BY createdAt DESC 
LIMIT 5;

-- Check if tasks have valid workflows
SELECT t.id, t.title, t.workflowId, w.name as workflow_name, w.isActive as workflow_active
FROM Task t
LEFT JOIN Workflow w ON t.workflowId = w.id
ORDER BY t.createdAt DESC
LIMIT 5;
```

## Expected Results:

### If workflows exist:
- You should see the mock workflows (Social Media, Video Production, General Marketing)
- These workflows have `isDefault = true`
- Task creation uses these workflows

### If NO workflows exist:
- Task creation should FAIL with "No workflows available" error
- But it seems tasks ARE being created (you see notifications)

## The Problem:

Looking at your console, I see notifications increment from 7 to 13 (6 new notifications), which means tasks ARE being created. But they're not showing after refresh.

**Most Likely Cause:** Tasks are being created with **invalid or deleted workflow references**, causing them to be filtered out when fetching.

## IMMEDIATE FIX:

Run this in your database:

```sql
-- Find tasks with missing/invalid workflows
SELECT t.id, t.title, t.workflowId, t.taskType
FROM Task t
LEFT JOIN Workflow w ON t.workflowId = w.id
WHERE w.id IS NULL;
```

If this returns tasks, those are "orphaned" tasks with invalid workflow references.

## Solution Steps:

### Step 1: Check Current State
Access your Render PostgreSQL database and run the diagnostic queries above.

### Step 2A: If Mock Workflows Exist (Most Likely)
```bash
# Delete them using the cleanup script
cd backend
npx ts-node prisma/clear-workflows.ts
```

### Step 2B: Create Fresh Workflows
1. Go to your Workflows page
2. Create at least ONE workflow (any type)
3. Mark it as DEFAULT for its task type
4. Add phases to the workflow

### Step 3: Test Task Creation
1. Create a new task
2. Check backend logs for my console.log statements:
   - "Task created successfully: ..."
   - "Found X tasks matching query..."
3. Refresh page
4. Check logs again

## Quick Test to Verify Deployment:

Create a task and immediately check your backend logs on Render. You should see:

```
Task created successfully: [task-id], workflow: [workflow-id], taskType: [type]
```

If you DON'T see this log, the deployment didn't include my changes.

