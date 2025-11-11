# 🧪 Comprehensive QA Test Plan - Multi-Tenant Task Management System

**Date:** November 11, 2025  
**Version:** 2.0  
**Tester:** AI QA Agent  
**Environment:** Production (Render)

---

## 📋 Test Scope

### Systems Under Test:
1. **System Administrator Portal**
2. **Company Management**
3. **Company Portal (User Features)**
4. **Multi-Tenant Isolation**
5. **AI Features (Multi-Tenant)**
6. **Authentication & Authorization**

---

## 🔐 Test 1: SYSTEM ADMINISTRATOR PORTAL

### 1.1 System Admin Authentication
| Test ID | Test Case | Steps | Expected Result | Status | Notes |
|---------|-----------|-------|----------------|--------|-------|
| SA-AUTH-001 | Admin login with valid credentials | 1. Navigate to `/admin/login`<br>2. Enter: `superadmin@apliman.com`<br>3. Enter password: `SuperAdmin123!`<br>4. Click Sign In | Successfully logged in, redirected to `/admin/companies` | ⏳ Pending | |
| SA-AUTH-002 | Admin login with invalid credentials | 1. Navigate to `/admin/login`<br>2. Enter wrong email/password<br>3. Click Sign In | Error message displayed, no login | ⏳ Pending | |
| SA-AUTH-003 | Company user cannot access admin portal | 1. Navigate to `/admin/login`<br>2. Use company admin credentials<br>3. Click Sign In | Error: "Access denied. This portal is for System Administrators only" | ⏳ Pending | |
| SA-AUTH-004 | Admin logout | 1. Login as admin<br>2. Click logout | Logged out, redirected to `/admin/login` | ⏳ Pending | |

### 1.2 Company Creation
| Test ID | Test Case | Steps | Expected Result | Status | Notes |
|---------|-----------|-------|----------------|--------|-------|
| SA-COMP-001 | Create company with all fields | 1. Login as admin<br>2. Click "Create New Company"<br>3. Fill all fields including AI key<br>4. Upload logo<br>5. Submit | Company created, admin credentials displayed | ⏳ Pending | |
| SA-COMP-002 | Create company without AI key | 1. Login as admin<br>2. Click "Create New Company"<br>3. Fill fields, skip AI key<br>4. Submit | Company created, AI disabled | ⏳ Pending | |
| SA-COMP-003 | Create company with duplicate slug | 1. Create company with slug "test"<br>2. Try to create another with slug "test" | Error: slug already exists | ⏳ Pending | |
| SA-COMP-004 | Multi-step form navigation | 1. Fill step 1, click Next<br>2. Fill step 2, click Next<br>3. Click Previous | Forms retain values, navigation works | ⏳ Pending | |
| SA-COMP-005 | Logo upload and display | 1. Upload logo during creation<br>2. View company list<br>3. View company details | Logo displays correctly everywhere | ⏳ Pending | |

### 1.3 Company Management
| Test ID | Test Case | Steps | Expected Result | Status | Notes |
|---------|-----------|-------|----------------|--------|-------|
| SA-MGMT-001 | View all companies list | 1. Login as admin<br>2. Navigate to companies list | All companies displayed with stats | ⏳ Pending | |
| SA-MGMT-002 | View company details | 1. Click on a company | Company details, stats, users count displayed | ⏳ Pending | |
| SA-MGMT-003 | Edit company details | 1. Click Edit on company<br>2. Change name/plan<br>3. Save | Changes saved successfully | ⏳ Pending | |
| SA-MGMT-004 | Edit AI key - verify persistence | 1. Edit company<br>2. Add/change AI key<br>3. Save<br>4. Edit again | AI key still visible (decrypted) | ⏳ Pending | |
| SA-MGMT-005 | Suspend company | 1. Click suspend on company<br>2. Confirm | Company suspended, users cannot login | ⏳ Pending | |
| SA-MGMT-006 | Reactivate company | 1. Click reactivate on suspended company | Company active, users can login | ⏳ Pending | |
| SA-MGMT-007 | Extend subscription | 1. Click extend subscription<br>2. Add days<br>3. Submit | Subscription extended | ⏳ Pending | |
| SA-MGMT-008 | Reset company admin password | 1. Click reset password<br>2. Confirm | New password generated and displayed | ⏳ Pending | |
| SA-MGMT-009 | Delete company | 1. Click delete on company<br>2. Confirm | Company and all data deleted | ⏳ Pending | |

### 1.4 Platform Statistics
| Test ID | Test Case | Steps | Expected Result | Status | Notes |
|---------|-----------|-------|----------------|--------|-------|
| SA-STATS-001 | View platform stats | 1. Login as admin<br>2. View dashboard | Total companies, users, tasks displayed | ⏳ Pending | |
| SA-STATS-002 | View platform analytics | 1. Navigate to analytics | Charts and metrics displayed | ⏳ Pending | |

---

## 🏢 Test 2: COMPANY PORTAL - AUTHENTICATION

### 2.1 Company Admin Login
| Test ID | Test Case | Steps | Expected Result | Status | Notes |
|---------|-----------|-------|----------------|--------|-------|
| CO-AUTH-001 | Company admin login with valid credentials | 1. Navigate to `/{company-slug}/login`<br>2. Enter admin email/password<br>3. Click Sign In | Logged in, redirected to `/dashboard`, NO 401 errors | ⏳ Pending | CRITICAL |
| CO-AUTH-002 | Company admin login - token persistence | 1. Login successfully<br>2. Check localStorage<br>3. Check console for token | Token saved in localStorage, sent with requests | ⏳ Pending | CRITICAL |
| CO-AUTH-003 | Wrong company slug | 1. Navigate to `/nonexistent/login` | Error: Company not found | ⏳ Pending | |
| CO-AUTH-004 | User from Company A tries Company B login | 1. Navigate to `/companyB/login`<br>2. Use Company A credentials | Error: Account not associated with this company | ⏳ Pending | |
| CO-AUTH-005 | Inactive company login attempt | 1. Admin suspends company<br>2. User tries to login | Error: Company account suspended | ⏳ Pending | |
| CO-AUTH-006 | Company branding display | 1. Navigate to company login page | Logo, colors, company name displayed | ⏳ Pending | |

---

## 🏢 Test 3: COMPANY PORTAL - PERMISSIONS (COMPANY_ADMIN)

### 3.1 Dashboard Access
| Test ID | Test Case | Steps | Expected Result | Status | Notes |
|---------|-----------|-------|----------------|--------|-------|
| CO-DASH-001 | Access dashboard after login | 1. Login as company admin<br>2. View dashboard | Dashboard loads, NO 401 errors | ⏳ Pending | CRITICAL |
| CO-DASH-002 | View team members | 1. On dashboard | Team members list displayed | ⏳ Pending | |
| CO-DASH-003 | View task phase chart | 1. On dashboard | Task phase chart displayed | ⏳ Pending | |
| CO-DASH-004 | View analytics summary | 1. On dashboard | Analytics cards displayed | ⏳ Pending | |

### 3.2 Analytics Access
| Test ID | Test Case | Steps | Expected Result | Status | Notes |
|---------|-----------|-------|----------------|--------|-------|
| CO-ANLYT-001 | Access Analytics page | 1. Click Analytics in menu | Analytics page loads, NO 401 errors | ⏳ Pending | CRITICAL |
| CO-ANLYT-002 | View Dashboard Analytics tab | 1. Click Dashboard tab | Dashboard analytics displayed | ⏳ Pending | |
| CO-ANLYT-003 | View Team Analytics tab | 1. Click Team tab | Team performance displayed | ⏳ Pending | |
| CO-ANLYT-004 | View Task Analytics tab | 1. Click Tasks tab | Task metrics displayed | ⏳ Pending | |
| CO-ANLYT-005 | View My Analytics | 1. Navigate to User Analytics | Personal analytics displayed | ⏳ Pending | |

### 3.3 Workflows Management
| Test ID | Test Case | Steps | Expected Result | Status | Notes |
|---------|-----------|-------|----------------|--------|-------|
| CO-WRKF-001 | Access Workflows page | 1. Click Workflows in menu | Workflows page loads, NO 401 errors | ⏳ Pending | CRITICAL |
| CO-WRKF-002 | Create new workflow | 1. Click "Create Workflow"<br>2. Fill details<br>3. Add phases<br>4. Submit | Workflow created successfully | ⏳ Pending | |
| CO-WRKF-003 | Edit existing workflow | 1. Click Edit on workflow<br>2. Modify details<br>3. Save | Workflow updated | ⏳ Pending | |
| CO-WRKF-004 | Delete workflow | 1. Click Delete on workflow<br>2. Confirm | Workflow deleted | ⏳ Pending | |
| CO-WRKF-005 | Set default workflow | 1. Create workflow<br>2. Set as default<br>3. Create another default | Only one default per task type | ⏳ Pending | |

### 3.4 User Management
| Test ID | Test Case | Steps | Expected Result | Status | Notes |
|---------|-----------|-------|----------------|--------|-------|
| CO-USER-001 | Access Users page | 1. Click Users in menu | Users page loads, NO 401 errors | ⏳ Pending | CRITICAL |
| CO-USER-002 | View company users | 1. On Users page | List of company users displayed | ⏳ Pending | |
| CO-USER-003 | Add new user (Admin) | 1. Click "Add User"<br>2. Fill details, set role ADMIN<br>3. Submit | User created, can login | ⏳ Pending | |
| CO-USER-004 | Add new user (Employee) | 1. Click "Add User"<br>2. Fill details, set role EMPLOYEE<br>3. Submit | User created, can login | ⏳ Pending | |
| CO-USER-005 | Edit user | 1. Click Edit on user<br>2. Change details<br>3. Save | User updated | ⏳ Pending | |
| CO-USER-006 | Change user status | 1. Change user to AWAY/OFFLINE | Status updated | ⏳ Pending | |
| CO-USER-007 | Reset user password | 1. Click Reset Password<br>2. Confirm | New password generated | ⏳ Pending | |
| CO-USER-008 | Delete user | 1. Click Delete on user<br>2. Confirm | User deleted (or retired) | ⏳ Pending | |

### 3.5 Knowledge Sources Management
| Test ID | Test Case | Steps | Expected Result | Status | Notes |
|---------|-----------|-------|----------------|--------|-------|
| CO-KNOW-001 | Access Knowledge Sources page | 1. Click Knowledge Sources | Page loads, NO 401 errors | ⏳ Pending | |
| CO-KNOW-002 | View existing knowledge sources | 1. On Knowledge Sources page | Company-specific sources displayed | ⏳ Pending | |
| CO-KNOW-003 | Add COMPANY knowledge source | 1. Click "Add Source"<br>2. Select type COMPANY<br>3. Fill details<br>4. Save | Source created for this company | ⏳ Pending | |
| CO-KNOW-004 | Add COMPETITOR knowledge source | 1. Click "Add Source"<br>2. Select type COMPETITOR<br>3. Fill details<br>4. Save | Source created for this company | ⏳ Pending | |
| CO-KNOW-005 | Edit knowledge source | 1. Click Edit on source<br>2. Modify<br>3. Save | Source updated | ⏳ Pending | |
| CO-KNOW-006 | Delete knowledge source | 1. Click Delete on source<br>2. Confirm | Source deleted | ⏳ Pending | |
| CO-KNOW-007 | Scrape URL source | 1. Create URL source<br>2. Click Scrape | Content scraped and stored | ⏳ Pending | |

---

## 🏢 Test 4: COMPANY PORTAL - TASK MANAGEMENT

### 4.1 Tasks - Basic Operations
| Test ID | Test Case | Steps | Expected Result | Status | Notes |
|---------|-----------|-------|----------------|--------|-------|
| CO-TASK-001 | Access Tasks page | 1. Click Tasks in menu | Tasks page loads, NO 401 errors | ⏳ Pending | CRITICAL |
| CO-TASK-002 | View tasks list | 1. On Tasks page | Company tasks displayed | ⏳ Pending | |
| CO-TASK-003 | Create task manually | 1. Click "Create Task"<br>2. Fill all fields<br>3. Submit | Task created | ⏳ Pending | |
| CO-TASK-004 | View task details | 1. Click on a task | Task details page opens | ⏳ Pending | |
| CO-TASK-005 | Edit task | 1. Open task<br>2. Click Edit<br>3. Modify<br>4. Save | Task updated | ⏳ Pending | |
| CO-TASK-006 | Delete task | 1. Open task<br>2. Click Delete<br>3. Confirm | Task deleted | ⏳ Pending | |
| CO-TASK-007 | Assign task to user | 1. Open task<br>2. Select assignee<br>3. Save | Task assigned | ⏳ Pending | |
| CO-TASK-008 | Move task to different phase | 1. Open task<br>2. Change phase<br>3. Save | Task moved to new phase | ⏳ Pending | |
| CO-TASK-009 | Add comment to task | 1. Open task<br>2. Add comment<br>3. Submit | Comment added | ⏳ Pending | |
| CO-TASK-010 | Upload file to task | 1. Open task<br>2. Upload file<br>3. Submit | File attached to task | ⏳ Pending | |
| CO-TASK-011 | Add subtask manually | 1. Open task<br>2. Add subtask<br>3. Save | Subtask created | ⏳ Pending | |
| CO-TASK-012 | Toggle subtask completion | 1. Open task<br>2. Check/uncheck subtask | Subtask status toggled | ⏳ Pending | |

### 4.2 Tasks - Filtering & Search
| Test ID | Test Case | Steps | Expected Result | Status | Notes |
|---------|-----------|-------|----------------|--------|-------|
| CO-TASK-013 | Filter by workflow | 1. Select workflow from dropdown | Only tasks from that workflow shown | ⏳ Pending | |
| CO-TASK-014 | Filter by phase | 1. Select phase from dropdown | Only tasks in that phase shown | ⏳ Pending | |
| CO-TASK-015 | Filter by assignee | 1. Select assignee | Only tasks assigned to them shown | ⏳ Pending | |
| CO-TASK-016 | Search tasks | 1. Enter search term<br>2. Search | Matching tasks displayed | ⏳ Pending | |

---

## 🤖 Test 5: AI FEATURES (MULTI-TENANT)

### 5.1 AI Configuration
| Test ID | Test Case | Steps | Expected Result | Status | Notes |
|---------|-----------|-------|----------------|--------|-------|
| AI-CONF-001 | Company without AI key | 1. Login to company without AI key<br>2. Try AI features | Message: "AI not enabled, contact admin" | ⏳ Pending | |
| AI-CONF-002 | Add AI key to company | 1. Admin edits company<br>2. Adds AI key<br>3. Saves | AI enabled for company | ⏳ Pending | |
| AI-CONF-003 | AI key decryption | 1. Admin adds AI key<br>2. Saves<br>3. Edits again | AI key visible (decrypted) in form | ⏳ Pending | CRITICAL |
| AI-CONF-004 | AI key encryption in DB | 1. Add AI key<br>2. Check database | Key stored as base64 (encrypted) | ⏳ Pending | |

### 5.2 AI Chat (ApliChat)
| Test ID | Test Case | Steps | Expected Result | Status | Notes |
|---------|-----------|-------|----------------|--------|-------|
| AI-CHAT-001 | Access AI chat | 1. Click ApliChat icon | Chat panel opens, NO 401 errors | ⏳ Pending | CRITICAL |
| AI-CHAT-002 | Send message - company context | 1. Send: "Tell me about our company"<br>2. Review response | Uses actual company name, not "Apliman" | ⏳ Pending | CRITICAL |
| AI-CHAT-003 | Chat with knowledge sources | 1. Add company knowledge source<br>2. Chat about company info | AI uses knowledge source data | ⏳ Pending | |
| AI-CHAT-004 | Chat - mention user with @ | 1. Type "@" in chat<br>2. Select user<br>3. Send | User mentioned, context aware | ⏳ Pending | |
| AI-CHAT-005 | Chat - reference task with / | 1. Type "/" in chat<br>2. Select task<br>3. Send | Task referenced, context aware | ⏳ Pending | |
| AI-CHAT-006 | Chat history persistence | 1. Send messages<br>2. Close chat<br>3. Reopen | Previous messages displayed | ⏳ Pending | |
| AI-CHAT-007 | Deep analysis mode | 1. Enable deep analysis<br>2. Ask question | Detailed, comprehensive response | ⏳ Pending | |

### 5.3 AI Task Generation
| Test ID | Test Case | Steps | Expected Result | Status | Notes |
|---------|-----------|-------|----------------|--------|-------|
| AI-TASK-001 | Generate task description | 1. Create task<br>2. Enter title<br>3. Click AI generate description | Description generated | ⏳ Pending | CRITICAL |
| AI-TASK-002 | Generate task goals | 1. Create task<br>2. Enter title<br>3. Click AI generate goals | Goals generated | ⏳ Pending | CRITICAL |
| AI-TASK-003 | AI priority analysis | 1. Create task with desc<br>2. AI analyzes | Priority suggested | ⏳ Pending | |
| AI-TASK-004 | Auto-detect task type | 1. Create task<br>2. Enter title/desc | Task type detected (Marketing/Design/etc) | ⏳ Pending | |
| AI-TASK-005 | Auto-generate subtasks | 1. Create task with full details<br>2. Save | Subtasks auto-generated by AI | ⏳ Pending | CRITICAL |
| AI-TASK-006 | AI uses company name in tasks | 1. Generate AI content<br>2. Review description/goals | Uses actual company name, not generic | ⏳ Pending | CRITICAL |

### 5.4 AI Error Handling
| Test ID | Test Case | Steps | Expected Result | Status | Notes |
|---------|-----------|-------|----------------|--------|-------|
| AI-ERR-001 | Invalid AI key | 1. Add invalid AI key<br>2. Try AI features | Error message displayed | ⏳ Pending | |
| AI-ERR-002 | AI service timeout | 1. AI service down<br>2. Try AI features | Graceful error, fallback response | ⏳ Pending | |
| AI-ERR-003 | API quota exceeded | 1. Exceed Google API quota<br>2. Try AI features | Error message about quota | ⏳ Pending | |

---

## 🔒 Test 6: MULTI-TENANT ISOLATION

### 6.1 Data Isolation
| Test ID | Test Case | Steps | Expected Result | Status | Notes |
|---------|-----------|-------|----------------|--------|-------|
| MT-ISO-001 | Tasks isolation | 1. Login to Company A<br>2. View tasks<br>3. Login to Company B<br>4. View tasks | Each company sees only their tasks | ⏳ Pending | CRITICAL |
| MT-ISO-002 | Users isolation | 1. Login to Company A<br>2. View users<br>3. Login to Company B<br>4. View users | Each company sees only their users | ⏳ Pending | CRITICAL |
| MT-ISO-003 | Workflows isolation | 1. Login to Company A<br>2. View workflows<br>3. Login to Company B<br>4. View workflows | Each company sees only their workflows | ⏳ Pending | CRITICAL |
| MT-ISO-004 | Analytics isolation | 1. Login to Company A<br>2. View analytics<br>3. Login to Company B<br>4. View analytics | Each company sees only their data | ⏳ Pending | CRITICAL |
| MT-ISO-005 | Knowledge sources isolation | 1. Login to Company A<br>2. View knowledge sources<br>3. Login to Company B<br>4. View knowledge sources | Each company sees only their sources | ⏳ Pending | CRITICAL |
| MT-ISO-006 | Chat history isolation | 1. Login to Company A<br>2. Chat with AI<br>3. Login to Company B<br>4. View chat | No chat history from Company A | ⏳ Pending | CRITICAL |

### 6.2 AI Multi-Tenancy
| Test ID | Test Case | Steps | Expected Result | Status | Notes |
|---------|-----------|-------|----------------|--------|-------|
| MT-AI-001 | AI uses company-specific API key | 1. Company A has Key1<br>2. Company B has Key2<br>3. Both use AI | Each uses their own key | ⏳ Pending | CRITICAL |
| MT-AI-002 | AI uses company name in responses | 1. Company A chats: "Tell me about our company"<br>2. Company B chats same | Each gets their own company name | ⏳ Pending | CRITICAL |
| MT-AI-003 | AI knowledge sources per company | 1. Company A adds knowledge source<br>2. Company B uses AI | Company B AI doesn't see Company A's sources | ⏳ Pending | CRITICAL |
| MT-AI-004 | AI @ mentions only company users | 1. Company A: type "@"<br>2. Review user list | Only Company A users shown | ⏳ Pending | CRITICAL |
| MT-AI-005 | AI / references only company tasks | 1. Company A: type "/"<br>2. Review task list | Only Company A tasks shown | ⏳ Pending | CRITICAL |
| MT-AI-006 | AI generates tasks with company context | 1. Company A generates task<br>2. Company B generates task | Each uses their own company data | ⏳ Pending | CRITICAL |

### 6.3 Cross-Tenant Prevention
| Test ID | Test Case | Steps | Expected Result | Status | Notes |
|---------|-----------|-------|----------------|--------|-------|
| MT-XTN-001 | Cannot access other company's tasks | 1. Get task ID from Company A<br>2. Login to Company B<br>3. Try to access that task ID via URL | 403 Forbidden or 404 Not Found | ⏳ Pending | CRITICAL |
| MT-XTN-002 | Cannot assign task to other company user | 1. Login to Company A<br>2. Try to assign task to Company B user | User not in assignee list | ⏳ Pending | CRITICAL |
| MT-XTN-003 | Cannot edit other company's workflow | 1. Get workflow ID from Company A<br>2. Login to Company B<br>3. Try to edit via API | 403 Forbidden | ⏳ Pending | CRITICAL |

---

## 🔐 Test 7: ROLE-BASED ACCESS CONTROL (RBAC)

### 7.1 COMPANY_ADMIN Role
| Test ID | Test Case | Steps | Expected Result | Status | Notes |
|---------|-----------|-------|----------------|--------|-------|
| RBAC-CA-001 | Full workflow access | 1. Login as COMPANY_ADMIN<br>2. Access workflows | Can create, edit, delete | ⏳ Pending | CRITICAL |
| RBAC-CA-002 | Full analytics access | 1. Login as COMPANY_ADMIN<br>2. Access analytics | Can view all 3 tabs | ⏳ Pending | CRITICAL |
| RBAC-CA-003 | Full user management | 1. Login as COMPANY_ADMIN<br>2. Access users | Can add, edit, delete users | ⏳ Pending | CRITICAL |
| RBAC-CA-004 | Can manage company settings | 1. Login as COMPANY_ADMIN<br>2. View company info | Can see company name, settings | ⏳ Pending | |
| RBAC-CA-005 | Cannot access admin portal | 1. Login as COMPANY_ADMIN<br>2. Try to access `/admin/companies` | 403 Forbidden | ⏳ Pending | |

### 7.2 ADMIN Role (not Company Admin)
| Test ID | Test Case | Steps | Expected Result | Status | Notes |
|---------|-----------|-------|----------------|--------|-------|
| RBAC-AD-001 | Can manage workflows | 1. Login as ADMIN<br>2. Access workflows | Can create, edit, delete | ⏳ Pending | |
| RBAC-AD-002 | Can view team analytics | 1. Login as ADMIN<br>2. Access analytics | Can view dashboard, team, tasks | ⏳ Pending | |
| RBAC-AD-003 | Limited user management | 1. Login as ADMIN<br>2. Access users | Can view, may have limited edit | ⏳ Pending | |

### 7.3 EMPLOYEE Role
| Test ID | Test Case | Steps | Expected Result | Status | Notes |
|---------|-----------|-------|----------------|--------|-------|
| RBAC-EMP-001 | Can view tasks | 1. Login as EMPLOYEE<br>2. Access tasks | Can view tasks | ⏳ Pending | |
| RBAC-EMP-002 | Can manage assigned tasks | 1. Login as EMPLOYEE<br>2. View assigned task<br>3. Update status | Can update own tasks | ⏳ Pending | |
| RBAC-EMP-003 | Can view own analytics | 1. Login as EMPLOYEE<br>2. Access User Analytics | Can view personal stats | ⏳ Pending | |
| RBAC-EMP-004 | Cannot access team analytics | 1. Login as EMPLOYEE<br>2. Try to access Team Analytics | 403 Forbidden or tabs hidden | ⏳ Pending | |
| RBAC-EMP-005 | Cannot manage workflows | 1. Login as EMPLOYEE<br>2. Try to create workflow | No create button or 403 Forbidden | ⏳ Pending | |
| RBAC-EMP-006 | Cannot manage users | 1. Login as EMPLOYEE<br>2. Try to access Users page | Cannot add/edit users | ⏳ Pending | |

---

## 🌐 Test 8: FRONTEND & UI

### 8.1 Responsive Design
| Test ID | Test Case | Steps | Expected Result | Status | Notes |
|---------|-----------|-------|----------------|--------|-------|
| UI-RESP-001 | Mobile view | 1. Resize to mobile<br>2. Navigate pages | UI adapts, mobile menu works | ⏳ Pending | |
| UI-RESP-002 | Tablet view | 1. Resize to tablet<br>2. Navigate pages | UI adapts properly | ⏳ Pending | |
| UI-RESP-003 | Desktop view | 1. Full screen<br>2. Navigate pages | Optimal layout | ⏳ Pending | |

### 8.2 Navigation
| Test ID | Test Case | Steps | Expected Result | Status | Notes |
|---------|-----------|-------|----------------|--------|-------|
| UI-NAV-001 | Sidebar navigation | 1. Click all menu items | Navigation works, active state correct | ⏳ Pending | |
| UI-NAV-002 | Breadcrumbs | 1. Navigate deep pages | Breadcrumbs display correct path | ⏳ Pending | |
| UI-NAV-003 | Back button | 1. Navigate pages<br>2. Use browser back | Navigation history works | ⏳ Pending | |

### 8.3 Notifications
| Test ID | Test Case | Steps | Expected Result | Status | Notes |
|---------|-----------|-------|----------------|--------|-------|
| UI-NOTIF-001 | View notifications | 1. Click notification bell | Notifications panel opens | ⏳ Pending | |
| UI-NOTIF-002 | Unread count | 1. Generate notification<br>2. Check bell icon | Unread count displayed | ⏳ Pending | |
| UI-NOTIF-003 | Mark as read | 1. Click notification | Marked as read, count updates | ⏳ Pending | |
| UI-NOTIF-004 | Mark all as read | 1. Click "Mark all as read" | All marked as read | ⏳ Pending | |

### 8.4 Real-Time Features
| Test ID | Test Case | Steps | Expected Result | Status | Notes |
|---------|-----------|-------|----------------|--------|-------|
| UI-RT-001 | Online users count | 1. Login<br>2. Check header | Online users count displayed | ⏳ Pending | |
| UI-RT-002 | User presence | 1. Login from 2 browsers<br>2. Check presence | Both show as online | ⏳ Pending | |

---

## ⚡ Test 9: PERFORMANCE & ERROR HANDLING

### 9.1 Performance
| Test ID | Test Case | Steps | Expected Result | Status | Notes |
|---------|-----------|-------|----------------|--------|-------|
| PERF-001 | Initial load time | 1. Clear cache<br>2. Load app | Loads within 5 seconds | ⏳ Pending | |
| PERF-002 | API response time | 1. Make API calls<br>2. Measure | Responses within 2 seconds | ⏳ Pending | |
| PERF-003 | AI response time | 1. Use AI features<br>2. Measure | Responses within 10 seconds | ⏳ Pending | |
| PERF-004 | Large data sets | 1. Create 100+ tasks<br>2. Load task list | Pagination works, loads fast | ⏳ Pending | |

### 9.2 Error Handling
| Test ID | Test Case | Steps | Expected Result | Status | Notes |
|---------|-----------|-------|----------------|--------|-------|
| ERR-001 | Network error | 1. Disconnect network<br>2. Try action | User-friendly error message | ⏳ Pending | |
| ERR-002 | Server error (500) | 1. Trigger 500 error | Error message displayed | ⏳ Pending | |
| ERR-003 | Validation errors | 1. Submit form with invalid data | Validation errors shown | ⏳ Pending | |
| ERR-004 | Session timeout | 1. Wait for token expiry<br>2. Make request | Redirected to login | ⏳ Pending | |
| ERR-005 | Duplicate actions | 1. Double-click submit | Prevents duplicate submission | ⏳ Pending | |

---

## 📊 TEST EXECUTION SUMMARY

**Total Test Cases:** 150+  
**Status:**
- ⏳ Pending: [Count]
- ✅ Passed: [Count]
- ❌ Failed: [Count]
- ⚠️ Blocked: [Count]

---

## 🎯 CRITICAL TEST PATHS (Priority 1)

1. **Authentication Flow**: SA-AUTH-001, CO-AUTH-001, CO-AUTH-002
2. **Token Handling**: CO-AUTH-002 (MOST CRITICAL)
3. **COMPANY_ADMIN Permissions**: RBAC-CA-001, RBAC-CA-002, RBAC-CA-003
4. **AI Key Management**: AI-CONF-003, AI-CONF-004
5. **AI Multi-Tenancy**: MT-AI-001, MT-AI-002, MT-AI-006
6. **Data Isolation**: MT-ISO-001 through MT-ISO-006
7. **AI Features**: AI-CHAT-001, AI-TASK-001, AI-TASK-005

---

## 📝 NOTES

- All tests assume production environment (Render)
- Tests should be executed in order per section
- Critical tests marked with "CRITICAL" in notes
- Failed tests should be documented with screenshots
- All 401 errors in console should be considered failures


