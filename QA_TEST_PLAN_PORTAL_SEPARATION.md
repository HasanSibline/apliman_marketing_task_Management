# 🧪 QA TEST PLAN - Portal Separation

**Test Date:** 2025-11-09  
**Tester:** QA Expert  
**System:** Multi-Tenant Task Management  
**Focus:** Admin vs Company Portal Separation

---

## 🎯 TEST OBJECTIVES

1. ✅ Verify System Admin can ONLY access Admin portal
2. ✅ Verify Company users can ONLY access Company portal
3. ✅ Verify proper redirects on wrong portal access
4. ✅ Verify authentication isolation
5. ✅ Verify no data leakage between portals

---

## 📋 TEST CASES

### **TEST SUITE 1: System Admin Login & Access**

#### **TC-1.1: System Admin Login via Admin Portal**
**Steps:**
1. Navigate to `/admin/login`
2. Enter credentials:
   - Email: `superadmin@apliman.com`
   - Password: `SuperAdmin123!`
3. Click "Sign In"

**Expected Result:**
- ✅ Login successful
- ✅ Redirect to `/admin/companies`
- ✅ See purple/indigo admin layout
- ✅ Sidebar shows: Companies, System Analytics, System Settings, Profile
- ✅ NO company-related menus (Dashboard, Tasks, etc.)

**Actual Result:** _____________________

---

#### **TC-1.2: System Admin Tries Company Login**
**Steps:**
1. Navigate to `/login` (Company portal login)
2. Enter System Admin credentials:
   - Email: `superadmin@apliman.com`
   - Password: `SuperAdmin123!`
3. Click "Sign In"

**Expected Result:**
- ❌ Login FAILS
- ❌ Error message: "System Administrators must use the admin portal at /admin/login"
- ✅ User stays on `/login` page

**Actual Result:** _____________________

---

#### **TC-1.3: System Admin Accesses Company Routes**
**Steps:**
1. Login as System Admin via `/admin/login`
2. Try to access company routes:
   - `/dashboard`
   - `/tasks`
   - `/users`
   - `/workflows`

**Expected Result:**
- ✅ All routes redirect to `/admin/companies`
- ✅ Console shows warning: "System Admins should use the admin portal"
- ✅ User never sees company portal

**Actual Result:** _____________________

---

### **TEST SUITE 2: Company User Login & Access**

#### **TC-2.1: Create Company Test User**
**Steps:**
1. Login as System Admin
2. Navigate to `/admin/companies`
3. Click on "Apliman" company
4. Create a test user via backend or seed:
   ```sql
   INSERT INTO users (id, email, name, password, role, companyId, position, status)
   VALUES (
     'test-user-id',
     'test@apliman.com',
     'Test User',
     '$2b$10$hashforTestPassword123!',  -- Hash for "TestPassword123!"
     'EMPLOYEE',
     '<apliman-company-id>',
     'Test Employee',
     'ACTIVE'
   );
   ```

**Expected Result:**
- ✅ Test user created with `companyId` = Apliman ID
- ✅ Role = EMPLOYEE (or ADMIN)
- ✅ Status = ACTIVE

**Actual Result:** _____________________

---

#### **TC-2.2: Company User Login via Company Portal**
**Steps:**
1. Navigate to `/login` (Company portal)
2. Enter test user credentials:
   - Email: `test@apliman.com`
   - Password: `TestPassword123!`
3. Click "Sign In"

**Expected Result:**
- ✅ Login successful
- ✅ Redirect to `/dashboard`
- ✅ See regular company layout
- ✅ Sidebar shows: Dashboard, Tasks, Workflows, Users, Analytics, Profile
- ✅ NO "Companies" menu item

**Actual Result:** _____________________

---

#### **TC-2.3: Company User Tries Admin Login**
**Steps:**
1. Navigate to `/admin/login`
2. Enter company user credentials:
   - Email: `test@apliman.com`
   - Password: `TestPassword123!`
3. Click "Sign In"

**Expected Result:**
- ❌ Login FAILS
- ❌ Error message: "Access denied. This portal is for System Administrators only"
- ✅ User stays on `/admin/login` page

**Actual Result:** _____________________

---

#### **TC-2.4: Company User Accesses Admin Routes**
**Steps:**
1. Login as company user via `/login`
2. Try to access admin routes:
   - `/admin/companies`
   - `/admin/companies/create`
   - `/admin/analytics`

**Expected Result:**
- ✅ All routes redirect to `/dashboard`
- ✅ Console shows warning: "Unauthorized admin route access attempt"
- ✅ User never sees admin portal

**Actual Result:** _____________________

---

### **TEST SUITE 3: Authentication State Management**

#### **TC-3.1: Logout from Admin Portal**
**Steps:**
1. Login as System Admin
2. Click "Logout" button
3. Verify redirect to `/admin/login`
4. Try accessing `/admin/companies` directly

**Expected Result:**
- ✅ Logout successful
- ✅ Token removed from localStorage
- ✅ Redirect to `/admin/login`
- ✅ Direct access to `/admin/companies` redirects to `/admin/login`

**Actual Result:** _____________________

---

#### **TC-3.2: Logout from Company Portal**
**Steps:**
1. Login as company user
2. Click "Logout" button
3. Verify redirect to `/login`
4. Try accessing `/dashboard` directly

**Expected Result:**
- ✅ Logout successful
- ✅ Token removed from localStorage
- ✅ Redirect to `/login`
- ✅ Direct access to `/dashboard` redirects to `/login`

**Actual Result:** _____________________

---

#### **TC-3.3: Token Expiration**
**Steps:**
1. Login as System Admin
2. Wait for token to expire (or manually delete token from localStorage)
3. Try to access any admin route

**Expected Result:**
- ✅ Redirect to `/admin/login`
- ✅ Appropriate error message

**Actual Result:** _____________________

---

### **TEST SUITE 4: Data Isolation**

#### **TC-4.1: System Admin Sees All Companies**
**Steps:**
1. Login as System Admin
2. Navigate to `/admin/companies`
3. View companies list

**Expected Result:**
- ✅ Can see Apliman company
- ✅ Can see all companies in the system
- ✅ Can view company statistics

**Actual Result:** _____________________

---

#### **TC-4.2: Company User Sees Only Their Data**
**Steps:**
1. Login as Apliman user
2. Navigate to `/tasks`
3. Create a task
4. Logout and login as System Admin
5. Check if System Admin can see the task

**Expected Result:**
- ✅ Apliman user can create task
- ✅ Task has `companyId` = Apliman
- ✅ System Admin CANNOT see individual tasks (isolated)
- ✅ System Admin can only see company-level statistics

**Actual Result:** _____________________

---

### **TEST SUITE 5: Edge Cases**

#### **TC-5.1: Direct URL Access While Not Authenticated**
**Steps:**
1. Clear all cookies/localStorage
2. Try accessing:
   - `/admin/companies` → Should redirect to `/admin/login`
   - `/dashboard` → Should redirect to `/login`
   - `/tasks` → Should redirect to `/login`

**Expected Result:**
- ✅ All protected routes redirect to appropriate login page
- ✅ Admin routes redirect to `/admin/login`
- ✅ Company routes redirect to `/login`

**Actual Result:** _____________________

---

#### **TC-5.2: Browser Back Button After Logout**
**Steps:**
1. Login as System Admin
2. Navigate through several pages
3. Logout
4. Press browser back button

**Expected Result:**
- ✅ Cannot access protected pages
- ✅ Redirect to login page
- ✅ No cached data visible

**Actual Result:** _____________________

---

#### **TC-5.3: Invalid Credentials**
**Steps:**
1. Try logging in with wrong password on both portals
2. Try logging in with non-existent email

**Expected Result:**
- ❌ Login fails
- ❌ Appropriate error message
- ✅ No sensitive information leaked

**Actual Result:** _____________________

---

## 🔍 SECURITY CHECKS

### **SEC-1: Token Validation**
- [ ] JWT includes correct `companyId`
- [ ] JWT includes correct `role`
- [ ] Token signature is valid
- [ ] Token cannot be tampered with

### **SEC-2: Route Protection**
- [ ] All admin routes protected by AdminRoute guard
- [ ] All company routes protected by CompanyRoute guard
- [ ] No unprotected routes exposing data

### **SEC-3: API Endpoint Protection**
- [ ] `/api/companies/*` requires SUPER_ADMIN role
- [ ] `/api/tasks` filters by companyId
- [ ] `/api/users` filters by companyId
- [ ] No data leakage between companies

---

## 🐛 KNOWN ISSUES

### **ISSUE-1: AdminLogin Component**
**Location:** `frontend/src/pages/AdminLogin.tsx:44`
**Problem:** Uses `window.location.reload()` after login
**Impact:** May cause unnecessary reload and flash
**Severity:** Low
**Recommendation:** Use proper state management instead

### **ISSUE-2: Potential Race Condition**
**Location:** Route guards
**Problem:** If auth state updates slowly, user might see flash of wrong portal
**Impact:** Poor UX
**Severity:** Low
**Recommendation:** Add loading state

---

## ✅ QA CHECKLIST

- [ ] All test cases executed
- [ ] All expected results match actual results
- [ ] No console errors during testing
- [ ] No data leakage observed
- [ ] Proper redirects working
- [ ] Error messages are user-friendly
- [ ] Security checks passed
- [ ] Performance is acceptable
- [ ] Mobile responsiveness checked

---

## 📊 TEST SUMMARY

**Total Test Cases:** 17  
**Passed:** _____  
**Failed:** _____  
**Blocked:** _____  
**Not Tested:** _____

**Severity Breakdown:**
- Critical: _____
- High: _____
- Medium: _____
- Low: _____

---

## 🎯 RECOMMENDATION

**Status:** ⏳ TESTING IN PROGRESS

**Next Steps:**
1. Execute all test cases
2. Document any failures
3. Create bug tickets for issues
4. Retest after fixes
5. Sign off when all critical/high issues resolved

---

**QA Sign-off:** _____________________  
**Date:** _____________________

