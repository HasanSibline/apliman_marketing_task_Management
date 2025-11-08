# 🧪 Multi-Tenancy Testing Guide

## 🚀 Quick Start - Access Super Admin

### **Step 1: Run Database Migration**

First, you need to run the migration to set up the multi-tenant structure:

```bash
# Navigate to backend folder
cd backend

# Run Prisma migration (creates Company tables)
npx prisma migrate dev --name add_multi_tenancy

# Run data migration script (creates default "Apliman" company)
npx ts-node prisma/migrate-to-multi-tenant.ts
```

**What this does:**
- ✅ Creates Company, CompanySettings, SubscriptionHistory tables
- ✅ Adds companyId to all existing tables
- ✅ Creates default "Apliman" company
- ✅ Assigns all existing data to Apliman
- ✅ Creates or designates a Super Admin

---

### **Step 2: Get Your Super Admin Credentials**

After migration, you'll have one of these scenarios:

#### **Scenario A: New Super Admin Created**
If no SUPER_ADMIN existed, the script creates:
- **Email:** `admin@system.com`
- **Password:** `AdminPassword123!`
- ⚠️ **CHANGE THIS PASSWORD IMMEDIATELY!**

#### **Scenario B: Existing Admin Promoted**
If you already had a SUPER_ADMIN user, that user is now the system admin.
Use your existing credentials.

---

### **Step 3: Login as Super Admin**

1. **Start your servers:**
```bash
# Terminal 1 - Backend
cd backend
npm run start:dev

# Terminal 2 - Frontend
cd frontend
npm run dev

# Terminal 3 - AI Service (optional)
cd ai-service
python start.py
```

2. **Access the login page:**
   - Go to: `http://localhost:5173/login` (or your frontend URL)

3. **Login with Super Admin credentials:**
   - Email: `admin@system.com` (or your existing admin email)
   - Password: `AdminPassword123!` (or your existing password)

---

### **Step 4: Access Companies Management**

Once logged in as Super Admin, you'll see a new menu item:

1. **Look at the sidebar** - You should see "**Companies**" menu item with a building icon 🏢
2. **Click on "Companies"** - This takes you to: `/super-admin/companies`
3. **You should see:**
   - Companies dashboard with statistics
   - List of existing companies (at least "Apliman")
   - "Create Company" button

---

## 📋 Testing Checklist

### ✅ **Test 1: View Companies Dashboard**

**Expected Results:**
- [ ] See "Apliman" company listed
- [ ] See statistics: Total Companies, Active, Trial, Suspended
- [ ] See company details: logo, plan, status, users count, tasks count
- [ ] See "Create Company" button

**API Endpoint:**
```bash
GET http://localhost:3000/companies
Headers: Authorization: Bearer YOUR_JWT_TOKEN
```

---

### ✅ **Test 2: Create a New Company**

1. **Click "Create Company" button**
2. **Fill out the 4-step wizard:**

#### **Step 1 - Company Info:**
- **Company Name:** Test Company
- **Slug:** test-company (auto-generated)
- **Primary Color:** Choose any color
- **Logo URL:** (optional) Leave blank or add a URL

#### **Step 2 - Admin Account:**
- **Admin Name:** Test Admin
- **Admin Email:** admin@testcompany.com
- **Admin Password:** TestPassword123!

#### **Step 3 - Subscription:**
- **Plan:** PRO
- **Duration:** 30 days
- **Billing Email:** (optional)

#### **Step 4 - AI & Limits:**
- **AI API Key:** (optional) Your Gemini API key
- **AI Provider:** Gemini
- **Max Users:** 50
- **Max Tasks:** 5000
- **Max Storage:** 10 GB

3. **Click "Create Company"**

**Expected Results:**
- [ ] Success message
- [ ] Redirected to companies list
- [ ] New company appears in the list

**API Endpoint:**
```bash
POST http://localhost:3000/companies
Headers: Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json

{
  "name": "Test Company",
  "slug": "test-company",
  "primaryColor": "#3B82F6",
  "adminName": "Test Admin",
  "adminEmail": "admin@testcompany.com",
  "adminPassword": "TestPassword123!",
  "subscriptionPlan": "PRO",
  "subscriptionDays": 30,
  "aiApiKey": "YOUR_GEMINI_KEY",
  "aiProvider": "gemini",
  "maxUsers": 50,
  "maxTasks": 5000,
  "maxStorage": 10
}
```

---

### ✅ **Test 3: View Company Details**

1. **Click "View" on any company**
2. **You should see:**
   - Company statistics (users, tasks, AI usage)
   - Subscription details (plan, status, expiry)
   - AI configuration
   - Resource limits
   - Action buttons

**Expected Results:**
- [ ] All statistics display correctly
- [ ] Subscription status shows
- [ ] AI status shows (enabled/disabled)
- [ ] Can see "Extend Subscription" button
- [ ] Can see "Reset Admin Password" button
- [ ] Can see "Suspend" or "Reactivate" button

**API Endpoint:**
```bash
GET http://localhost:3000/companies/{company_id}
Headers: Authorization: Bearer YOUR_JWT_TOKEN
```

---

### ✅ **Test 4: Test Data Isolation**

This is the **MOST IMPORTANT TEST** - verifying that companies can't see each other's data!

#### **Part A: Login as Company Admin**

1. **Logout from Super Admin**
2. **Login as the new company admin:**
   - Email: `admin@testcompany.com`
   - Password: `TestPassword123!`

3. **Expected Results:**
   - [ ] Login successful
   - [ ] **NO "Companies" menu item** (only Super Admin sees this)
   - [ ] Dashboard shows **EMPTY** data (new company has no tasks)
   - [ ] Tasks page shows **NO tasks**
   - [ ] Users page shows **ONLY** the admin user

#### **Part B: Create Test Data**

1. **Create a workflow** (if needed)
2. **Create a test task:**
   - Title: "Test Company Task"
   - Description: "This belongs to Test Company"

3. **Expected Results:**
   - [ ] Task created successfully
   - [ ] Task appears in tasks list

#### **Part C: Switch Back to Apliman Company**

1. **Logout from Test Company admin**
2. **Login as Apliman user** (use your original credentials)

3. **Expected Results:**
   - [ ] Can see **ONLY Apliman tasks** (not Test Company tasks)
   - [ ] Can see **ONLY Apliman users**
   - [ ] **CANNOT see** "Test Company Task"

#### **Part D: Super Admin View**

1. **Logout and login as Super Admin**
2. **Go to Dashboard and Tasks**

3. **Expected Results:**
   - [ ] Super Admin can see **ALL companies' tasks** (or none, depending on implementation)
   - [ ] Statistics reflect all companies

**This proves data isolation is working! 🎉**

---

### ✅ **Test 5: Extend Subscription**

1. **As Super Admin, go to Company Details**
2. **Click "Extend Subscription"**
3. **Enter:** 60 days
4. **Click "Extend"**

**Expected Results:**
- [ ] Success message
- [ ] Subscription end date updated
- [ ] "Days Remaining" increased

**API Endpoint:**
```bash
PATCH http://localhost:3000/companies/{company_id}/extend-subscription
Headers: Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json

{
  "days": 60
}
```

---

### ✅ **Test 6: Reset Admin Password**

1. **As Super Admin, go to Company Details**
2. **Click "Reset Admin Password"**
3. **Enter new password:** NewPassword123!
4. **Click "Reset Password"**

**Expected Results:**
- [ ] Success message
- [ ] Can logout and login as company admin with new password

**API Endpoint:**
```bash
POST http://localhost:3000/companies/{company_id}/reset-password
Headers: Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json

{
  "newPassword": "NewPassword123!"
}
```

---

### ✅ **Test 7: Suspend Company**

1. **As Super Admin, go to Company Details**
2. **Click "Suspend"**
3. **Confirm suspension**

**Expected Results:**
- [ ] Company status changes to "SUSPENDED"
- [ ] Badge shows "SUSPENDED"
- [ ] Button changes to "Reactivate"

4. **Try to login as suspended company admin**

**Expected Results:**
- [ ] **Login BLOCKED**
- [ ] Error: "Company account is suspended or inactive"

5. **Reactivate the company**

**Expected Results:**
- [ ] Company status changes to "ACTIVE"
- [ ] Can login again

**API Endpoints:**
```bash
# Suspend
PATCH http://localhost:3000/companies/{company_id}/suspend
Headers: Authorization: Bearer YOUR_JWT_TOKEN

# Reactivate
PATCH http://localhost:3000/companies/{company_id}/reactivate
Headers: Authorization: Bearer YOUR_JWT_TOKEN
```

---

### ✅ **Test 8: AI Per Company**

#### **Test with Company API Key:**

1. **Create company with AI API key**
2. **Login as that company's user**
3. **Create a task** (AI will generate description/goals)

**Expected Results:**
- [ ] AI uses company's API key
- [ ] AI usage tracked in company statistics

#### **Test without API Key:**

1. **Create company WITHOUT AI API key**
2. **Login as that company's user**
3. **Create a task**

**Expected Results:**
- [ ] Falls back to system default API key
- [ ] Still works (if system key exists)

---

### ✅ **Test 9: Duplicate Email Across Companies**

**This tests the compound unique constraint:**

1. **Create Company A with admin:** admin@test.com
2. **Create Company B with admin:** admin@test.com (same email!)

**Expected Results:**
- [ ] **BOTH companies created successfully**
- [ ] Same email can exist in different companies
- [ ] Each admin can only see their company's data

---

### ✅ **Test 10: Frontend Features**

#### **Navigation:**
- [ ] Super Admin sees "Companies" menu item
- [ ] Regular admins DON'T see "Companies" menu
- [ ] Employees DON'T see "Companies" menu

#### **Dashboard:**
- [ ] Statistics cards display correctly
- [ ] Companies list loads
- [ ] Search and filters work (if implemented)

#### **Create Company Wizard:**
- [ ] Progress indicator works
- [ ] Can navigate between steps
- [ ] Auto-slug generation works
- [ ] Color picker works
- [ ] Form validation works
- [ ] Creates company successfully

#### **Company Details:**
- [ ] All statistics display
- [ ] Modals work (reset password, extend subscription)
- [ ] Actions work (suspend, reactivate)
- [ ] Loading states show
- [ ] Error handling works

---

## 🐛 Common Issues & Solutions

### **Issue 1: "No Companies" menu item**

**Cause:** User is not Super Admin

**Solution:**
```sql
-- Check user role
SELECT id, email, role, companyId FROM User WHERE email = 'your@email.com';

-- Update to Super Admin
UPDATE User SET role = 'SUPER_ADMIN', companyId = NULL WHERE email = 'your@email.com';
```

---

### **Issue 2: "Company account is suspended"**

**Cause:** Company is suspended or subscription expired

**Solution:**
```sql
-- Check company status
SELECT id, name, isActive, subscriptionStatus FROM Company WHERE name = 'Your Company';

-- Reactivate company
UPDATE Company SET isActive = true, subscriptionStatus = 'ACTIVE' WHERE name = 'Your Company';
```

---

### **Issue 3: Can see other companies' data**

**Cause:** Data isolation not working

**Solution:**
1. Check that migration ran successfully
2. Verify all users have `companyId`
3. Verify all tasks have `companyId`
4. Check backend service filters

```sql
-- Verify data has companyId
SELECT COUNT(*) FROM User WHERE companyId IS NULL AND role != 'SUPER_ADMIN';
SELECT COUNT(*) FROM Task WHERE companyId IS NULL;
```

---

### **Issue 4: Migration fails**

**Cause:** Database connection or schema issues

**Solution:**
```bash
# Reset and try again
npx prisma migrate reset
npx prisma migrate dev --name add_multi_tenancy
npx ts-node prisma/migrate-to-multi-tenant.ts
```

---

## 📊 Testing Results Template

Copy this and fill it out as you test:

```
MULTI-TENANCY TESTING RESULTS
=============================

Date: ___________
Tester: ___________

✅ = Pass | ❌ = Fail | ⏭️ = Skipped

[ ] Test 1: View Companies Dashboard
[ ] Test 2: Create New Company
[ ] Test 3: View Company Details
[ ] Test 4: Data Isolation (CRITICAL!)
[ ] Test 5: Extend Subscription
[ ] Test 6: Reset Admin Password
[ ] Test 7: Suspend/Reactivate Company
[ ] Test 8: AI Per Company
[ ] Test 9: Duplicate Email Across Companies
[ ] Test 10: Frontend Features

Issues Found:
_____________________________________________
_____________________________________________
_____________________________________________

Overall Status: [ ] PASS | [ ] FAIL
```

---

## 🎯 Quick Access URLs

After starting your servers:

- **Frontend:** http://localhost:5173
- **Login:** http://localhost:5173/login
- **Super Admin Dashboard:** http://localhost:5173/super-admin/companies
- **Backend API:** http://localhost:3000
- **Prisma Studio:** `npx prisma studio` (database viewer)

---

## 🔑 Test Credentials Summary

### **Super Admin (System):**
- Email: `admin@system.com`
- Password: `AdminPassword123!`
- Company: None (can see all)

### **Apliman Company Admin:**
- Email: Your existing admin email
- Password: Your existing password
- Company: Apliman

### **Test Company Admin:**
- Email: `admin@testcompany.com`
- Password: `TestPassword123!`
- Company: Test Company

---

## 📝 Notes

1. **Always test data isolation** - This is the most critical feature
2. **Test with multiple companies** - Create at least 2-3 test companies
3. **Test with different user roles** - Super Admin, Company Admin, Admin, Employee
4. **Test edge cases** - Expired subscriptions, suspended companies, etc.
5. **Monitor console logs** - Check for any errors or warnings

---

**Ready to test? Start with Step 1 and work your way through! 🚀**

