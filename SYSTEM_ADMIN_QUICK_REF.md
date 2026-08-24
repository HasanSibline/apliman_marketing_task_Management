# ⚡ Quick Reference - System Administrator

## 🔑 NEW SYSTEM ARCHITECTURE

### **IMPORTANT CHANGE:**
✅ **Apliman is now a REGULAR company** (not special)  
✅ **System Administrator exists OUTSIDE all companies**  
✅ **companyId = NULL for System Admin**

---

## 🚀 After Migration

### **System Administrator Credentials:**
```
Email: superadmin@apliman.com
Password: the value of SUPER_ADMIN_PASSWORD
Company: NONE (companyId = NULL)
Role: SUPER_ADMIN
```

**⚠️ CHANGE THIS PASSWORD IMMEDIATELY!**

---

## 👥 User Structure

### **System Administrator:**
- Lives **OUTSIDE** all companies (`companyId = NULL`)
- Can manage ALL companies (Apliman, Test Company, etc.)
- Sees "Companies" menu in sidebar
- Cannot see company-specific tasks (unless specifically implemented)

### **Apliman Company Users:**
- All your existing users are now in "Apliman" company
- Any existing SUPER_ADMIN → converted to COMPANY_ADMIN
- Can ONLY see Apliman's data
- Cannot see "Companies" menu

### **Other Company Users:**
- Each company is completely isolated
- Cannot see other companies' data
- Each has their own admin (COMPANY_ADMIN role)

---

## 🏢 Company Hierarchy

```
System (No Company)
├── System Administrator (superadmin@apliman.com)
│   └── Manages ALL companies
│
Companies
├── Apliman (Regular Company)
│   ├── Company Admin (your existing admin)
│   ├── Users (your existing users)
│   └── Tasks (your existing tasks)
│
├── Test Company (Regular Company)
│   ├── Company Admin (admin@testcompany.com)
│   └── Users, Tasks...
│
└── Future Companies...
```

---

## 📊 Database Structure

### **System Admin:**
```sql
SELECT * FROM User WHERE email = 'superadmin@apliman.com';
-- id: xxx
-- companyId: NULL  ← MUST BE NULL!
-- role: SUPER_ADMIN
```

### **Apliman Company Admin:**
```sql
SELECT * FROM User WHERE email = 'your@email.com';
-- id: xxx
-- companyId: <apliman-company-id>  ← HAS COMPANY!
-- role: COMPANY_ADMIN  ← Converted from SUPER_ADMIN
```

### **Company:**
```sql
SELECT * FROM Company WHERE name = 'Apliman';
-- id: <apliman-company-id>
-- name: Apliman
-- isActive: true
-- subscriptionPlan: ENTERPRISE
```

---

## ✅ Verification Checklist

After migration, verify:

### **1. System Admin Created:**
```sql
SELECT id, email, role, companyId 
FROM User 
WHERE role = 'SUPER_ADMIN';

-- Should return:
-- email: superadmin@apliman.com
-- companyId: NULL  ← CRITICAL!
```

### **2. Apliman is a Regular Company:**
```sql
SELECT id, name, subscriptionPlan 
FROM Company 
WHERE name = 'Apliman';

-- Should exist and be a normal company
```

### **3. All Users Have Company:**
```sql
SELECT COUNT(*) 
FROM User 
WHERE companyId IS NULL AND role != 'SUPER_ADMIN';

-- Should be 0 (only SUPER_ADMIN has NULL)
```

### **4. All Tasks Have Company:**
```sql
SELECT COUNT(*) 
FROM Task 
WHERE companyId IS NULL;

-- Should be 0
```

---

## 🎯 Access Guide

### **Login as System Administrator:**
1. Go to `/login`
2. Email: `superadmin@apliman.com`
3. Password: the value of `SUPER_ADMIN_PASSWORD`
4. You'll see "Companies" menu item 🏢
5. Click to access `/super-admin/companies`

### **Login as Apliman Company Admin:**
1. Go to `/login`
2. Email: Your existing admin email
3. Password: Your existing password
4. You'll see tasks, users (ONLY from Apliman)
5. NO "Companies" menu (you're just a company admin)

---

## 🔒 Security Model

### **Super Admin (System):**
- ❌ NO company
- ✅ Can manage ALL companies
- ✅ Can create/suspend companies
- ✅ Can reset passwords
- ✅ Can extend subscriptions
- ❌ Cannot see individual company tasks (isolated)

### **Company Admin (Apliman, etc.):**
- ✅ HAS a company
- ✅ Can see their company's data
- ❌ Cannot see other companies
- ❌ Cannot manage companies
- ✅ Full admin within their company

---

## 🐛 Troubleshooting

### **"No Companies menu"**

**Problem:** You don't see "Companies" in sidebar

**Check:**
```sql
SELECT email, role, companyId FROM User WHERE email = 'your@email.com';
```

**Solution:**
- Must have `role = 'SUPER_ADMIN'`
- Must have `companyId = NULL` (CRITICAL!)

```sql
UPDATE User 
SET role = 'SUPER_ADMIN', companyId = NULL 
WHERE email = 'superadmin@apliman.com';
```

### **"Can see other companies' data"**

**Problem:** Users can see data from other companies

**Check:**
```sql
-- All regular users should have companyId
SELECT email, role, companyId FROM User WHERE role != 'SUPER_ADMIN';

-- All should have companyId NOT NULL
```

**Solution:** Re-run migration or manually assign users to companies

---

## 📝 Quick Commands

### **Create System Admin Manually:**
```sql
-- If migration didn't create it
INSERT INTO User (id, email, name, password, role, companyId, position, status)
VALUES (
  'system-admin-id',
  'superadmin@apliman.com',
  'System Administrator',
  '$2b$10$hashedpassword', -- Hash of the configured SUPER_ADMIN_PASSWORD
  'SUPER_ADMIN',
  NULL, -- MUST BE NULL!
  'System Administrator',
  'ACTIVE'
);
```

### **Convert User to System Admin:**
```sql
UPDATE User 
SET role = 'SUPER_ADMIN', companyId = NULL 
WHERE email = 'your@email.com';
```

### **Reset System Admin Password:**
```sql
-- First, hash your new password using bcrypt
-- Then:
UPDATE User 
SET password = '$2b$10$your-hashed-password' 
WHERE email = 'superadmin@apliman.com';
```

---

## 🎉 Summary

**Before:** Apliman was "the system" with one admin

**After:** 
- ✅ Apliman is a regular company (like any other)
- ✅ System Administrator manages ALL companies
- ✅ Perfect isolation between companies
- ✅ Ready to add unlimited companies

**Key Point:** `companyId = NULL` for System Admin is CRITICAL! 🔑

---

**Need Help?** Check `MULTI_TENANT_TESTING_GUIDE.md` for full testing instructions.

