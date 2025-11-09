# 🎯 **MULTI-TENANT SLUG-BASED LOGIN - IMPLEMENTATION GUIDE**

## 📋 **SUMMARY OF CHANGES**

### **What Changed?**

1. ✅ **Each company now has a unique branded login page**
2. ✅ **URLs are slug-based**: `your-domain.com/{company-slug}/login`
3. ✅ **Dynamic branding**: Each company sees their logo, colors, and name
4. ✅ **System Admin portal remains separate**: `/admin/login`
5. ✅ **Fixed redirect issues**: Admin login failures stay on admin page

---

## 🔗 **NEW URL STRUCTURE**

| Portal | Old URL | New URL |
|--------|---------|---------|
| **System Admin** | `/admin/login` | `/admin/login` ✅ (unchanged) |
| **Apliman Company** | `/login` | `/apliman/login` 🆕 |
| **Future Company (Microsoft)** | N/A | `/microsoft/login` 🆕 |
| **Future Company (Google)** | N/A | `/google/login` 🆕 |

### **Legacy Support**
- `/login` → Automatically redirects to `/apliman/login`

---

## 🎨 **BRANDING FEATURES**

Each company login page shows:
- ✅ **Company Logo** (or first letter if no logo)
- ✅ **Company Name** in header
- ✅ **Primary Color** for buttons and accents
- ✅ **Custom Background Gradient** based on primary color
- ✅ **Subscription Status** validation (blocks expired/suspended companies)

---

## 🏗️ **TECHNICAL IMPLEMENTATION**

### **Backend Changes**

#### **1. New Public API Endpoint**
```typescript
GET /api/public/companies/by-slug/:slug
```

**Response:**
```json
{
  "id": "company-uuid",
  "name": "Apliman",
  "slug": "apliman",
  "logo": "https://cloudflare.com/apliman-logo.webp",
  "primaryColor": "#4F46E5",
  "isActive": true,
  "subscriptionStatus": "ACTIVE"
}
```

**Files Modified:**
- `backend/src/companies/public-companies.controller.ts` (new)
- `backend/src/companies/companies.service.ts` (added `getCompanyBySlug` method)
- `backend/src/companies/companies.module.ts` (registered public controller)

#### **2. @Public Decorator**
- Uses existing `@Public()` decorator to bypass JWT authentication
- Already supported by `JwtAuthGuard`

---

### **Frontend Changes**

#### **1. New CompanyLogin Component**
**File:** `frontend/src/pages/CompanyLogin.tsx`

**Features:**
- Fetches company branding on mount via slug
- Validates company status (active, subscription not expired)
- Dynamic UI based on company colors
- Prevents System Admins from logging in via company portal
- Ensures user belongs to the company they're trying to access

**Key Logic:**
```typescript
// 1. Extract slug from URL
const { slug } = useParams();

// 2. Fetch company branding
const response = await api.get(`/public/companies/by-slug/${slug}`);

// 3. Validate company
if (!company.isActive || company.subscriptionStatus === 'EXPIRED') {
  // Show error
}

// 4. After login, verify user belongs to this company
if (user.companyId !== company.id) {
  setError('Your account is not associated with this company.');
}
```

#### **2. Updated Routing**
**File:** `frontend/src/App.tsx`

**Changes:**
```typescript
// OLD
<Route path="/login" element={<LoginPage />} />

// NEW
<Route path="/:slug/login" element={<CompanyLogin />} />
<Route path="/login" element={<Navigate to="/apliman/login" replace />} />
```

#### **3. Updated CompanyRoute Guard**
**File:** `frontend/src/components/auth/CompanyRoute.tsx`

**Changes:**
- Redirects unauthenticated users to `/apliman/login` (default)
- No longer redirects to `/login`

#### **4. Updated AdminLogin**
**File:** `frontend/src/pages/AdminLogin.tsx`

**Changes:**
- Link to company portal now points to `/apliman/login`
- Error handling remains on admin page (no redirects)

---

## 🧪 **TESTING GUIDE**

### **Test Scenario 1: System Admin Login**

**Steps:**
1. Go to: `https://your-domain.com/admin/login`
2. Enter:
   - Email: `superadmin@apliman.com`
   - Password: `SuperAdmin123!` (or from `SUPER_ADMIN_PASSWORD` env var)
3. Click "Sign In"

**Expected Result:**
- ✅ Redirected to `/admin/companies`
- ✅ See list of all companies
- ✅ Purple admin portal UI

**Test Failed Login:**
1. Enter wrong password
2. Click "Sign In"

**Expected Result:**
- ✅ Error message shown on admin page
- ✅ **NOT** redirected to company portal
- ✅ Stays on `/admin/login`

---

### **Test Scenario 2: Apliman Company Login**

**Steps:**
1. Go to: `https://your-domain.com/apliman/login`
2. You should see:
   - ✅ Apliman logo
   - ✅ "Apliman" company name
   - ✅ Blue/indigo branding
3. Enter valid Apliman user credentials
4. Click "Sign in"

**Expected Result:**
- ✅ Redirected to `/dashboard`
- ✅ See Apliman's tasks, users, etc.
- ✅ Regular company portal UI

**Test Failed Login:**
1. Enter wrong password

**Expected Result:**
- ✅ Error message shown on login page
- ✅ Stays on `/apliman/login`
- ✅ Can retry login

---

### **Test Scenario 3: Legacy URL Redirect**

**Steps:**
1. Go to: `https://your-domain.com/login`

**Expected Result:**
- ✅ Automatically redirected to `/apliman/login`
- ✅ See Apliman branded login page

---

### **Test Scenario 4: Invalid Company Slug**

**Steps:**
1. Go to: `https://your-domain.com/nonexistent/login`

**Expected Result:**
- ✅ Error page: "Company not found"
- ✅ Suggestion: "Are you a System Administrator? Click here"

---

### **Test Scenario 5: Suspended/Expired Company**

**Steps:**
1. As System Admin, suspend Apliman company
2. Go to: `https://your-domain.com/apliman/login`

**Expected Result:**
- ✅ Error: "This company account has been deactivated"
- ✅ No login form shown

---

### **Test Scenario 6: Cross-Company Login Attempt**

**Setup:**
1. Create second company "Microsoft" with slug `microsoft`
2. Create user: `user@microsoft.com` in Microsoft company

**Steps:**
1. Go to: `https://your-domain.com/apliman/login`
2. Try to login with: `user@microsoft.com`

**Expected Result:**
- ✅ Login succeeds (credentials valid)
- ✅ But then shows error: "Your account is not associated with this company"
- ✅ Remains on `/apliman/login`

---

### **Test Scenario 7: System Admin Tries Company Login**

**Steps:**
1. Go to: `https://your-domain.com/apliman/login`
2. Try to login with: `superadmin@apliman.com`

**Expected Result:**
- ✅ Error: "System Administrators should login at /admin/login"
- ✅ Not allowed to access company portal

---

## 🔧 **HOW TO CREATE NEW COMPANIES**

### **Via System Admin Dashboard:**

1. Login as System Admin: `/admin/login`
2. Go to "Companies" page
3. Click "Create New Company"
4. Fill in:
   - **Company Name**: e.g., "Microsoft"
   - **Slug**: e.g., `microsoft` (lowercase, no spaces)
   - **Logo URL**: e.g., `https://logo.clearbit.com/microsoft.com`
   - **Primary Color**: e.g., `#00A4EF` (Microsoft blue)
   - **Admin Email**: e.g., `admin@microsoft.com`
   - **Admin Name**: e.g., "Microsoft Admin"
5. Click "Create Company"

**Result:**
- ✅ New company created
- ✅ New login URL available: `/microsoft/login`
- ✅ Admin user created with random password (check email or reset)

---

## 📱 **USER EXPERIENCE FLOW**

### **For Company Users:**

```
1. User receives email: "Visit https://your-domain.com/apliman/login"
2. User clicks link
3. Sees Apliman-branded login page
4. Enters credentials
5. Redirected to dashboard
6. Sees only Apliman's data
```

### **For System Admin:**

```
1. Admin goes to: https://your-domain.com/admin/login
2. Sees purple admin portal
3. Enters admin credentials
4. Redirected to companies list
5. Can manage all companies
6. Can view statistics (users count, tasks count, AI usage)
7. Cannot see actual company data (privacy)
```

---

## 🚀 **DEPLOYMENT STEPS**

### **1. Backend Deployment (Render)**

✅ No new environment variables needed
✅ Existing schema already has `slug` field in Company model
✅ Public endpoint works without authentication

**Verify:**
```bash
curl https://your-backend.onrender.com/api/public/companies/by-slug/apliman
```

**Expected Response:**
```json
{
  "id": "...",
  "name": "Apliman",
  "slug": "apliman",
  "logo": "...",
  "primaryColor": "#4F46E5",
  "isActive": true,
  "subscriptionStatus": "ACTIVE"
}
```

### **2. Frontend Deployment (Cloudflare Pages)**

✅ No new environment variables needed
✅ Routing automatically handles `/:slug/login` pattern

**Verify:**
1. Visit `https://your-domain.com/apliman/login`
2. Should see Apliman branded login
3. Visit `https://your-domain.com/admin/login`
4. Should see purple admin portal

---

## 🐛 **TROUBLESHOOTING**

### **Issue: "Company not found" error**

**Cause:** Slug doesn't match database

**Fix:**
1. Login as System Admin
2. Go to Companies page
3. Check the company's slug
4. Use correct slug in URL: `/{correct-slug}/login`

---

### **Issue: "Your account is not associated with this company"**

**Cause:** User logged in via wrong company portal

**Fix:**
1. Ensure user logs in via their company's URL
2. If user belongs to "Microsoft", use `/microsoft/login`
3. Not `/apliman/login`

---

### **Issue: Old `/login` URL not working**

**Cause:** Legacy redirect

**Fix:** 
- This is expected behavior
- `/login` now redirects to `/apliman/login`
- Update bookmarks and email templates

---

## 📊 **DATABASE VERIFICATION**

### **Check Company Slug:**

```sql
SELECT id, name, slug, "isActive", "subscriptionStatus" 
FROM companies;
```

**Expected Output:**
```
id  | name    | slug    | isActive | subscriptionStatus
----|---------|---------|----------|-------------------
... | Apliman | apliman | true     | ACTIVE
```

### **Update Company Branding:**

```sql
UPDATE companies 
SET 
  logo = 'https://cloudflare.com/new-logo.png',
  "primaryColor" = '#FF5733'
WHERE slug = 'apliman';
```

---

## ✅ **VERIFICATION CHECKLIST**

- [ ] System Admin can login at `/admin/login`
- [ ] System Admin login failures stay on admin page
- [ ] Apliman users can login at `/apliman/login`
- [ ] Apliman login shows correct logo and colors
- [ ] Invalid slug shows error page
- [ ] Suspended company shows error message
- [ ] `/login` redirects to `/apliman/login`
- [ ] Cross-company login is blocked
- [ ] System Admin cannot login via company portal
- [ ] Create new company → New URL automatically works

---

## 🎉 **SUCCESS CRITERIA**

Your implementation is successful when:

1. ✅ Each company has a unique branded login URL
2. ✅ System Admin portal remains completely separate
3. ✅ No redirects between portals (unless intentional)
4. ✅ Company branding is dynamic (logo, colors)
5. ✅ Security: Users can only access their own company
6. ✅ UX: Clear, professional, no confusion

---

## 📞 **SUPPORT**

If you encounter issues:

1. Check browser console for errors
2. Check backend logs on Render
3. Verify database: company slug exists and is active
4. Clear browser cache/localStorage
5. Try incognito mode

---

**Implementation Date:** November 9, 2025  
**Status:** ✅ **READY FOR TESTING**

