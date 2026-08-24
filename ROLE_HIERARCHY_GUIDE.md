# 👥 **ROLE HIERARCHY & MULTI-TENANT ARCHITECTURE**

## 📊 **Complete Role Structure**

```
┌─────────────────────────────────────────────────────┐
│          🛡️ SUPER_ADMIN (System Administrator)      │
│                                                      │
│  - Controls ENTIRE platform                         │
│  - Manages ALL companies                            │
│  - companyId = NULL (no company association)        │
│  - Portal: /admin/*                                 │
│  - Can create/suspend/delete companies              │
│  - Views statistics ONLY (not actual data)          │
└──────────────────────────┬──────────────────────────┘
                           │
        ┌──────────────────┴──────────────────┐
        │                                     │
        ▼                                     ▼
┌─────────────────┐                  ┌─────────────────┐
│   Company A     │                  │   Company B     │
│   (Apliman)     │                  │   (Acme Corp)   │
└─────────────────┘                  └─────────────────┘
        │                                     │
        ▼                                     ▼
┌──────────────────────────────┐    ┌──────────────────────────────┐
│  👤 COMPANY_ADMIN            │    │  👤 COMPANY_ADMIN            │
│                              │    │                              │
│  - Owner/Admin of Company A  │    │  - Owner/Admin of Company B  │
│  - companyId = Company A     │    │  - companyId = Company B     │
│  - Created by SUPER_ADMIN    │    │  - Created by SUPER_ADMIN    │
│  - Full access to Company A  │    │  - Full access to Company B  │
│  - Portal: / (company portal)│    │  - Portal: / (company portal)│
│  - Login: /apliman/login     │    │  - Login: /acme/login        │
└──────────────┬───────────────┘    └──────────────┬───────────────┘
               │                                    │
       ┌───────┴────────┐                  ┌───────┴────────┐
       ▼                ▼                  ▼                ▼
┌──────────┐    ┌──────────────┐  ┌──────────┐    ┌──────────────┐
│  ADMIN   │    │   EMPLOYEE   │  │  ADMIN   │    │   EMPLOYEE   │
│          │    │              │  │          │    │              │
│ Company A│    │  Company A   │  │ Company B│    │  Company B   │
└──────────┘    └──────────────┘  └──────────┘    └──────────────┘
```

---

## 🎭 **Role Definitions**

### **1️⃣ SUPER_ADMIN (System Administrator)**

**Purpose:** Platform owner who manages the entire SaaS system

**Capabilities:**
- ✅ Create new companies
- ✅ Suspend/reactivate companies
- ✅ Extend subscriptions
- ✅ Reset company admin passwords
- ✅ View platform-wide statistics
- ✅ Configure system settings
- ✅ Manage AI keys per company
- ❌ **CANNOT** see actual company data (tasks, users, chats)
- ❌ **CANNOT** access company portals

**Database:**
```prisma
User {
  id: "super-admin-id"
  email: "superadmin@apliman.com"
  role: SUPER_ADMIN
  companyId: null  // NO COMPANY ASSOCIATION
}
```

**Login:**
- URL: `/admin/login` (hidden, direct access only)
- After login: Redirected to `/admin/companies`

**Access:**
- Portal: `/admin/*`
- Dashboard: `/admin/companies`
- Analytics: `/admin/analytics`
- Settings: `/admin/settings`
- Profile: `/admin/profile`

---

### **2️⃣ COMPANY_ADMIN (Company Administrator)**

**Purpose:** Owner/Administrator of a specific company

**Capabilities:**
- ✅ Manage company users (CRUD)
- ✅ Create/assign tasks
- ✅ Manage workflows
- ✅ Configure company settings
- ✅ View company analytics
- ✅ Manage AI chatbot
- ✅ Access all company features
- ❌ **CANNOT** access other companies
- ❌ **CANNOT** access system admin panel

**Database:**
```prisma
User {
  id: "company-admin-id"
  email: "admin@apliman.com"
  role: COMPANY_ADMIN
  companyId: "apliman-company-id"  // TIED TO COMPANY
}
```

**Login:**
- URL: `/apliman/login` (company-specific)
- OR: `/login` (generic)
- After login: Redirected to `/dashboard`

**Access:**
- Portal: `/` (company portal)
- Dashboard: `/dashboard`
- Tasks: `/tasks`
- Users: `/users`
- Workflows: `/workflows`
- Analytics: `/analytics`
- Profile: `/profile`

**Creation:**
- Created automatically when SUPER_ADMIN creates a company
- Email + password provided by SUPER_ADMIN
- First user in the company

---

### **3️⃣ ADMIN (Company Admin - Legacy Role)**

**Purpose:** Company-level administrator with management permissions

**Capabilities:**
- ✅ Create/assign tasks
- ✅ Manage workflows
- ✅ View company analytics
- ✅ Manage team members (limited)
- ✅ Access most company features
- ❌ **CANNOT** create other admins (only COMPANY_ADMIN can)
- ❌ **CANNOT** access system admin panel
- ❌ **CANNOT** access other companies

**Database:**
```prisma
User {
  id: "admin-id"
  email: "john.admin@apliman.com"
  role: ADMIN
  companyId: "apliman-company-id"  // TIED TO COMPANY
}
```

**Login:**
- Same as COMPANY_ADMIN
- URL: `/apliman/login` or `/login`

**Access:**
- Portal: `/` (company portal)
- Same routes as COMPANY_ADMIN

**Creation:**
- Created by COMPANY_ADMIN from `/users` page
- Role: ADMIN

---

### **4️⃣ EMPLOYEE (Regular User)**

**Purpose:** Regular company user with limited permissions

**Capabilities:**
- ✅ View assigned tasks
- ✅ Update task status
- ✅ Add comments
- ✅ Track time
- ✅ Use AI chatbot
- ✅ View notifications
- ❌ **CANNOT** create tasks (unless assigned permission)
- ❌ **CANNOT** manage users
- ❌ **CANNOT** access admin features

**Database:**
```prisma
User {
  id: "employee-id"
  email: "jane.doe@apliman.com"
  role: EMPLOYEE
  companyId: "apliman-company-id"  // TIED TO COMPANY
}
```

**Login:**
- Same as COMPANY_ADMIN
- URL: `/apliman/login` or `/login`

**Access:**
- Portal: `/` (company portal)
- Dashboard: `/dashboard` (limited view)
- Tasks: `/tasks` (only assigned tasks)
- Profile: `/profile`

**Creation:**
- Created by COMPANY_ADMIN or ADMIN from `/users` page
- Role: EMPLOYEE

---

## 🔐 **Authentication & Authorization**

### **JWT Token Structure**

```typescript
{
  sub: "user-id",
  email: "user@example.com",
  role: "SUPER_ADMIN" | "COMPANY_ADMIN" | "ADMIN" | "EMPLOYEE",
  companyId: "company-id" | null,  // NULL for SUPER_ADMIN
  iat: 1699999999,
  exp: 1700086399
}
```

### **Route Guards**

| Route Pattern | Guard | Allowed Roles | Company Required |
|--------------|-------|---------------|------------------|
| `/admin/login` | PublicRoute | None (public) | No |
| `/login` | PublicRoute | None (public) | No |
| `/:slug/login` | PublicRoute | None (public) | No |
| `/admin/*` | AdminRoute | SUPER_ADMIN | No (must be null) |
| `/` (company) | CompanyRoute | COMPANY_ADMIN, ADMIN, EMPLOYEE | Yes |
| `/dashboard` | CompanyRoute | COMPANY_ADMIN, ADMIN, EMPLOYEE | Yes |
| `/tasks` | CompanyRoute | COMPANY_ADMIN, ADMIN, EMPLOYEE | Yes |
| `/users` | ProtectedRoute + RolesGuard | COMPANY_ADMIN, ADMIN | Yes |
| `/workflows` | ProtectedRoute + RolesGuard | COMPANY_ADMIN, ADMIN | Yes |

---

## 🏢 **Company Isolation**

### **Data Isolation Rules**

1. **SUPER_ADMIN:**
   - Can see company COUNT
   - Can see company STATISTICS (counts)
   - CANNOT see actual tasks, users, chats

2. **COMPANY_ADMIN:**
   - Can see ALL data in their company
   - CANNOT see other companies' data

3. **ADMIN:**
   - Can see ALL data in their company
   - CANNOT see other companies' data

4. **EMPLOYEE:**
   - Can see data they're assigned to
   - CANNOT see all company data
   - CANNOT see other companies' data

### **Backend Filtering**

All services automatically filter by `companyId`:

```typescript
// Example: TasksService
async findAll(userId: string) {
  const user = await this.prisma.user.findUnique({
    where: { id: userId },
    select: { companyId: true, role: true },
  });

  // Automatically filter by company
  return this.prisma.task.findMany({
    where: {
      companyId: user.companyId, // ✅ Isolated
    },
  });
}
```

---

## 📊 **Statistics Access Levels**

### **SUPER_ADMIN Statistics (Platform-Wide)**

```
GET /api/companies/platform-stats

Response:
{
  totalCompanies: 10,
  activeCompanies: 8,
  suspendedCompanies: 2,
  totalUsers: 150,
  totalTasks: 5000,
  totalAIMessages: 20000,
  companiesOnTrial: 3,
  companiesExpired: 2
}
```

### **COMPANY_ADMIN Statistics (Company-Specific)**

```
GET /api/analytics/dashboard

Response:
{
  // ONLY their company's data
  totalTasks: 150,
  totalUsers: 12,
  completedTasks: 100,
  aiUsage: 500
}
```

---

## 🚪 **Login Flows**

### **System Administrator Login**

```
1. Visit /admin/login (hidden URL)
2. Enter: superadmin@apliman.com / the value of SUPER_ADMIN_PASSWORD
3. Backend checks:
   - ✅ Credentials valid
   - ✅ Role = SUPER_ADMIN
   - ✅ companyId = null
4. JWT issued with companyId: null
5. Redirect to /admin/companies
6. AdminRoute guard allows access
```

### **Company User Login**

```
1. Visit /apliman/login (or /login)
2. Enter: admin@apliman.com / password123
3. Backend checks:
   - ✅ Credentials valid
   - ✅ Role = COMPANY_ADMIN
   - ✅ companyId = apliman-id
   - ✅ Company is active
4. JWT issued with companyId: apliman-id
5. Redirect to /dashboard
6. CompanyRoute guard allows access
```

---

## 🔄 **Company Creation Flow**

```
1. SUPER_ADMIN logs in → /admin/companies
2. Click "Create New Company"
3. Fill form:
   - Company name: "Apliman"
   - Slug: "apliman"
   - Logo: Upload or URL
   - Primary color: #3B82F6
   - Admin email: admin@apliman.com
   - Admin name: "Admin User"
   - Admin password: (optional, auto-generated)
   - Subscription plan: PRO
   - Subscription days: 365
   - AI API Key: (optional)
4. Backend:
   - Creates Company record
   - Creates CompanySettings
   - Creates COMPANY_ADMIN user
   - Logs SubscriptionHistory
5. Returns:
   - Company details
   - Admin credentials (email + password)
6. SUPER_ADMIN can share credentials with company
7. Company admin logs in at /apliman/login
```

---

## 🎨 **UI Differences**

### **System Admin Portal (/admin)**

```
┌─────────────────────────────────────┐
│ 🛡️ System Administrator              │
├─────────────────────────────────────┤
│ Sidebar:                             │
│  - Companies (list all)              │
│  - System Analytics (platform stats) │
│  - System Settings (global config)   │
│  - Profile (change password)         │
├─────────────────────────────────────┤
│ Color: Purple/Indigo gradient        │
│ Logo: Shield icon (no company logo)  │
└─────────────────────────────────────┘
```

### **Company Portal (/)**

```
┌─────────────────────────────────────┐
│ 🏢 [Company Logo] Apliman            │
├─────────────────────────────────────┤
│ Sidebar:                             │
│  - Dashboard                         │
│  - Tasks                             │
│  - Workflows                         │
│  - Users                             │
│  - Analytics                         │
│  - Activity                          │
│  - Profile                           │
├─────────────────────────────────────┤
│ Color: Company primary color         │
│ Logo: Company logo                   │
│ Branding: Company-specific           │
└─────────────────────────────────────┘
```

---

## 🔒 **Security Model**

### **Access Control Matrix**

| Action | SUPER_ADMIN | COMPANY_ADMIN | ADMIN | EMPLOYEE |
|--------|-------------|---------------|-------|----------|
| Create Company | ✅ | ❌ | ❌ | ❌ |
| Suspend Company | ✅ | ❌ | ❌ | ❌ |
| View All Companies | ✅ | ❌ | ❌ | ❌ |
| Create Users | ✅ (company admin) | ✅ | ✅ (limited) | ❌ |
| Create Tasks | ❌ | ✅ | ✅ | ❌ |
| View All Tasks | ❌ | ✅ | ✅ | ❌ (assigned only) |
| Manage Workflows | ❌ | ✅ | ✅ | ❌ |
| View Analytics | ✅ (platform) | ✅ (company) | ✅ (company) | ❌ |
| Configure AI | ✅ (per company) | ✅ (own company) | ❌ | ❌ |

---

## 📝 **Key Takeaways**

1. **SUPER_ADMIN = Platform Owner**
   - No company association
   - Manages ALL companies
   - Views statistics ONLY

2. **COMPANY_ADMIN = Company Owner**
   - Created by SUPER_ADMIN
   - Full access to their company
   - First user in company

3. **ADMIN = Company Manager**
   - Legacy role still exists
   - Manages company operations
   - Limited user management

4. **EMPLOYEE = Regular User**
   - Limited permissions
   - Assigned tasks only
   - Basic features

5. **Data Isolation**
   - Each company is completely isolated
   - No cross-company access
   - Backend filters by companyId

6. **Login Pages**
   - `/admin/login` → System Admin (hidden)
   - `/login` → Generic (default)
   - `/:slug/login` → Company-specific (branded)

---

**Last Updated:** November 9, 2025  
**Version:** 2.0 (Multi-Tenant Architecture)

