# Fixes Implementation Guide

## ✅ Completed Fixes

### 1. Fixed Broken Images in Comments
- **Backend**: Added static file serving in `backend/src/main.ts` using `useStaticAssets()`
- **Frontend**: Added `BACKEND_URL` export to `frontend/src/services/api.ts`
- **Frontend**: Updated `TaskComments.tsx` to use full URLs for images with fallback
- **Status**: ✅ Complete

### 2. Fixed /subtask Navigation
- **Frontend**: Rewrote `highlightContent()` in `TaskComments.tsx` to properly parse and handle subtask tags
- **Frontend**: Added toast error when subtask is not linked
- **Status**: ✅ Complete

### 3. Created Edit Task Modal
- **Frontend**: Created `frontend/src/components/tasks/EditTaskModal.tsx`
- **Features**: Edit title, description, goals, priority, due date, assigned user
- **Status**: ✅ Created (needs integration)

---

## 🔧 Remaining Fixes Needed

### 4. Integrate Edit Task Modal into TaskDetailPage
**File**: `frontend/src/pages/tasks/TaskDetailPage.tsx`

**Changes needed**:
```typescript
// Add import
import EditTaskModal from '@/components/tasks/EditTaskModal'

// Add state
const [isEditModalOpen, setIsEditModalOpen] = useState(false)

// Add button in the header section (near the back button)
<button
  onClick={() => setIsEditModalOpen(true)}
  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
>
  <PencilIcon className="w-5 h-5" />
  Edit Task
</button>

// Add modal at the end of the component
<EditTaskModal
  task={currentTask}
  isOpen={isEditModalOpen}
  onClose={() => setIsEditModalOpen(false)}
  onTaskUpdated={() => dispatch(fetchTaskById(id!))}
/>
```

### 5. Add Subtask Edit Functionality
**File**: `frontend/src/components/tasks/SubtaskDetailModal.tsx`

**Add form for editing subtask**:
- Title input
- Description textarea
- Estimated hours input
- Save button that calls `tasksApi.update(subtask.linkedTask.id, data)`

### 6. Compact Time Tracking Redesign
**File**: `frontend/src/pages/tasks/TaskDetailPage.tsx`

**Current**: Takes up a lot of space with large buttons
**New Design**: Move to a compact badge/chip format near the task title

```typescript
// Replace the current time tracking section with:
<div className="flex items-center gap-2">
  {isTimerRunning ? (
    <button
      onClick={() => setIsTimerRunning(false)}
      className="flex items-center gap-1 px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm hover:bg-red-200"
    >
      <PauseIcon className="w-4 h-4" />
      {formatTime(currentTime)}
    </button>
  ) : (
    <button
      onClick={() => setIsTimerRunning(true)}
      className="flex items-center gap-1 px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm hover:bg-green-200"
    >
      <PlayIcon className="w-4 h-4" />
      Start Timer
    </button>
  )}
  {currentTime > 0 && (
    <span className="text-sm text-gray-500">
      Total: {formatTime(currentTime)}
    </span>
  )}
</div>
```

### 7. Add Preview for @mentions in Comments
**File**: `frontend/src/components/tasks/TaskComments.tsx`

**In the autocomplete dropdown**, show user info:
```typescript
// Update the autocomplete rendering (around line 170)
{filteredUsers.map((user, index) => (
  <div
    key={user.id}
    onClick={() => handleUserSelect(user)}
    className={`px-4 py-3 cursor-pointer hover:bg-gray-50 ${
      index === highlightedIndex ? 'bg-gray-50' : ''
    }`}
  >
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
        <span className="text-blue-600 font-semibold">
          {user.name.charAt(0).toUpperCase()}
        </span>
      </div>
      <div>
        <div className="font-medium text-gray-900">{user.name}</div>
        <div className="text-sm text-gray-500">{user.position}</div>
      </div>
    </div>
  </div>
))}
```

### 8. Fix Notification Redirects
**File**: `frontend/src/components/notifications/NotificationManager.tsx`

**Update the redirect logic** to scroll to comments when it's a comment mention:
```typescript
// Update the notification click handler
const handleNotificationClick = (notification: any) => {
  if (notification.actionUrl) {
    navigate(notification.actionUrl)
    
    // If it's a comment notification, scroll to comments
    if (notification.type === 'COMMENT_MENTION' && notification.commentId) {
      setTimeout(() => {
        const commentsSection = document.getElementById('comments-section')
        if (commentsSection) {
          commentsSection.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
      }, 500)
    }
  }
  // Mark as read
  notificationsApi.markAsRead(notification.id)
}
```

**Also add** `id="comments-section"` to the TaskComments component wrapper in TaskDetailPage.

### 9. Fix "Subtask not linked to task" Error
**File**: `frontend/src/components/tasks/SubtaskDetailModal.tsx`

The error occurs when `subtask.linkedTask` is null. Add a check:
```typescript
// At the top of the component
if (!subtask) {
  return null
}

if (!subtask.linkedTask) {
  return (
    <div className="text-center py-8">
      <p className="text-gray-500">This subtask is not linked to an individual task yet.</p>
      <p className="text-sm text-gray-400 mt-2">
        Subtasks are automatically linked when assigned to a user.
      </p>
    </div>
  )
}
```

### 10. Update Analytics for New Task System
**Files**: 
- `backend/src/analytics/analytics.service.ts`
- `frontend/src/pages/analytics/AnalyticsPage.tsx`

**Backend Changes**:
```typescript
// Update getTaskStatistics() to use workflow phases instead of old enum
async getTaskStatistics() {
  const tasks = await this.prisma.task.findMany({
    include: {
      currentPhase: true,
      workflow: true,
      subtasks: true,
    },
  })

  // Group by workflow type
  const byWorkflow = tasks.reduce((acc, task) => {
    const workflowName = task.workflow?.name || 'No Workflow'
    if (!acc[workflowName]) {
      acc[workflowName] = { total: 0, completed: 0, inProgress: 0 }
    }
    acc[workflowName].total++
    if (task.currentPhase?.isEndPhase) {
      acc[workflowName].completed++
    } else if (!task.currentPhase?.isStartPhase) {
      acc[workflowName].inProgress++
    }
    return acc
  }, {} as any)

  // Calculate overall stats
  const totalTasks = tasks.length
  const completedTasks = tasks.filter(t => t.currentPhase?.isEndPhase).length
  const inProgressTasks = tasks.filter(t => !t.currentPhase?.isStartPhase && !t.currentPhase?.isEndPhase).length

  // Subtask completion rate
  const allSubtasks = tasks.flatMap(t => t.subtasks || [])
  const completedSubtasks = allSubtasks.filter(s => s.isCompleted).length
  const subtaskCompletionRate = allSubtasks.length > 0 
    ? Math.round((completedSubtasks / allSubtasks.length) * 100) 
    : 0

  return {
    totalTasks,
    completedTasks,
    inProgressTasks,
    pendingTasks: totalTasks - completedTasks - inProgressTasks,
    byWorkflow,
    subtaskCompletionRate,
    averageTasksPerWorkflow: totalTasks / Object.keys(byWorkflow).length || 0,
  }
}
```

**Frontend Changes**:
- Update charts to use the new data structure
- Add workflow-based charts
- Add subtask completion metrics
- Remove references to old phase enum

---

## 📋 Implementation Priority

1. **HIGH** - Fix notification redirects (affects user experience)
2. **HIGH** - Integrate Edit Task Modal (core functionality)
3. **HIGH** - Fix subtask detail error (prevents crashes)
4. **MEDIUM** - Compact time tracking (UX improvement)
5. **MEDIUM** - Add subtask edit (core functionality)
6. **MEDIUM** - Update analytics (data visualization)
7. **LOW** - Add @mention preview (nice-to-have)

---

## 🧪 Testing Checklist

After implementing all fixes:
- [ ] Images in comments load correctly
- [ ] /subtask navigation works in comments
- [ ] Edit task modal opens and saves changes
- [ ] Edit subtask works in SubtaskDetailModal
- [ ] Time tracking is compact and functional
- [ ] @mention autocomplete shows user preview
- [ ] Clicking notification scrolls to comment
- [ ] Subtask detail handles missing linkedTask
- [ ] Analytics shows workflow-based data
- [ ] No console errors
- [ ] Frontend builds successfully
- [ ] Backend starts without errors

---

## 🚀 Deployment Steps

1. Run `npm run build` in frontend
2. Restart backend service
3. Test all features in staging
4. Deploy to production
5. Monitor error logs

