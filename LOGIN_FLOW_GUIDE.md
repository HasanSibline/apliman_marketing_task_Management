# 🔐 **LOGIN FLOW GUIDE - Multi-Tenant System**

## 📋 **Overview**

This system has **THREE** distinct login pages with different security levels and purposes.

---

## 🚪 **LOGIN PAGES**

### **1️⃣ Generic Company Login (DEFAULT)**

**URL:** `/login`

**Purpose:** Default login page for company users when slug is unknown

**Features:**
- ✅ **No logo displayed** (generic icon only)
- ✅ **No company branding** (neutral colors)
- ✅ **Blocks System Admins** (shows error message)
- ✅ **Requires company association** (user must have companyId)

**Who Can Use:**
- Company employees
- Company admins
- Any user with a valid companyId

**Who CANNOT Use:**
- System Administrators (SUPER_ADMIN)

**Security:**
- Default landing page (better UX)
- No company information leaked
- System Admin access denied

---

### **2️⃣ Company-Specific Login (BRANDED)**

**URL:** `/:slug/login` (e.g., `/apliman/login`, `/acme/login`)

**Purpose:** Branded login page for specific companies

**Features:**
- ✅ **Company logo displayed** (from database)
- ✅ **Company colors** (primaryColor applied)
- ✅ **Company name shown** (branding)
- ✅ **Subscription validation** (checks if active)

**Who Can Use:**
- Employees of that specific company
- Must have credentials for that company

**Who CANNOT Use:**
- System Administrators
- Users from other companies

**Security:**
- Validates company exists and is active
- Checks subscription status (ACTIVE/TRIAL)
- Blocks suspended/expired companies

---

### **3️⃣ System Admin Login (HIDDEN)**

**URL:** `/admin/login`

**Purpose:** Separate portal for System Administrator

**Features:**
- ⚠️ **Hidden from public** (no links to this page)
- ⚠️ **Direct URL access only** (security by obscurity)
- ⚠️ **Special credentials** (SUPER_ADMIN role)
- ⚠️ **No company association** (companyId = null)

**Who Can Use:**
- System Administrator ONLY
- Email: `superadmin@apliman.com`
- Role: `SUPER_ADMIN`

**Who CANNOT Use:**
- Company users (any role)
- Company admins

**Security:**
- No public links to this page
- Redirects company users to `/login`
- Separate authentication logic

---

## 🔀 **LOGIN FLOW DIAGRAM**

```
User visits site
     ↓
Default: /login (Generic - No Logo)
     ↓
   Enter email + password
     ↓
   ┌─────────────────┐
   │  Submit Form    │
   └─────────────────┘
          ↓
   ┌─────────────────────────────────────┐
   │  Backend: POST /auth/login          │
   │  - Validates credentials            │
   │  - Checks user role                 │
   │  - Checks companyId                 │
   └─────────────────────────────────────┘
          ↓
   ┌─────────────────────────────────────┐
   │  User Role Check:                   │
   │                                     │
   │  ✅ COMPANY_ADMIN/ADMIN/EMPLOYEE    │
   │     + has companyId                 │
   │     → Redirect to /dashboard        │
   │                                     │
   │  ❌ SUPER_ADMIN (companyId = null)  │
   │     → Error: "Use admin portal"     │
   │                                     │
   │  ❌ No companyId                    │
   │     → Error: "No company assigned"  │
   └─────────────────────────────────────┘
```

---

## 🎨 **BRANDING LOGIC**

### **Generic Login (`/login`)**

```typescript
// NO logo
<div className="h-16 w-16 bg-indigo-600">
  <BuildingIcon /> {/* Generic icon */}
</div>

// NO company name
<h2>Company Login</h2>

// Default colors
style={{ backgroundColor: '#4F46E5' }} // Indigo
```

---

### **Company Login (`/:slug/login`)**

```typescript
// Fetch company branding
const response = await api.get(`/public/companies/by-slug/${slug}`);
const company = response.data;

// SHOW logo
{company.logo && (
  <img src={company.logo} alt={company.name} />
)}

// SHOW company name
<h2>Welcome to {company.name}</h2>

// USE company colors
style={{ backgroundColor: company.primaryColor || '#4F46E5' }}
```

---

## 🔒 **SECURITY MEASURES**

### **1. Role-Based Access Control**

| User Role        | /login | /:slug/login | /admin/login |
|------------------|--------|--------------|--------------|
| SUPER_ADMIN      | ❌ Blocked | ❌ Blocked   | ✅ Allowed   |
| COMPANY_ADMIN    | ✅ Allowed | ✅ Allowed   | ❌ Blocked   |
| ADMIN            | ✅ Allowed | ✅ Allowed   | ❌ Blocked   |
| EMPLOYEE         | ✅ Allowed | ✅ Allowed   | ❌ Blocked   |

---

### **2. Route Guards**

**PublicRoute:**
- Redirects authenticated users to their dashboards
- Allows unauthenticated users to access login pages

**CompanyRoute:**
- Requires authentication
- Requires companyId (not null)
- Blocks SUPER_ADMIN users
- Redirects to `/login` if not authenticated

**AdminRoute:**
- Requires authentication
- Requires SUPER_ADMIN role
- Requires companyId = null
- Redirects to `/admin/login` if not authenticated

---

### **3. Company Validation**

When accessing `/:slug/login`:

```typescript
// 1. Check company exists
const company = await getCompanyBySlug(slug);
if (!company) {
  return error("Company not found");
}

// 2. Check company is active
if (!company.isActive) {
  return error("Company deactivated");
}

// 3. Check subscription status
if (company.subscriptionStatus === 'EXPIRED') {
  return error("Subscription expired");
}

// 4. Allow login
return showLoginForm(company);
```

---

## 🧪 **TESTING SCENARIOS**

### **Scenario 1: Company Employee Login**

1. User visits `/login` (default)
2. Enters email: `john@apliman.com`
3. Enters password: `password123`
4. System checks:
   - ✅ Valid credentials
   - ✅ User has companyId (e.g., `apliman-id`)
   - ✅ Role is EMPLOYEE
5. Result: **Redirect to `/dashboard`** ✅

---

### **Scenario 2: System Admin Tries Company Login**

1. User visits `/login`
2. Enters email: `superadmin@apliman.com`
3. Enters password: `SuperAdmin123!`
4. System checks:
   - ✅ Valid credentials
   - ❌ Role is SUPER_ADMIN
   - ❌ companyId is null
5. Result: **Error: "System Administrators should use the admin portal"** ❌

---

### **Scenario 3: Company-Specific Login**

1. User visits `/apliman/login` (branded)
2. System fetches company:
   - ✅ Company exists
   - ✅ Logo displayed
   - ✅ Apliman colors applied
3. User enters credentials
4. Login succeeds
5. Result: **Redirect to `/dashboard`** ✅

---

### **Scenario 4: Invalid Company Slug**

1. User visits `/fake-company/login`
2. System fetches company:
   - ❌ Company not found
3. Result: **Error page: "Company Not Found"** + Go Back button

---

### **Scenario 5: System Admin Portal**

1. System Admin knows the hidden URL: `/admin/login`
2. Enters email: `superadmin@apliman.com`
3. Enters password: `SuperAdmin123!`
4. System checks:
   - ✅ Valid credentials
   - ✅ Role is SUPER_ADMIN
   - ✅ companyId is null
5. Result: **Redirect to `/admin/companies`** ✅

---

## 📱 **USER EXPERIENCE**

### **For Company Users:**

```
1. Visit site → Lands on /login (clean, no logo)
2. Enter credentials
3. Redirects to /dashboard
4. All company features available
```

**OR**

```
1. Visit branded URL → /apliman/login (with logo)
2. See company branding
3. Enter credentials
4. Redirects to /dashboard
```

---

### **For System Admin:**

```
1. Directly visit /admin/login (hidden URL)
2. Enter SUPER_ADMIN credentials
3. Redirects to /admin/companies
4. Manage all companies
```

---

## 🚨 **COMMON ERRORS**

### **Error 1: "System Administrators should use the admin portal"**

**Cause:** System Admin tried to login via `/login`

**Solution:** Use `/admin/login` instead

---

### **Error 2: "Your account is not associated with any company"**

**Cause:** User has no companyId in database

**Solution:** Contact System Admin to assign company

---

### **Error 3: "Company not found"**

**Cause:** Invalid slug in URL (e.g., `/wrong-slug/login`)

**Solution:** Check company slug or use `/login`

---

### **Error 4: "This company account has been deactivated"**

**Cause:** Company.isActive = false

**Solution:** Contact System Admin to reactivate

---

### **Error 5: "Your company's subscription has expired"**

**Cause:** Company.subscriptionStatus = 'EXPIRED'

**Solution:** Contact System Admin to renew subscription

---

## 🔧 **CONFIGURATION**

### **Environment Variables:**

```bash
# Backend
DATABASE_URL=postgresql://user:pass@host/db
JWT_SECRET=your-secret-key
SUPER_ADMIN_PASSWORD=SuperAdmin123!

# Frontend
VITE_API_URL=https://your-backend.com/api
```

---

### **Database Setup:**

```sql
-- System Admin (NO company)
INSERT INTO users (email, role, companyId)
VALUES ('superadmin@apliman.com', 'SUPER_ADMIN', NULL);

-- Company User (WITH company)
INSERT INTO users (email, role, companyId)
VALUES ('john@apliman.com', 'EMPLOYEE', 'company-uuid');
```

---

## 📊 **SUMMARY**

| Feature                | /login     | /:slug/login | /admin/login |
|------------------------|------------|--------------|--------------|
| **Default Page**       | ✅ Yes      | ❌ No         | ❌ No         |
| **Logo Displayed**     | ❌ No       | ✅ Yes        | ❌ No         |
| **Company Branding**   | ❌ No       | ✅ Yes        | ❌ No         |
| **System Admin**       | ❌ Blocked  | ❌ Blocked    | ✅ Allowed    |
| **Company Users**      | ✅ Allowed  | ✅ Allowed    | ❌ Blocked    |
| **Public Links**       | ✅ Yes      | ✅ Yes        | ❌ Hidden     |

---

## 🎯 **BEST PRACTICES**

1. ✅ **Always use `/login`** as the default login page
2. ✅ **Use `/:slug/login`** for branded company experiences
3. ✅ **Never link to `/admin/login`** publicly (security)
4. ✅ **Validate company exists** before showing login form
5. ✅ **Check subscription status** before allowing login
6. ✅ **Clear error messages** for failed login attempts

---

## 🆘 **SUPPORT**

For issues:
- Company users → Contact your company administrator
- Company admins → Contact System Administrator
- System Admin → Check logs and database

---

**Last Updated:** November 9, 2025
**Version:** 2.0 (Multi-Tenant with Generic Login)

