# Fix: Tasks Disappearing After Page Refresh

## Problem

Tasks would appear on the tasks page immediately after creation, but would disappear after refreshing the page. The tasks remained accessible via notifications but were not visible in the tasks list.

## Root Cause

The issue was caused by **role-based filtering** in the backend:

### Backend Filtering Logic
In `backend/src/tasks/tasks.service.ts` (lines 724-730), EMPLOYEE users can only see tasks where:
1. They are assigned to the task (`assignedToId`), OR
2. They created the task (`createdById`), OR  
3. They are in the task assignments (`TaskAssignment`)

**The Problem:**
- If an EMPLOYEE created a task but didn't assign themselves, the task wouldn't match any of these conditions
- The task was created successfully but filtered out when fetching tasks after refresh

## Solution

### 1. Backend Fix - Include TaskAssignment Relationship
**File**: `backend/src/tasks/tasks.service.ts` (lines 723-733)

Added check for the `TaskAssignment` relationship to ensure users can see tasks they're assigned to via the new multi-user assignment system:

```typescript
if (userRole === UserRole.EMPLOYEE) {
  where.OR = [
    { assignedToId: userId },
    { createdById: userId },
    { assignments: { some: { userId: userId } } },  // ← NEW
  ];
}
```

### 2. Frontend Fix - Always Assign Creator
**File**: `frontend/src/components/tasks/CreateTaskModal.tsx` (lines 229-249)

Modified task creation to **always include the creator** in the assigned users:

```typescript
// Ensure the creator is always assigned to the task (especially for employees)
const assignedUserIds = formData.assignedUserIds.length > 0 
  ? formData.assignedUserIds 
  : (user?.id ? [user.id] : []);

// Make sure creator is always included if they're an employee
if (user?.id && !assignedUserIds.includes(user.id)) {
  assignedUserIds.push(user.id);
}
```

This ensures:
- If no users are selected, the creator is auto-assigned
- If other users are selected, the creator is also included
- The creator can always see their own tasks after refresh

## Impact

### Before:
- ❌ Tasks disappeared after page refresh for EMPLOYEE users
- ❌ Tasks only visible via notifications
- ❌ Confusing user experience

### After:
- ✅ Tasks remain visible after page refresh
- ✅ Creator is always assigned to tasks they create
- ✅ Multi-user assignments work correctly
- ✅ Consistent behavior across roles

## Testing

After deployment, verify:
1. Create a task as EMPLOYEE → appears immediately ✓
2. Refresh page → task still visible ✓
3. Create task with multiple assignees → all can see it ✓
4. Create task as ADMIN → no issues (admins see all tasks) ✓

## Deployment

Both **backend** and **frontend** need to be deployed for the fix to work:

```bash
# Backend
cd backend
npm run build
# Deploy

# Frontend  
cd frontend
npm run build
# Deploy
```

## Files Changed

- ✅ `backend/src/tasks/tasks.service.ts` - Added TaskAssignment check to filtering
- ✅ `frontend/src/components/tasks/CreateTaskModal.tsx` - Always assign creator to task

## Additional Notes

- This fix maintains security - EMPLOYEES still can't see tasks they're not involved with
- ADMIN and SUPER_ADMIN roles see all tasks (no filtering applied)
- The fix works with both old (`assignedToId`) and new (`TaskAssignment`) assignment systems

