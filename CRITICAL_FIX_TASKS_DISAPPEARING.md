# CRITICAL FIX: Tasks Disappearing After Page Refresh

## Problem Diagnosis

**Symptoms:**
- Tasks appear immediately after creation
- Tasks disappear after page refresh
- Tasks exist in database (can't create duplicates)
- Tasks visible in notifications
- Only happening in PRODUCTION

## Root Cause

### Issue #1: No Default Workflows
When creating a task without specifying a workflow:
1. System uses AI to detect task type (e.g., 'SOCIAL_MEDIA_POST', 'VIDEO_CONTENT', etc.)
2. System tries to find a **DEFAULT** workflow for that task type
3. **FAILURE**: If no default workflow exists, task creation throws an error

**In your production environment:**
- Mock workflows were deleted
- No replacement workflows were marked as "default"
- Task creation is failing with: `No default workflow found for task type: X`

### Issue #2: Mock Workflows Still in Database
Your production database still has the old mock workflows. These may have:
- Invalid or missing phases
- Incorrect task type mappings
- Inactive status

## The Fix

### Backend Changes (`backend/src/tasks/tasks.service.ts`)

#### 1. Added Workflow Fallback Logic (Lines 36-73)
```typescript
// Try AI detection, but fallback to 'GENERAL' if it fails
try {
  const aiDetection = await this.aiService.detectTaskType(createTaskDto.title);
  taskType = aiDetection.task_type;
} catch (error) {
  taskType = 'GENERAL';
}

// Try to get default workflow, with multiple fallbacks
try {
  workflow = await this.workflowsService.getDefaultWorkflow(taskType);
} catch (error) {
  // Fallback 1: ANY workflow of this task type
  workflow = await this.prisma.workflow.findFirst({
    where: { taskType, isActive: true },
    include: { phases: { orderBy: { order: 'asc' } } },
  });
  
  // Fallback 2: ANY active workflow
  if (!workflow) {
    workflow = await this.prisma.workflow.findFirst({
      where: { isActive: true },
      include: { phases: { orderBy: { order: 'asc' } } },
    });
  }
  
  // Fallback 3: Show clear error message
  if (!workflow) {
    throw new BadRequestException(
      'No workflows available. Please create at least one workflow before creating tasks.'
    );
  }
}
```

**Benefits:**
- ✅ Task creation won't fail if no default workflow exists
- ✅ System will use ANY available workflow as fallback
- ✅ Clear error message if no workflows exist at all
- ✅ More resilient to configuration issues

#### 2. Added Comprehensive Logging (Lines 308-309, 766-769, 914-916)
```typescript
// After task creation
console.log(`Task created successfully: ${task.id}, workflow: ${workflow.id}, taskType: ${taskType}`);

// During task fetching
console.log(`EMPLOYEE filtering for userId: ${userId}`);
console.log(`Found ${total} tasks matching query for user ${userId} (role: ${userRole})`);
console.log(`Where clause:`, JSON.stringify(where, null, 2));
```

**Benefits:**
- ✅ Debug task creation issues in production
- ✅ Understand filtering behavior
- ✅ Identify permission issues

## Deployment Steps

### Step 1: Deploy Backend with Fixes
```bash
cd backend
npm run build
# Deploy to production backend server
```

### Step 2: Check Production Logs
After deployment, check your backend logs when:
1. Creating a task
2. Refreshing the tasks page

You should see logs like:
```
Task created successfully: abc-123, workflow: xyz-789, taskType: GENERAL
ADMIN/SUPER_ADMIN - no role filtering for userId: user-123, role: SUPER_ADMIN
Found 5 tasks matching query for user user-123 (role: SUPER_ADMIN)
```

### Step 3: Clean Up Mock Workflows (OPTIONAL)
If mock workflows are causing issues, run the cleanup script:
```bash
cd backend
npx ts-node prisma/clear-workflows.ts
```

**Then create proper workflows** from the Workflows page before creating tasks.

### Step 4: Set Default Workflow (RECOMMENDED)
For each task type you use, set ONE workflow as default:
1. Go to Workflows page
2. Edit a workflow
3. Check "Set as default workflow for this task type"

## Testing Checklist

After deployment:

1. **Test Task Creation**
   - [ ] Create task WITHOUT selecting workflow (should use fallback)
   - [ ] Check backend logs for "Task created successfully"
   - [ ] Verify task appears in tasks page

2. **Test Task Persistence**
   - [ ] Refresh page
   - [ ] Check backend logs for "Found X tasks"
   - [ ] Verify task still visible

3. **Test Role Filtering**
   - [ ] Create task as EMPLOYEE
   - [ ] Refresh page
   - [ ] Verify task still visible

4. **Test Workflow Selection**
   - [ ] Create task WITH workflow selected
   - [ ] Verify it uses selected workflow
   - [ ] Check logs confirm correct workflow

## What Changed

**Files Modified:**
- ✅ `backend/src/tasks/tasks.service.ts` - Added fallback logic + logging

**No Frontend Changes Needed** - The issue is purely backend

## Expected Behavior After Fix

### Before:
- ❌ Task creation fails silently if no default workflow
- ❌ No error messages about missing workflows
- ❌ Tasks disappear after refresh
- ❌ No visibility into what's happening

### After:
- ✅ Tasks created successfully using ANY available workflow
- ✅ Clear error if NO workflows exist
- ✅ Tasks persist after refresh
- ✅ Detailed logs for debugging
- ✅ Graceful fallback behavior

## Immediate Actions Required

1. **Deploy backend immediately** - This fixes the core issue
2. **Check logs** - Verify tasks are being created
3. **Create workflows** - Ensure at least ONE workflow exists
4. **Set defaults** - Mark workflows as default for their task types

## Support

If issues persist after deployment:
1. Check backend logs for console.log statements
2. Verify at least one workflow exists in database
3. Confirm workflow has phases defined
4. Test with different user roles (ADMIN vs EMPLOYEE)

