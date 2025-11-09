# 🚀 **DEPLOYMENT GUIDE - MULTI-TENANT CLEAN START**

## 📋 **WHAT CHANGED IN THIS UPDATE**

### **Key Changes:**
1. ✅ **No default company created** - System Admin must create companies manually
2. ✅ **Fixed frontend TypeScript errors** - Removed invalid CSS properties
3. ✅ **Removed DIRECT_URL requirement** - Simplified database configuration
4. ✅ **Updated seed script** - Creates only System Administrator
5. ✅ **Removed migration script** - Fresh deployment approach
6. ✅ **Updated routing** - `/login` redirects to `/admin/login`

---

## 🗄️ **DATABASE STRUCTURE**

### **After Fresh Deployment:**
```
✅ SystemSettings (created)
✅ User: System Administrator
   - Email: superadmin@apliman.com
   - Role: SUPER_ADMIN
   - CompanyId: NULL
❌ NO companies created
❌ NO workflows created
❌ NO tasks created
```

### **This Means:**
- System Admin can login immediately
- NO company users can login yet
- System Admin MUST create companies first
- Each company gets their own branded login URL

---

## 🔐 **LOGIN CREDENTIALS**

### **System Administrator:**
```
URL:      https://your-domain.com/admin/login
Email:    superadmin@apliman.com
Password: SuperAdmin123!
```

*Note: Password can be customized via `SUPER_ADMIN_PASSWORD` environment variable*

---

## 🏗️ **DEPLOYMENT STEPS**

### **1. Backend Deployment (Render)**

The backend will:
1. Reset the database (⚠️ **WILL DELETE ALL DATA**)
2. Apply multi-tenant schema
3. Create System Administrator
4. Generate Prisma Client
5. Start NestJS application

**Expected Logs:**
```
🚀 Starting production deployment v4.0 (Multi-Tenant - Clean Start)...
⚠️  IMPORTANT: This deployment will create a fresh database.
✅ Multi-tenant database schema applied!
✅ System Administrator created: superadmin@apliman.com
✅ DATABASE READY - MULTI-TENANT SYSTEM
```

### **2. Frontend Deployment (Cloudflare Pages)**

The frontend build will now succeed with no TypeScript errors.

**Changes:**
- `/login` → Redirects to `/admin/login`
- `/:slug/login` → Company-specific branded login
- Removed unused variables from `CompanyRoute`
- Fixed invalid CSS properties in `CompanyLogin`

---

## 🎯 **POST-DEPLOYMENT WORKFLOW**

### **Step 1: Login as System Administrator**
1. Go to: `https://your-domain.com/admin/login`
2. Enter credentials:
   - Email: `superadmin@apliman.com`
   - Password: `SuperAdmin123!`
3. Click "Sign In"
4. You'll be redirected to `/admin/companies`

---

### **Step 2: Create Your First Company**
1. In Admin Dashboard, click "Create New Company"
2. Fill in details:
   - **Company Name**: Apliman
   - **Slug**: `apliman` (lowercase, no spaces)
   - **Logo URL**: `https://your-cdn.com/apliman-logo.webp`
   - **Primary Color**: `#4F46E5` (indigo)
   - **Admin Email**: `admin@apliman.com`
   - **Admin Name**: Apliman Administrator
   - **Subscription Plan**: Select plan
   - **Max Users**: 50
   - **Max Tasks**: 1000

3. Click "Create Company"

**Result:**
- ✅ New company `Apliman` created
- ✅ Company admin user created
- ✅ Login URL available: `/apliman/login`
- ✅ Admin receives email with temporary password

---

### **Step 3: Company Admin First Login**
1. Go to: `https://your-domain.com/apliman/login`
2. You should see:
   - ✅ Apliman logo
   - ✅ "Apliman" company name
   - ✅ Indigo branding
3. Enter admin credentials (from creation email)
4. Click "Sign in"
5. You'll be redirected to `/dashboard`

---

### **Step 4: Company Admin Creates Workflow**
1. In Company Dashboard, go to "Workflows"
2. Click "Create Workflow"
3. Add phases (e.g., To-Do → In Progress → Done)
4. Set one workflow as default
5. Save workflow

---

### **Step 5: Company Admin Creates Users**
1. Go to "Users"
2. Click "Add User"
3. Fill in user details
4. Assign role (ADMIN or EMPLOYEE)
5. User receives email with login link

---

### **Step 6: Company Users Login**
1. Users go to: `https://your-domain.com/apliman/login`
2. See Apliman branded login page
3. Enter their credentials
4. Access company dashboard

---

## 🔄 **CREATING ADDITIONAL COMPANIES**

### **Repeat for Each New Company:**
1. Login as System Administrator
2. Go to `/admin/companies`
3. Click "Create New Company"
4. Fill in unique details:
   - Unique slug (e.g., `microsoft`, `google`, `acme`)
   - Company-specific logo and colors
5. Each company gets isolated data and branded login

---

## 🎨 **COMPANY BRANDING EXAMPLES**

### **Apliman:**
```
Slug:          apliman
Logo:          https://cdn.com/apliman-logo.webp
Primary Color: #4F46E5 (Indigo)
Login URL:     /apliman/login
```

### **Microsoft:**
```
Slug:          microsoft
Logo:          https://logo.clearbit.com/microsoft.com
Primary Color: #00A4EF (Microsoft Blue)
Login URL:     /microsoft/login
```

### **Acme Corp:**
```
Slug:          acme
Logo:          https://cdn.com/acme-logo.png
Primary Color: #FF5733 (Orange)
Login URL:     /acme/login
```

---

## 🔒 **SECURITY & ISOLATION**

### **Data Isolation:**
- ✅ Each company has unique `companyId`
- ✅ All queries filtered by `companyId`
- ✅ Users can ONLY see their company's data
- ✅ Cross-company access is BLOCKED

### **Authentication:**
- ✅ System Admin: NO `companyId`, manages all companies
- ✅ Company Admin: HAS `companyId`, manages own company
- ✅ Employees: HAS `companyId`, access own company data
- ✅ JWT tokens include `companyId` for validation

### **Portals:**
- ✅ System Admin portal: `/admin/*`
- ✅ Company portals: `/{slug}/*` (via regular routes)
- ✅ Portals are completely separate
- ✅ System Admin cannot access company portals
- ✅ Company users cannot access admin portal

---

## 🐛 **TROUBLESHOOTING**

### **Issue: Backend deployment fails with "DIRECT_URL not found"**

**Solution:** This is now FIXED. `directUrl` removed from schema.

---

### **Issue: Frontend build fails with TypeScript errors**

**Solution:** This is now FIXED. Invalid CSS properties removed.

---

### **Issue: "Company not found" when accessing /apliman/login**

**Cause:** No companies created yet

**Solution:**
1. Login as System Admin
2. Create Apliman company first
3. Then access `/apliman/login`

---

### **Issue: System Admin can't login after deployment**

**Check:**
1. Is backend fully started?
2. Did seed script run successfully?
3. Check backend logs for:
   ```
   ✅ System Administrator created: superadmin@apliman.com
   ```

**If seed failed:**
1. Trigger manual deployment on Render
2. Check database is accessible
3. Check `DATABASE_URL` environment variable

---

### **Issue: `/login` shows 404 or error**

**Expected Behavior:**
- `/login` should redirect to `/admin/login`
- This is intentional (no default company)

---

## 📊 **DATABASE VERIFICATION**

### **Check System Admin Created:**
```sql
SELECT id, email, name, role, "companyId" 
FROM users 
WHERE role = 'SUPER_ADMIN';
```

**Expected:**
```
id   | email                    | name                  | role        | companyId
-----|--------------------------|----------------------|-------------|----------
uuid | superadmin@apliman.com   | System Administrator | SUPER_ADMIN | NULL
```

---

### **Check Companies:**
```sql
SELECT id, name, slug, "isActive", "subscriptionStatus" 
FROM companies;
```

**Expected (initially):**
```
(No rows) - Correct! No companies created yet.
```

**After Creating Apliman:**
```
id   | name    | slug    | isActive | subscriptionStatus
-----|---------|---------|----------|-------------------
uuid | Apliman | apliman | true     | ACTIVE
```

---

## ✅ **DEPLOYMENT CHECKLIST**

### **Backend:**
- [ ] Backend deployed successfully on Render
- [ ] Database reset completed
- [ ] System Admin created
- [ ] Application started without errors
- [ ] Can access `/api/health` endpoint

### **Frontend:**
- [ ] Frontend built successfully on Cloudflare Pages
- [ ] No TypeScript errors
- [ ] Can access homepage

### **System Admin:**
- [ ] Can login at `/admin/login`
- [ ] Redirected to `/admin/companies`
- [ ] Can see companies list (empty)
- [ ] "Create New Company" button visible

### **First Company:**
- [ ] Created company via Admin Panel
- [ ] Company appears in admin list
- [ ] Company admin user created
- [ ] Can access `/{slug}/login`
- [ ] Branded login page shows correct logo/colors

### **Company Access:**
- [ ] Company admin can login
- [ ] Redirected to company dashboard
- [ ] Can create workflows
- [ ] Can create users
- [ ] Can create tasks

---

## 🎉 **SUCCESS CRITERIA**

Your deployment is successful when:

1. ✅ System Admin can login at `/admin/login`
2. ✅ System Admin can create companies
3. ✅ Each company has unique branded login URL
4. ✅ Company users can login at `/{slug}/login`
5. ✅ Data isolation working (users see only their company)
6. ✅ No cross-company data leaks
7. ✅ Both portals work independently

---

## 📞 **NEXT STEPS**

### **After Successful Deployment:**

1. **Change System Admin Password:**
   - Login as System Admin
   - Go to Profile
   - Change password immediately

2. **Create Main Companies:**
   - Create Apliman (your main company)
   - Create any other client companies

3. **Set Up Company Admins:**
   - Each company gets admin user
   - Admin sets up workflows
   - Admin invites team members

4. **Configure Branding:**
   - Update company logos
   - Set primary colors
   - Test branded login pages

5. **Enable AI (if needed):**
   - Add AI API keys per company
   - Configure AI provider
   - Test AI features

---

**Deployment Version:** v4.0 (Multi-Tenant Clean Start)  
**Date:** November 9, 2025  
**Status:** ✅ **READY FOR DEPLOYMENT**

---

## 🔗 **IMPORTANT URLS**

| Purpose | URL |
|---------|-----|
| **System Admin Login** | `/admin/login` |
| **Create Companies** | `/admin/companies` |
| **Company Login (after creation)** | `/{company-slug}/login` |
| **API Health Check** | `/api/health` |
| **Public Company Info** | `/api/public/companies/by-slug/{slug}` |

