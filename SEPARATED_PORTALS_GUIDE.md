# 🔐 Separated Portals - System Admin vs Company Users

## ✅ IMPLEMENTATION COMPLETE

The application now has **completely separated portals** for System Administrators and Company Users, providing better security and user experience.

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    SEPARATE PORTALS                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────────┐     ┌──────────────────────┐    │
│  │   SYSTEM ADMIN       │     │   COMPANY PORTAL     │    │
│  │   PORTAL             │     │                      │    │
│  ├──────────────────────┤     ├──────────────────────┤    │
│  │ Login: /admin/login  │     │ Login: /login        │    │
│  │ Routes: /admin/*     │     │ Routes: /*           │    │
│  │                      │     │                      │    │
│  │ Users:               │     │ Users:               │    │
│  │ - SUPER_ADMIN        │     │ - COMPANY_ADMIN      │    │
│  │ - companyId = NULL   │     │ - ADMIN              │    │
│  │                      │     │ - EMPLOYEE           │    │
│  │ Access:              │     │ - companyId != NULL  │    │
│  │ - Manage companies   │     │                      │    │
│  │ - View statistics    │     │ Access:              │    │
│  │ - System settings    │     │ - Company tasks      │    │
│  │                      │     │ - Company users      │    │
│  │ CANNOT:              │     │ - Workflows          │    │
│  │ - Access /dashboard  │     │ - Analytics          │    │
│  │ - Access /tasks      │     │                      │    │
│  │ - Access /users      │     │ CANNOT:              │    │
│  │                      │     │ - Access /admin/*    │    │
│  └──────────────────────┘     └──────────────────────┘    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔑 Authentication & Access

### **System Administrator Portal**

**Login URL:** `/admin/login`

**Credentials:**
```
Email: superadmin@apliman.com
Password: SuperAdmin123!
```

**Requirements:**
- ✅ `role = 'SUPER_ADMIN'`
- ✅ `companyId = NULL`

**After Login:**
- Redirects to: `/admin/companies`
- Access to: All routes under `/admin/*`
- **BLOCKED** from: All company routes (`/dashboard`, `/tasks`, `/users`, etc.)

---

### **Company Portal**

**Login URL:** `/login`

**Credentials:** Your existing company user credentials

**Requirements:**
- ✅ `role = 'COMPANY_ADMIN' | 'ADMIN' | 'EMPLOYEE'`
- ✅ `companyId != NULL` (must belong to a company)

**After Login:**
- Redirects to: `/dashboard`
- Access to: All company routes (`/tasks`, `/users`, `/workflows`, etc.)
- **BLOCKED** from: All admin routes (`/admin/*`)

---

## 🚪 Portal URLs

### **System Admin Portal:**

| Action | URL |
|--------|-----|
| Login | `/admin/login` |
| Companies Dashboard | `/admin/companies` |
| Create Company | `/admin/companies/create` |
| View Company | `/admin/companies/:id` |
| Edit Company | `/admin/companies/:id/edit` |
| System Analytics | `/admin/analytics` *(future)* |
| System Settings | `/admin/settings` *(future)* |

### **Company Portal:**

| Action | URL |
|--------|-----|
| Login | `/login` |
| Dashboard | `/dashboard` |
| Tasks | `/tasks` |
| Task Details | `/tasks/:id` |
| Workflows | `/workflows` |
| Users | `/users` |
| Analytics | `/analytics` |
| Profile | `/profile` |
| Knowledge Sources | `/admin/knowledge-sources` |
| Activity | `/activity` |

---

## 🔒 Security Features

### **1. Separate Login Endpoints**

**Backend:**
- `/auth/login` - Company users only
- `/auth/admin-login` - System Admins only

**Frontend:**
- `/login` - Company login page
- `/admin/login` - System Admin login page

### **2. Route Guards**

**AdminRoute Component:**
```typescript
// Protects: /admin/*
// Allows: SUPER_ADMIN with companyId = NULL
// Blocks: All company users
// Redirects blocked users to: /dashboard
```

**CompanyRoute Component:**
```typescript
// Protects: /* (all company routes)
// Allows: Users with companyId != NULL
// Blocks: SUPER_ADMIN with companyId = NULL
// Redirects blocked users to: /admin/companies
```

### **3. Backend Validation**

**Company Login (`/auth/login`):**
```typescript
// ✅ Allows: COMPANY_ADMIN, ADMIN, EMPLOYEE
// ❌ Blocks: SUPER_ADMIN with no company
// Error: "System Administrators must use the admin portal at /admin/login"
```

**Admin Login (`/auth/admin-login`):**
```typescript
// ✅ Allows: SUPER_ADMIN with companyId = NULL
// ❌ Blocks: All company users
// Error: "Access denied. This portal is for System Administrators only."
```

### **4. Separate Layouts**

**AdminLayout:**
- System Admin branding
- Admin-specific sidebar (Companies, System Analytics, System Settings)
- Purple/Indigo gradient theme
- Shows role badge: "SUPER_ADMIN"

**Layout (Company):**
- Company branding (logo, colors)
- Company-specific sidebar (Dashboard, Tasks, Users, etc.)
- NO "Companies" menu
- Shows company name

---

## 🧪 Testing Guide

### **Test 1: System Admin Login**

**Steps:**
1. Go to `/admin/login`
2. Login with: `superadmin@apliman.com` / `SuperAdmin123!`
3. Should redirect to: `/admin/companies`
4. Sidebar should show: Companies, System Analytics, System Settings
5. Try to access: `/dashboard` → Should redirect back to `/admin/companies`

**Expected Result:** ✅ Access admin portal only

---

### **Test 2: Company User Login**

**Steps:**
1. Go to `/login`
2. Login with your company credentials
3. Should redirect to: `/dashboard`
4. Sidebar should show: Dashboard, Tasks, Users, Workflows, etc.
5. Try to access: `/admin/companies` → Should redirect back to `/dashboard`

**Expected Result:** ✅ Access company portal only

---

### **Test 3: System Admin Tries Company Login**

**Steps:**
1. Go to `/login` (company login)
2. Try to login with: `superadmin@apliman.com` / `SuperAdmin123!`

**Expected Result:** ❌ Error: "System Administrators must use the admin portal at /admin/login"

---

### **Test 4: Company User Tries Admin Login**

**Steps:**
1. Go to `/admin/login`
2. Try to login with company user credentials

**Expected Result:** ❌ Error: "Access denied. This portal is for System Administrators only."

---

### **Test 5: Direct URL Access**

**System Admin tries company routes:**
```
/dashboard → Redirects to /admin/companies
/tasks → Redirects to /admin/companies
/users → Redirects to /admin/companies
```

**Company User tries admin routes:**
```
/admin/companies → Redirects to /dashboard
/admin/companies/create → Redirects to /dashboard
```

---

## 📁 File Changes

### **Backend Files:**

1. **`backend/src/auth/auth.controller.ts`**
   - Added `adminLogin()` endpoint
   - Separated company and admin login

2. **`backend/src/auth/auth.service.ts`**
   - Added `adminLogin()` method
   - Validates SUPER_ADMIN with companyId = NULL
   - Blocks SUPER_ADMIN from company login

### **Frontend Files:**

1. **`frontend/src/pages/AdminLogin.tsx`** *(NEW)*
   - Separate login page for System Admins
   - Calls `/auth/admin-login`
   - Purple/Indigo theme

2. **`frontend/src/components/layout/AdminLayout.tsx`** *(NEW)*
   - Admin-specific layout
   - Admin sidebar with Companies, Analytics, Settings
   - System Admin branding

3. **`frontend/src/components/auth/AdminRoute.tsx`** *(NEW)*
   - Protects admin routes
   - Only allows SUPER_ADMIN with no company

4. **`frontend/src/components/auth/CompanyRoute.tsx`** *(NEW)*
   - Protects company routes
   - Only allows users with companyId

5. **`frontend/src/App.tsx`**
   - Separated routing for admin and company portals
   - Added route guards

6. **`frontend/src/components/layout/Sidebar.tsx`**
   - Removed "Companies" menu item
   - Only shows company-related items

---

## 🎯 Benefits

### **Security:**
- ✅ No accidental access to wrong portal
- ✅ Clear separation of concerns
- ✅ Easier to audit access logs
- ✅ Reduced attack surface

### **User Experience:**
- ✅ Clear visual distinction between portals
- ✅ No confusing "Companies" menu for regular users
- ✅ Admins see only what they need
- ✅ Better performance (fewer unnecessary queries)

### **Maintainability:**
- ✅ Easier to add admin-only features
- ✅ Easier to add company-only features
- ✅ Clear code organization
- ✅ Better testing isolation

---

## 🚀 Deployment Notes

### **Before Deployment:**
1. Run migration: `npx ts-node prisma/migrate-to-multi-tenant.ts`
2. Verify System Admin created with `companyId = NULL`
3. Test both login portals
4. Update environment variables if needed

### **After Deployment:**
1. Access admin portal at: `https://your-domain.com/admin/login`
2. Access company portal at: `https://your-domain.com/login`
3. Change System Admin password immediately
4. Test all route guards

---

## 🔧 Configuration

### **Environment Variables:**

No new environment variables needed. Uses existing:
```env
DATABASE_URL=your_database_url
JWT_SECRET=your_jwt_secret
JWT_EXPIRES_IN=7d
```

---

## 📝 Summary

✅ **System Admin Portal:** `/admin/login` → `/admin/*`  
✅ **Company Portal:** `/login` → `/*`  
✅ **Complete Separation:** No cross-access  
✅ **Backend Validation:** Separate login endpoints  
✅ **Frontend Guards:** Route-level protection  
✅ **Security:** Role + companyId validation  

**The portals are now completely separated and secure!** 🎉

---

## 📞 Quick Reference

| Portal | Login URL | After Login | Who Can Access |
|--------|-----------|-------------|----------------|
| **System Admin** | `/admin/login` | `/admin/companies` | SUPER_ADMIN (companyId = NULL) |
| **Company** | `/login` | `/dashboard` | COMPANY_ADMIN, ADMIN, EMPLOYEE (companyId != NULL) |

---

**Need Help?** Check the testing guide above or contact the development team.

