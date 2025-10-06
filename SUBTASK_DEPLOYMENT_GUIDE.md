# Subtask Deployment Guide

## Step 1: Apply Database Migration to Render

1. Go to your Render Dashboard
2. Navigate to your PostgreSQL database
3. Click on "Query" or connect via psql
4. Run the following SQL:

```sql
-- Create Subtasks table
CREATE TABLE IF NOT EXISTS "subtasks" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "priority" INTEGER NOT NULL DEFAULT 1,
    "dueDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "taskId" TEXT NOT NULL,
    "assignedToId" TEXT,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "subtasks_pkey" PRIMARY KEY ("id")
);

-- Add foreign key constraints
ALTER TABLE "subtasks" ADD CONSTRAINT "subtasks_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "subtasks" ADD CONSTRAINT "subtasks_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "subtasks" ADD CONSTRAINT "subtasks_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS "subtasks_taskId_idx" ON "subtasks"("taskId");
CREATE INDEX IF NOT EXISTS "subtasks_assignedToId_idx" ON "subtasks"("assignedToId");
CREATE INDEX IF NOT EXISTS "subtasks_createdById_idx" ON "subtasks"("createdById");
CREATE INDEX IF NOT EXISTS "subtasks_completed_idx" ON "subtasks"("completed");
```

## Step 2: Deploy Updated Code to Render

1. Commit and push all the changes to your Git repository:
   ```bash
   git add .
   git commit -m "Add subtask functionality"
   git push origin main
   ```

2. Render will automatically deploy the new code

## Step 3: Verify Deployment

1. Check your Render backend logs to ensure the deployment was successful
2. The Prisma client should automatically regenerate during deployment
3. Test the subtask functionality in your frontend

## Step 4: Test the API Endpoints

Once deployed, you should be able to:
- POST /api/tasks/{taskId}/subtasks - Create subtask
- PATCH /api/tasks/{taskId}/subtasks/{subtaskId} - Update subtask  
- DELETE /api/tasks/{taskId}/subtasks/{subtaskId} - Delete subtask

## Troubleshooting

If you still get "Cannot POST" errors:
1. Check Render backend logs for any startup errors
2. Verify the database migration was applied successfully
3. Ensure all environment variables are set correctly in Render
4. Restart the backend service if needed

The subtask functionality should work perfectly once the database migration is applied!
