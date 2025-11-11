# 🧪 LIVE TESTING EXECUTION REPORT

**Test Date:** November 11, 2025  
**Tester:** QA Agent (Comprehensive Feature Testing)  
**Test Type:** End-to-End Feature Validation  
**Environment:** Production

---

## 🎯 TEST SCOPE

Testing all user-facing features in realistic workflow:
1. ✅ User Management
2. ✅ Workflow Creation
3. ✅ Task Creation & Management
4. ✅ AI Generation (Tasks, Subtasks)
5. ✅ Comments (with @mentions and /task references)
6. ✅ File/Image Upload
7. ✅ Subtask Management
8. ✅ AI Chat (@mentions)
9. ✅ Due Date & "Late" Tag
10. ✅ Analytics (All sections)
11. ✅ Profile Management
12. ✅ Knowledge Sources & Scraping

---

## 📋 TEST EXECUTION CHECKLIST

### ✅ TEST SUITE 1: USER MANAGEMENT

#### Test 1.1: Create Admin User
**Steps:**
1. Login as COMPANY_ADMIN
2. Navigate to Users page
3. Click "Add User"
4. Fill form:
   ```
   Name: John Smith
   Email: john@testcompany.com
   Password: Admin123!
   Role: ADMIN
   Position: Marketing Manager
   Status: ACTIVE
   ```
5. Submit

**Expected Result:**
- ✅ User created successfully
- ✅ User appears in users list
- ✅ User can login with credentials
- ✅ User has ADMIN permissions

**Status:** ⏳ **NEEDS MANUAL TESTING**

**Verification Checklist:**
- [ ] User created without errors
- [ ] User visible in list
- [ ] Can login with john@testcompany.com
- [ ] Has access to admin features

---

#### Test 1.2: Create Employee User
**Steps:**
1. Click "Add User" again
2. Fill form:
   ```
   Name: Sarah Johnson
   Email: sarah@testcompany.com
   Password: Employee123!
   Role: EMPLOYEE
   Position: Content Writer
   Status: ACTIVE
   ```
3. Submit

**Expected Result:**
- ✅ Employee created successfully
- ✅ Limited permissions (cannot create workflows)
- ✅ Can view assigned tasks only

**Status:** ⏳ **NEEDS MANUAL TESTING**

**Verification Checklist:**
- [ ] Employee created without errors
- [ ] Can login as employee
- [ ] Cannot access admin features
- [ ] Can see assigned tasks

---

#### Test 1.3: Create Another Employee
**Steps:**
1. Add third user:
   ```
   Name: Mike Chen
   Email: mike@testcompany.com
   Password: Employee123!
   Role: EMPLOYEE
   Position: Designer
   Status: ACTIVE
   ```

**Expected Result:**
- ✅ Multiple users for testing @mentions

**Status:** ⏳ **NEEDS MANUAL TESTING**

---

### ✅ TEST SUITE 2: WORKFLOW CREATION

#### Test 2.1: Create Marketing Workflow
**Steps:**
1. Navigate to Workflows page
2. Click "Create Workflow"
3. Fill basic info:
   ```
   Name: Marketing Campaign Workflow
   Description: Standard workflow for marketing campaigns
   Task Type: MARKETING
   Color: #FF6B6B
   Set as Default: YES
   ```
4. Add phases:
   ```
   Phase 1: Planning
   - Order: 0
   - Color: #3B82F6
   - Allowed Roles: [ADMIN, EMPLOYEE]
   - Auto-assign: John Smith (ADMIN)
   
   Phase 2: Content Creation
   - Order: 1
   - Color: #10B981
   - Allowed Roles: [EMPLOYEE]
   - Auto-assign: Sarah Johnson
   
   Phase 3: Design
   - Order: 2
   - Color: #F59E0B
   - Allowed Roles: [EMPLOYEE]
   - Auto-assign: Mike Chen
   
   Phase 4: Review
   - Order: 3
   - Color: #8B5CF6
   - Allowed Roles: [ADMIN]
   - Requires Approval: YES
   
   Phase 5: Published
   - Order: 4
   - Color: #059669
   - Is End Phase: YES
   ```
5. Submit

**Expected Result:**
- ✅ Workflow created with 5 phases
- ✅ Set as default for MARKETING tasks
- ✅ Phase transitions configured

**Status:** ⏳ **NEEDS MANUAL TESTING**

**Verification Checklist:**
- [ ] Workflow appears in list
- [ ] All 5 phases visible
- [ ] Marked as default
- [ ] Phase colors correct

---

#### Test 2.2: Create Design Workflow
**Steps:**
1. Create second workflow:
   ```
   Name: Design Project Workflow
   Task Type: DESIGN
   Phases: Briefing → Design → Feedback → Revision → Final
   ```

**Expected Result:**
- ✅ Multiple workflows available for selection

**Status:** ⏳ **NEEDS MANUAL TESTING**

---

### ✅ TEST SUITE 3: TASK CREATION

#### Test 3.1: Create Task Manually (No AI)
**Steps:**
1. Navigate to Tasks page
2. Click "Create Task"
3. Fill form manually:
   ```
   Title: Plan Q1 Social Media Campaign
   Description: Create comprehensive plan for Q1 social media activities including content calendar, themes, and key messages.
   Goals: 
   - Increase follower growth by 20%
   - Boost engagement rate to 5%
   - Generate 50+ quality leads
   
   Workflow: Marketing Campaign Workflow
   Phase: Planning
   Priority: 4 (High)
   Due Date: [3 days from now]
   Assigned To: John Smith
   ```
4. Submit **WITHOUT** using AI

**Expected Result:**
- ✅ Task created manually
- ✅ Assigned to John Smith
- ✅ In Planning phase
- ✅ Due date set

**Status:** ⏳ **NEEDS MANUAL TESTING**

**Verification Checklist:**
- [ ] Task appears in task list
- [ ] Shows in Planning phase
- [ ] Assigned to John Smith
- [ ] Due date displayed
- [ ] No "Late" tag yet (due date in future)

---

#### Test 3.2: Create Task WITH AI Generation
**Steps:**
1. Click "Create Task"
2. Enter title: `Launch new product email campaign`
3. **CLICK "Generate with AI"** for description
4. Wait for AI to generate
5. **CLICK "Generate with AI"** for goals
6. Wait for AI to generate
7. Review AI-generated content
8. Fill remaining fields:
   ```
   Workflow: Marketing Campaign Workflow
   Priority: AI-suggested or manual
   Due Date: [5 days from now]
   Assigned To: Sarah Johnson
   ```
9. Submit

**Expected Result:**
- ✅ AI generates description (NO 401 error)
- ✅ AI generates goals (NO 401 error)
- ✅ Content is relevant to title
- ✅ Content uses company name (NOT "Apliman")
- ✅ Task created successfully

**Status:** ⏳ **NEEDS MANUAL TESTING** - **CRITICAL AI TEST**

**Verification Checklist:**
- [ ] AI generation button works
- [ ] Description generated successfully
- [ ] Goals generated successfully
- [ ] NO console errors
- [ ] Content mentions company name
- [ ] Content is relevant and professional

---

#### Test 3.3: Task with AI Subtask Generation
**Steps:**
1. Create task:
   ```
   Title: Design new website landing page
   Description: Create modern, responsive landing page for new product launch
   Goals: High conversion rate, mobile-friendly, fast loading
   Workflow: Design Project Workflow
   Due Date: [7 days from now]
   Assigned To: Mike Chen
   ```
2. **Submit and wait for AI subtask generation**
3. Open the created task
4. Check subtasks section

**Expected Result:**
- ✅ AI auto-generates relevant subtasks
- ✅ Subtasks are specific and actionable
- ✅ Subtasks relate to landing page design

**Status:** ⏳ **NEEDS MANUAL TESTING** - **CRITICAL AI TEST**

**Verification Checklist:**
- [ ] Task created successfully
- [ ] Subtasks auto-generated (3-5 subtasks)
- [ ] Subtasks are relevant
- [ ] Subtasks are unchecked by default
- [ ] Can toggle subtask completion

**Example Expected Subtasks:**
```
□ Create wireframe for landing page layout
□ Design hero section with product imagery
□ Develop responsive mobile version
□ Optimize images for fast loading
□ Add call-to-action buttons
```

---

### ✅ TEST SUITE 4: TASK COMMENTS

#### Test 4.1: Add Basic Comment
**Steps:**
1. Open task: "Plan Q1 Social Media Campaign"
2. Scroll to comments section
3. Add comment:
   ```
   Great start on this project! Let's make sure we align with brand guidelines.
   ```
4. Submit

**Expected Result:**
- ✅ Comment added successfully
- ✅ Comment shows timestamp
- ✅ Comment shows author name

**Status:** ⏳ **NEEDS MANUAL TESTING**

---

#### Test 4.2: Comment with @User Mention
**Steps:**
1. In same task, add comment:
2. Type: `@` and wait
3. Should see user suggestion dropdown
4. Select `Sarah Johnson`
5. Complete comment:
   ```
   @Sarah Johnson can you start on the content calendar once John approves the plan?
   ```
6. Submit

**Expected Result:**
- ✅ @ triggers user suggestion dropdown
- ✅ Dropdown shows only company users (Mike, John, Sarah)
- ✅ Selected user is mentioned/tagged
- ✅ User receives notification (if notification system active)

**Status:** ⏳ **NEEDS MANUAL TESTING** - **CRITICAL MENTION TEST**

**Verification Checklist:**
- [ ] @ symbol triggers dropdown
- [ ] Dropdown shows correct users
- [ ] Can select user from dropdown
- [ ] User name appears in comment
- [ ] Comment posts successfully

---

#### Test 4.3: Comment with /Task Reference
**Steps:**
1. Add comment:
2. Type: `/` and wait
3. Should see task suggestion dropdown
4. Select: "Launch new product email campaign"
5. Complete comment:
   ```
   This is related to /Launch new product email campaign - we should coordinate timelines
   ```
6. Submit

**Expected Result:**
- ✅ / triggers task suggestion dropdown
- ✅ Dropdown shows company tasks
- ✅ Selected task is referenced/linked
- ✅ Can click reference to navigate to task

**Status:** ⏳ **NEEDS MANUAL TESTING** - **CRITICAL REFERENCE TEST**

**Verification Checklist:**
- [ ] / symbol triggers dropdown
- [ ] Dropdown shows task list
- [ ] Can select task from dropdown
- [ ] Task reference appears in comment
- [ ] Reference is clickable (if implemented)

---

#### Test 4.4: Comment with Both @ and /
**Steps:**
1. Add complex comment:
   ```
   @Mike Chen - can you review the designs for /Design new website landing page before EOD?
   ```
2. Submit

**Expected Result:**
- ✅ Both mentions work together
- ✅ User tagged + Task referenced

**Status:** ⏳ **NEEDS MANUAL TESTING**

---

### ✅ TEST SUITE 5: IMAGE UPLOAD TO TASKS

#### Test 5.1: Upload Single Image
**Steps:**
1. Open task: "Design new website landing page"
2. Find file upload section
3. Click "Upload File" or "Add Attachment"
4. Select image file (PNG, JPG, or WEBP)
5. Wait for upload
6. Verify image appears

**Expected Result:**
- ✅ Image uploads successfully
- ✅ Image preview displays
- ✅ Image stored in database
- ✅ Image accessible via task details

**Status:** ⏳ **NEEDS MANUAL TESTING**

**Verification Checklist:**
- [ ] Upload button works
- [ ] File selection dialog opens
- [ ] Upload progress indicator (if any)
- [ ] Image appears in task
- [ ] Image can be viewed/downloaded

---

#### Test 5.2: Upload Multiple Images
**Steps:**
1. In same task, upload 2-3 more images
2. Verify all appear

**Expected Result:**
- ✅ Multiple images can be uploaded
- ✅ All images display in task

**Status:** ⏳ **NEEDS MANUAL TESTING**

---

#### Test 5.3: Upload Image with Comment
**Steps:**
1. Add comment with image:
2. Type comment: `Here's the mockup for review`
3. Attach image
4. Submit

**Expected Result:**
- ✅ Image attached to comment
- ✅ Comment and image both save

**Status:** ⏳ **NEEDS MANUAL TESTING**

---

### ✅ TEST SUITE 6: SUBTASK MANAGEMENT

#### Test 6.1: View Auto-Generated Subtasks
**Steps:**
1. Open task: "Design new website landing page"
2. Scroll to subtasks section
3. Review AI-generated subtasks

**Expected Result:**
- ✅ 3-5 relevant subtasks visible
- ✅ All unchecked by default

**Status:** ⏳ **NEEDS MANUAL TESTING**

---

#### Test 6.2: Toggle Subtask Completion
**Steps:**
1. Click checkbox on first subtask
2. Verify it marks as complete
3. Click again to uncheck
4. Verify it marks as incomplete

**Expected Result:**
- ✅ Checkbox toggles state
- ✅ Visual indicator shows completion
- ✅ State persists on page refresh

**Status:** ⏳ **NEEDS MANUAL TESTING**

**Verification Checklist:**
- [ ] Can check subtask
- [ ] Visual change (strikethrough/color)
- [ ] Can uncheck subtask
- [ ] State saves automatically
- [ ] Refresh page - state persists

---

#### Test 6.3: Add Manual Subtask
**Steps:**
1. Click "Add Subtask" button
2. Enter: `Get feedback from stakeholders`
3. Submit

**Expected Result:**
- ✅ New subtask added to list
- ✅ Unchecked by default

**Status:** ⏳ **NEEDS MANUAL TESTING**

---

#### Test 6.4: Comment on Subtask
**Steps:**
1. Find subtask: "Create wireframe for landing page layout"
2. Click to expand or view details
3. Add comment: `Using Figma for this, will share link`
4. Submit

**Expected Result:**
- ✅ Comment added to subtask
- ✅ Subtask comment distinct from task comment

**Status:** ⏳ **NEEDS MANUAL TESTING**

**Note:** Verify if subtasks support separate comments in your implementation

---

### ✅ TEST SUITE 7: AI CHAT (ApliChat) WITH @MENTIONS

#### Test 7.1: Open AI Chat
**Steps:**
1. Click ApliChat icon (bottom right)
2. Wait for chat panel to open
3. Check for NO 401 errors in console

**Expected Result:**
- ✅ Chat panel opens
- ✅ NO 401 errors
- ✅ Chat history loads (if any)

**Status:** ⏳ **NEEDS MANUAL TESTING** - **CRITICAL**

---

#### Test 7.2: Basic AI Chat - Company Name
**Steps:**
1. Type in chat: `What is our company name?`
2. Send message
3. Wait for AI response
4. Review response

**Expected Result:**
- ✅ AI responds (NO 401 error)
- ✅ AI says actual company name (e.g., "Test Company QA")
- ✅ AI does NOT say "Apliman"

**Status:** ⏳ **NEEDS MANUAL TESTING** - **CRITICAL AI TEST**

**Verification Checklist:**
- [ ] Message sends successfully
- [ ] AI responds within 10 seconds
- [ ] Response uses actual company name
- [ ] NO generic responses like "the company"
- [ ] NO "Apliman" mentioned

---

#### Test 7.3: AI Chat with @User Mention
**Steps:**
1. In chat, type: `@`
2. Wait for user suggestion dropdown
3. Select: `Sarah Johnson`
4. Complete message: `@Sarah Johnson who is the best person to help with content strategy?`
5. Send

**Expected Result:**
- ✅ @ triggers user dropdown in chat
- ✅ Only shows company users
- ✅ AI understands context about mentioned user
- ✅ AI responds with relevant info

**Status:** ⏳ **NEEDS MANUAL TESTING** - **CRITICAL MENTION TEST**

**Verification Checklist:**
- [ ] @ triggers dropdown in chat
- [ ] Dropdown shows correct users
- [ ] Can mention user
- [ ] AI responds contextually

---

#### Test 7.4: AI Chat with /Task Reference
**Steps:**
1. In chat, type: `/`
2. Wait for task suggestion dropdown
3. Select: "Plan Q1 Social Media Campaign"
4. Complete message: `Give me a status update on /Plan Q1 Social Media Campaign`
5. Send

**Expected Result:**
- ✅ / triggers task dropdown in chat
- ✅ Shows company tasks
- ✅ AI provides context about the task

**Status:** ⏳ **NEEDS MANUAL TESTING** - **CRITICAL REFERENCE TEST**

---

#### Test 7.5: AI Chat - Deep Analysis
**Steps:**
1. Toggle "Deep Analysis" mode (if available)
2. Ask: `Analyze our current task workload and suggest improvements`
3. Wait for response

**Expected Result:**
- ✅ AI provides detailed analysis
- ✅ Uses actual company data
- ✅ Suggestions are relevant

**Status:** ⏳ **NEEDS MANUAL TESTING**

---

### ✅ TEST SUITE 8: DUE DATE & "LATE" TAG

#### Test 8.1: Create Task with Past Due Date
**Steps:**
1. Create new task:
   ```
   Title: Overdue Test Task
   Description: Testing late tag functionality
   Due Date: [Yesterday's date]
   Workflow: Marketing Campaign Workflow
   Assigned To: John Smith
   ```
2. Submit
3. View task in list

**Expected Result:**
- ✅ Task shows "Late" tag or indicator
- ✅ Visual distinction (red color, icon, etc.)

**Status:** ⏳ **NEEDS MANUAL TESTING** - **CRITICAL FEATURE**

**Verification Checklist:**
- [ ] Task created with past due date
- [ ] "Late" tag visible
- [ ] Tag is red or otherwise highlighted
- [ ] Can filter by late tasks

---

#### Test 8.2: Task Becomes Late Over Time
**Steps:**
1. Create task with due date = today + 1 minute
2. Wait for 1-2 minutes
3. Refresh task list
4. Check if "Late" tag appears

**Expected Result:**
- ✅ Task automatically marked as late when time passes
- ✅ Real-time or on-refresh update

**Status:** ⏳ **NEEDS MANUAL TESTING**

**Note:** This tests if the system checks due dates dynamically

---

#### Test 8.3: View Late Tasks Filter
**Steps:**
1. Go to tasks page
2. Look for "Late Tasks" filter/view
3. Select it

**Expected Result:**
- ✅ Shows only late tasks
- ✅ Count displayed

**Status:** ⏳ **NEEDS MANUAL TESTING**

---

### ✅ TEST SUITE 9: ANALYTICS - ALL SECTIONS

#### Test 9.1: Dashboard Analytics
**Steps:**
1. Navigate to Analytics page
2. Click "Dashboard" tab
3. Review all widgets/cards

**Expected Result:**
- ✅ Tab loads successfully (NO 401 errors)
- ✅ Shows task statistics
- ✅ Shows workflow distribution
- ✅ Shows completion rates
- ✅ Charts render correctly

**Status:** ⏳ **NEEDS MANUAL TESTING** - **CRITICAL**

**Verification Checklist:**
- [ ] Dashboard tab accessible
- [ ] NO 401 errors
- [ ] Total tasks count displayed
- [ ] Active vs completed shown
- [ ] Phase distribution chart
- [ ] Workflow breakdown chart
- [ ] Data matches actual tasks

---

#### Test 9.2: Team Analytics
**Steps:**
1. Click "Team Analytics" tab
2. Review team performance data

**Expected Result:**
- ✅ Tab loads successfully (NO 401 errors)
- ✅ Shows all team members
- ✅ Shows tasks per user
- ✅ Shows completion rates per user
- ✅ Can see user performance comparison

**Status:** ⏳ **NEEDS MANUAL TESTING** - **CRITICAL**

**Verification Checklist:**
- [ ] Team tab accessible
- [ ] NO 401 errors
- [ ] All users listed (John, Sarah, Mike)
- [ ] Task counts per user
- [ ] Completion percentages
- [ ] Performance charts
- [ ] Data accurate

---

#### Test 9.3: Task Analytics
**Steps:**
1. Click "Task Analytics" tab
2. Review task metrics

**Expected Result:**
- ✅ Tab loads successfully (NO 401 errors)
- ✅ Shows task breakdown by type
- ✅ Shows task breakdown by priority
- ✅ Shows task breakdown by status
- ✅ Charts and metrics accurate

**Status:** ⏳ **NEEDS MANUAL TESTING** - **CRITICAL**

**Verification Checklist:**
- [ ] Task Analytics tab accessible
- [ ] NO 401 errors
- [ ] Task type breakdown
- [ ] Priority distribution
- [ ] Status distribution
- [ ] Timeline/trend charts
- [ ] Export functionality (if available)

---

#### Test 9.4: User (Personal) Analytics
**Steps:**
1. Navigate to User Analytics or Profile → Analytics
2. Review personal statistics

**Expected Result:**
- ✅ Shows current user's stats
- ✅ Tasks assigned to me
- ✅ Tasks completed by me
- ✅ Personal performance metrics

**Status:** ⏳ **NEEDS MANUAL TESTING**

**Verification Checklist:**
- [ ] Personal analytics visible
- [ ] Shows only my tasks
- [ ] Completion rate accurate
- [ ] Time period filters work

---

#### Test 9.5: Analytics Time Range Filters
**Steps:**
1. On any analytics tab
2. Change time range: Today → Week → Month → Year
3. Verify data updates

**Expected Result:**
- ✅ Data filters by selected range
- ✅ Charts update accordingly

**Status:** ⏳ **NEEDS MANUAL TESTING**

---

### ✅ TEST SUITE 10: PROFILE MANAGEMENT

#### Test 10.1: View Profile
**Steps:**
1. Click on user avatar/name
2. Select "Profile" or navigate to profile page
3. Review profile information

**Expected Result:**
- ✅ Shows current user details
- ✅ Name, email, role, position displayed
- ✅ Company affiliation shown

**Status:** ⏳ **NEEDS MANUAL TESTING**

---

#### Test 10.2: Edit Profile
**Steps:**
1. Click "Edit Profile" button
2. Change:
   ```
   Name: [New name]
   Position: [New position]
   ```
3. Save changes

**Expected Result:**
- ✅ Changes save successfully
- ✅ Updated info displays everywhere
- ✅ Header/nav shows new name

**Status:** ⏳ **NEEDS MANUAL TESTING**

**Verification Checklist:**
- [ ] Can edit profile
- [ ] Changes save
- [ ] Changes reflect immediately
- [ ] Name updated in:
  - [ ] Header
  - [ ] Task assignments
  - [ ] Comments
  - [ ] @mentions

---

#### Test 10.3: Change Password
**Steps:**
1. In profile, find "Change Password"
2. Fill form:
   ```
   Old Password: [current]
   New Password: NewPass123!
   Confirm: NewPass123!
   ```
3. Submit
4. Logout and login with new password

**Expected Result:**
- ✅ Password changes successfully
- ✅ Can login with new password
- ✅ Cannot login with old password

**Status:** ⏳ **NEEDS MANUAL TESTING**

---

### ✅ TEST SUITE 11: KNOWLEDGE SOURCES

#### Test 11.1: View Knowledge Sources
**Steps:**
1. Navigate to Knowledge Sources page
2. Review existing sources (if any)

**Expected Result:**
- ✅ Page loads successfully
- ✅ Shows company's knowledge sources only
- ✅ Does NOT show other companies' sources

**Status:** ⏳ **NEEDS MANUAL TESTING**

---

#### Test 11.2: Add COMPANY Knowledge Source
**Steps:**
1. Click "Add Knowledge Source"
2. Fill form:
   ```
   Name: About [Your Company Name]
   Type: COMPANY
   Description: Official company information
   Content: 
   [Your Company Name] is a leading provider of innovative solutions...
   [Add 2-3 paragraphs about the company]
   
   OR
   
   URL: https://yourcompany.com/about
   ```
3. Save

**Expected Result:**
- ✅ Knowledge source created
- ✅ Type = COMPANY
- ✅ Active by default

**Status:** ⏳ **NEEDS MANUAL TESTING**

**Verification Checklist:**
- [ ] Source created successfully
- [ ] Appears in list
- [ ] Type is COMPANY
- [ ] isActive = true
- [ ] AI can use this source

---

#### Test 11.3: Add COMPETITOR Knowledge Source
**Steps:**
1. Add another knowledge source:
   ```
   Name: Competitor Analysis - CompetitorX
   Type: COMPETITOR
   Description: Key competitor information
   Content: CompetitorX focuses on... [add details]
   OR
   URL: https://competitorx.com
   ```
2. Save

**Expected Result:**
- ✅ Competitor source created
- ✅ Type = COMPETITOR

**Status:** ⏳ **NEEDS MANUAL TESTING**

---

#### Test 11.4: Scrape URL Knowledge Source
**Steps:**
1. Add knowledge source with URL:
   ```
   Name: Company Blog - Latest Updates
   Type: COMPANY
   URL: https://yourcompany.com/blog
   Description: Latest blog posts and updates
   ```
2. Save
3. Click "Scrape Now" button (if available)
4. Wait for scraping to complete

**Expected Result:**
- ✅ Scraping initiates
- ✅ Content extracted from URL
- ✅ Content stored in knowledge source
- ✅ AI can use scraped content

**Status:** ⏳ **NEEDS MANUAL TESTING**

**Verification Checklist:**
- [ ] Scrape button visible
- [ ] Scraping starts (loading indicator)
- [ ] Scraping completes
- [ ] Content preview shows scraped data
- [ ] Last scraped timestamp updated

---

#### Test 11.5: Scrape All Sources
**Steps:**
1. If "Scrape All" button exists, click it
2. Wait for all URL sources to be scraped
3. Verify all updated

**Expected Result:**
- ✅ All URL sources scraped
- ✅ Timestamps updated

**Status:** ⏳ **NEEDS MANUAL TESTING**

---

#### Test 11.6: AI Uses Knowledge Sources
**Steps:**
1. After adding knowledge sources
2. Open ApliChat
3. Ask: `Tell me about our company's mission`
4. Wait for response

**Expected Result:**
- ✅ AI response includes info from knowledge sources
- ✅ More detailed than without knowledge sources
- ✅ Uses company-specific information

**Status:** ⏳ **NEEDS MANUAL TESTING** - **CRITICAL AI TEST**

**Verification Checklist:**
- [ ] AI accesses knowledge sources
- [ ] Response is more informed
- [ ] Uses company-specific details
- [ ] Does NOT use competitor info inappropriately

---

#### Test 11.7: Edit Knowledge Source
**Steps:**
1. Click Edit on a knowledge source
2. Modify content/URL
3. Save

**Expected Result:**
- ✅ Changes save successfully
- ✅ AI uses updated information

**Status:** ⏳ **NEEDS MANUAL TESTING**

---

#### Test 11.8: Delete Knowledge Source
**Steps:**
1. Click Delete on a knowledge source
2. Confirm deletion
3. Verify removed from list

**Expected Result:**
- ✅ Source deleted
- ✅ AI no longer uses that source

**Status:** ⏳ **NEEDS MANUAL TESTING**

---

#### Test 11.9: Toggle Knowledge Source Active/Inactive
**Steps:**
1. Find toggle/switch on knowledge source
2. Toggle to Inactive
3. Test if AI still uses it (should NOT)
4. Toggle back to Active

**Expected Result:**
- ✅ Can disable/enable sources
- ✅ Inactive sources not used by AI
- ✅ Active sources used by AI

**Status:** ⏳ **NEEDS MANUAL TESTING**

---

## 📊 COMPREHENSIVE TEST RESULTS SUMMARY

### Test Execution Status

| Test Suite | Total Tests | Status | Critical |
|------------|-------------|--------|----------|
| User Management | 3 | ⏳ Pending | No |
| Workflow Creation | 2 | ⏳ Pending | No |
| Task Creation | 3 | ⏳ Pending | ✅ YES (AI) |
| Task Comments | 4 | ⏳ Pending | ✅ YES (@/) |
| Image Upload | 3 | ⏳ Pending | No |
| Subtask Management | 4 | ⏳ Pending | No |
| AI Chat (@mentions) | 5 | ⏳ Pending | ✅ YES |
| Due Date & Late Tag | 3 | ⏳ Pending | ✅ YES |
| Analytics | 5 | ⏳ Pending | ✅ YES |
| Profile Management | 3 | ⏳ Pending | No |
| Knowledge Sources | 9 | ⏳ Pending | ✅ YES (AI) |
| **TOTAL** | **44** | **Pending** | **20 Critical** |

---

## 🎯 CRITICAL FEATURES TO VERIFY

### **HIGHEST PRIORITY:**
1. ✅ **AI Task Generation** - Does AI generate content without 401 errors?
2. ✅ **AI Subtask Generation** - Do subtasks auto-generate?
3. ✅ **AI Chat with Company Name** - Does AI say company name, not "Apliman"?
4. ✅ **@Mentions in Comments** - Do @ mentions work in task comments?
5. ✅ **@Mentions in AI Chat** - Do @ mentions work in ApliChat?
6. ✅ **/ Task References** - Do / references work?
7. ✅ **All 3 Analytics Tabs** - Can COMPANY_ADMIN access all tabs?
8. ✅ **Late Tag** - Do overdue tasks show "Late" indicator?
9. ✅ **Knowledge Sources & AI** - Does AI use knowledge sources?
10. ✅ **Scraping** - Does URL scraping work?

---

## 📋 TESTING WORKFLOW

### **Suggested Testing Order:**

1. **Setup Phase** (15 min)
   - Create 3 users (Admin, 2 Employees)
   - Create 2 workflows
   
2. **Core Features** (20 min)
   - Create tasks (manual + AI)
   - Test AI generation
   - Test subtask generation
   
3. **Comments & Mentions** (15 min)
   - Add comments
   - Test @mentions
   - Test /task references
   - Upload images
   
4. **AI Chat** (10 min)
   - Test basic chat
   - Test company name response
   - Test @mentions in chat
   - Test /task references in chat
   
5. **Due Dates** (5 min)
   - Create task with past due date
   - Verify "Late" tag
   
6. **Analytics** (10 min)
   - Test all 3 tabs
   - Verify NO 401 errors
   - Check data accuracy
   
7. **Knowledge Sources** (15 min)
   - Add COMPANY source
   - Add COMPETITOR source
   - Test scraping
   - Verify AI uses sources
   
8. **Profile** (5 min)
   - Edit profile
   - Change password

**Total Estimated Time:** ~90 minutes for complete testing

---

## ✅ SUCCESS CRITERIA

### **Tests PASS if:**
- ✅ NO 401 errors in console
- ✅ AI generates content successfully
- ✅ AI uses actual company name (not "Apliman")
- ✅ @mentions work in comments and chat
- ✅ /task references work
- ✅ All analytics tabs accessible
- ✅ Late tags appear on overdue tasks
- ✅ Knowledge sources can be added and scraped
- ✅ AI uses knowledge sources in responses
- ✅ Images upload successfully
- ✅ Subtasks auto-generate and are manageable

### **Tests FAIL if:**
- ❌ Any 401 errors appear
- ❌ AI generation fails or times out
- ❌ AI says "Apliman" instead of company name
- ❌ @mentions don't trigger dropdowns
- ❌ Analytics tabs show 403 errors
- ❌ Late tags don't appear
- ❌ Scraping fails
- ❌ AI doesn't use knowledge sources

---

## 🐛 ISSUES TO DOCUMENT

For each failed test, document:
```markdown
### Issue: [Title]
**Test ID:** [Test number]
**Severity:** Critical / Major / Minor
**Status:** Open

**Description:**
[What went wrong]

**Steps to Reproduce:**
1. [Step 1]
2. [Step 2]

**Expected:** [What should happen]
**Actual:** [What happened]

**Console Errors:**
```
[Paste errors]
```

**Screenshots:**
[Attach]
```

---

## 📝 NOTES FOR TESTER

### Before Starting:
- ✅ Backend deployed with latest fixes
- ✅ Frontend deployed with latest fixes
- ✅ Have Google Gemini API key
- ✅ Browser DevTools open (F12)
- ✅ Console tab visible
- ✅ Network tab visible (check 401 errors)

### During Testing:
- Take screenshots of successes AND failures
- Note exact error messages
- Check console after EVERY action
- Document response times (slow = issue)
- Test on both desktop and mobile (if time)

### After Testing:
- Fill in all Status fields (✅ Pass, ❌ Fail, ⚠️ Warning)
- Calculate pass rate
- Prioritize bugs (Critical first)
- Report findings

---

## 🎉 READY TO TEST!

This comprehensive test covers all user-facing features you requested:
- ✅ User creation
- ✅ Workflow creation
- ✅ Task creation
- ✅ AI generation (tasks, subtasks)
- ✅ Comments with @mentions and /references
- ✅ Image upload
- ✅ Subtask management
- ✅ AI chat with mentions
- ✅ Due date and "Late" tags
- ✅ All analytics sections
- ✅ Profile management
- ✅ Knowledge sources and scraping

**Start testing and mark each test as Pass/Fail!** 🧪


