# Data Persistence - Complete Guide

## Current Status: What's Persistent vs What's Not

### ✅ **PERSISTENT (Safe from Deployment Resets)**

#### 1. **Database Data** (PostgreSQL on Neon.tech)
- ✅ **Companies**: All company records
- ✅ **Users**: All user accounts and profiles
- ✅ **Tasks**: All tasks, subtasks, comments
- ✅ **Workflows**: All workflow configurations
- ✅ **Chat History**: All ApliChat conversations
- ✅ **User Context**: All AI-learned information
- ✅ **Knowledge Sources**: Metadata and scraped content
- ✅ **Analytics**: All analytics data
- ✅ **Notifications**: All notification records
- ✅ **Subscriptions**: All subscription history

**Why Safe**: 
- Stored in **Neon.tech** (cloud PostgreSQL)
- Completely separate from application servers
- Survives all deployments
- Backed up automatically by Neon

---

### ❌ **NOT PERSISTENT (Lost on Deployment)**

#### 1. **Uploaded Files** (Local Storage)
- ❌ **Company Logos**: Stored in `./uploads/` on server
- ❌ **Task Attachments**: Stored in `./uploads/{taskId}/` on server
- ❌ **Comment Images**: Stored in `./uploads/{taskId}/` on server
- ❌ **Profile Pictures**: Stored in `./uploads/` on server

**Why Lost**:
- Stored in **local filesystem** (`./uploads/`)
- Render uses **ephemeral storage** (temporary)
- Every deployment creates a **new container**
- Old container (with files) is **destroyed**

**Current Code** (backend/src/files/config/multer.config.ts):
```typescript
const uploadPath = configService.get<string>('UPLOAD_PATH', './uploads');
// ❌ This is local storage - will be lost on deployment
```

---

## The Problem

### **What Happens on Deployment**:

```
1. User uploads company logo → Saved to ./uploads/logo.png
2. Logo displays correctly ✅
3. New deployment happens 🚀
4. New container created (fresh filesystem)
5. Old container destroyed (./uploads/ deleted)
6. Logo link broken ❌
7. 404 error when trying to load logo
```

### **Impact**:

- ❌ Company logos disappear
- ❌ Task attachments disappear
- ❌ Comment images disappear
- ❌ All uploaded files disappear
- ❌ Database still has file paths, but files don't exist

---

## Solutions

### **Option 1: Cloud Storage (Recommended for Production)**

Use a cloud storage service like:
- **AWS S3** (most popular)
- **Cloudflare R2** (cheaper, S3-compatible)
- **Google Cloud Storage**
- **Azure Blob Storage**

#### **Benefits**:
- ✅ Files persist forever
- ✅ Fast CDN delivery
- ✅ Scalable
- ✅ Automatic backups
- ✅ Cost-effective

#### **Implementation** (AWS S3 Example):

**1. Install Dependencies**:
```bash
npm install @aws-sdk/client-s3 multer-s3
```

**2. Update `multer.config.ts`**:
```typescript
import { S3Client } from '@aws-sdk/client-s3';
import multerS3 from 'multer-s3';

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

export const multerConfig = (configService: ConfigService): MulterModuleOptions => {
  return {
    storage: multerS3({
      s3: s3,
      bucket: process.env.S3_BUCKET_NAME,
      acl: 'public-read',
      key: (req, file, cb) => {
        const taskId = req.params.taskId || 'general';
        const uniqueSuffix = `${uuidv4()}${extname(file.originalname)}`;
        cb(null, `${taskId}/${uniqueSuffix}`);
      },
    }),
    // ... rest of config
  };
};
```

**3. Add Environment Variables**:
```env
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
S3_BUCKET_NAME=your-bucket-name
```

**4. Update File URLs**:
```typescript
// Instead of: /api/files/public/filename.png
// Return: https://your-bucket.s3.amazonaws.com/filename.png
```

---

### **Option 2: Render Persistent Disks (Simpler, Render-Specific)**

Render offers persistent disks that survive deployments.

#### **Benefits**:
- ✅ Simple setup
- ✅ No external service needed
- ✅ Files persist across deployments

#### **Limitations**:
- ⚠️ Only works on Render
- ⚠️ Limited to one region
- ⚠️ Not as fast as CDN
- ⚠️ More expensive than S3 for large storage

#### **Implementation**:

**1. In Render Dashboard**:
- Go to your service
- Click "Disks" tab
- Click "Add Disk"
- Name: `uploads`
- Mount Path: `/app/uploads`
- Size: 10 GB (or as needed)

**2. Update Environment Variable**:
```env
UPLOAD_PATH=/app/uploads
```

**3. No Code Changes Needed**:
- Existing code will work
- Files will be stored in persistent disk
- Survives deployments ✅

---

### **Option 3: Database Storage (For Small Files)**

Store files as binary data in PostgreSQL.

#### **Benefits**:
- ✅ Simple - no external service
- ✅ Automatic backups with database
- ✅ Transactional consistency

#### **Limitations**:
- ⚠️ Not recommended for large files
- ⚠️ Slower than file storage
- ⚠️ Increases database size
- ⚠️ More expensive database costs

#### **Best For**:
- Company logos (small images)
- Profile pictures
- Icons and thumbnails

#### **Not Recommended For**:
- Task attachments (can be large)
- Documents
- Videos

#### **Implementation**:

**1. Update Prisma Schema**:
```prisma
model Company {
  // ... existing fields
  logoData  Bytes?  // Store logo as binary
  logoMime  String? // Store MIME type
}

model TaskFile {
  // ... existing fields
  fileData  Bytes?  // Store file as binary
  fileMime  String? // Store MIME type
}
```

**2. Update Upload Logic**:
```typescript
// Read file as buffer
const fileBuffer = await fs.readFile(file.path);

// Store in database
await prisma.company.update({
  where: { id },
  data: {
    logoData: fileBuffer,
    logoMime: file.mimetype,
  },
});
```

**3. Serve Files from Database**:
```typescript
@Get('logo/:companyId')
async getLogo(@Param('companyId') companyId: string, @Res() res: Response) {
  const company = await this.prisma.company.findUnique({
    where: { id: companyId },
    select: { logoData: true, logoMime: true },
  });
  
  res.setHeader('Content-Type', company.logoMime);
  res.send(company.logoData);
}
```

---

## Recommended Solution

### **For Your Use Case**:

**Hybrid Approach**:

1. **Company Logos** → Database Storage
   - Small files (< 1MB)
   - Critical for branding
   - Need to be highly available

2. **Task Attachments & Images** → Cloud Storage (S3/R2)
   - Can be large files
   - Need fast delivery
   - Cost-effective at scale

3. **Temporary Files** → Local Storage (OK to lose)
   - Processing files
   - Cache
   - Temporary exports

---

## Implementation Priority

### **Phase 1: Quick Fix (Render Persistent Disk)**

**Time**: 5 minutes  
**Complexity**: Very Low  
**Cost**: ~$5-10/month for 10GB

**Steps**:
1. Add persistent disk in Render dashboard
2. Update `UPLOAD_PATH` environment variable
3. Redeploy
4. ✅ Files will persist

**Pros**:
- ✅ Immediate fix
- ✅ No code changes
- ✅ Works right away

**Cons**:
- ⚠️ Vendor lock-in (Render only)
- ⚠️ Not as scalable as S3

---

### **Phase 2: Long-term Solution (Cloud Storage)**

**Time**: 2-3 hours  
**Complexity**: Medium  
**Cost**: ~$1-5/month for typical usage

**Steps**:
1. Create S3 bucket (or Cloudflare R2)
2. Install AWS SDK
3. Update multer config
4. Update file serving logic
5. Migrate existing files
6. Test thoroughly
7. Deploy

**Pros**:
- ✅ Scalable
- ✅ Fast (CDN)
- ✅ Cost-effective
- ✅ Industry standard
- ✅ No vendor lock-in

**Cons**:
- ⚠️ Requires external service
- ⚠️ More complex setup
- ⚠️ Need to manage credentials

---

## Migration Plan

### **If You Already Have Files**:

#### **Option A: Accept Data Loss** (Simplest)
1. Inform users that existing uploads will be lost
2. Implement persistent storage
3. Redeploy
4. Users re-upload files

#### **Option B: Migrate Files** (Recommended)
1. Export current files before deployment
2. Implement persistent storage
3. Deploy new version
4. Import files to new storage
5. Update database paths if needed

**Migration Script Example**:
```typescript
// scripts/migrate-files-to-s3.ts
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const s3 = new S3Client({ /* config */ });
const prisma = new PrismaClient();

async function migrateFiles() {
  const uploadDir = './uploads';
  
  // Get all files
  const files = getAllFiles(uploadDir);
  
  for (const file of files) {
    // Read file
    const fileBuffer = fs.readFileSync(file.path);
    
    // Upload to S3
    await s3.send(new PutObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: file.key,
      Body: fileBuffer,
    }));
    
    // Update database path
    await prisma.file.update({
      where: { path: file.oldPath },
      data: { path: file.newPath },
    });
    
    console.log(`Migrated: ${file.path}`);
  }
}
```

---

## Verification Checklist

### **After Implementing Persistent Storage**:

- [ ] Upload a company logo
- [ ] Verify logo displays correctly
- [ ] Trigger a deployment (or wait for next one)
- [ ] After deployment, verify logo still displays ✅
- [ ] Upload task attachment
- [ ] Verify attachment downloads correctly
- [ ] Trigger deployment
- [ ] After deployment, verify attachment still works ✅
- [ ] Check database for correct file paths
- [ ] Monitor storage costs
- [ ] Test file deletion (cleanup)

---

## Cost Comparison

### **Render Persistent Disk**:
- 10 GB: ~$10/month
- 50 GB: ~$50/month
- 100 GB: ~$100/month

### **AWS S3**:
- Storage: $0.023/GB/month (~$2.30 for 100GB)
- Requests: $0.005 per 1,000 GET requests
- Data Transfer: First 100GB free/month
- **Total for typical usage**: $1-5/month

### **Cloudflare R2** (Cheaper Alternative):
- Storage: $0.015/GB/month (~$1.50 for 100GB)
- No egress fees (free data transfer)
- **Total for typical usage**: $1-3/month

---

## Summary

| Storage Type | Persistent | Cost | Complexity | Recommended For |
|--------------|-----------|------|------------|-----------------|
| **Local Disk** | ❌ No | Free | Very Low | Development only |
| **Render Disk** | ✅ Yes | Medium | Very Low | Quick fix |
| **AWS S3** | ✅ Yes | Low | Medium | Production (best) |
| **Cloudflare R2** | ✅ Yes | Very Low | Medium | Production (cheaper) |
| **Database** | ✅ Yes | Medium | Low | Small files only |

---

## Immediate Action Required

### **Current Risk**:
⚠️ **HIGH** - All uploaded files are being lost on every deployment

### **Recommended Immediate Action**:

1. **Add Render Persistent Disk** (5 minutes)
   - Quick fix to stop data loss
   - No code changes needed
   - Works immediately

2. **Plan Migration to S3** (next sprint)
   - Better long-term solution
   - More scalable
   - Cost-effective

### **Steps to Add Render Persistent Disk NOW**:

1. Go to: https://dashboard.render.com
2. Select your backend service
3. Click "Disks" tab
4. Click "Add Disk"
5. Configure:
   - **Name**: `uploads`
   - **Mount Path**: `/app/uploads`
   - **Size**: `10 GB`
6. Click "Save"
7. Go to "Environment" tab
8. Update `UPLOAD_PATH` to `/app/uploads`
9. Click "Manual Deploy" → "Deploy latest commit"
10. ✅ Done! Files will now persist

---

**Date**: November 14, 2024  
**Status**: ⚠️ **ACTION REQUIRED** - Files currently not persistent  
**Priority**: 🔴 **HIGH** - Implement persistent storage immediately

