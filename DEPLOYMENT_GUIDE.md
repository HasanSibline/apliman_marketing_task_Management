# 🚀 Production Deployment Guide - PostgreSQL Edition

## Overview

Your application is deployed across three services:
- **Frontend**: Cloudflare Pages - https://apliman-marketing-task-management.pages.dev
- **Backend**: Render Web Service (PostgreSQL) - https://taskmanagement-backendv2.onrender.com
- **AI Service**: Render Web Service - https://apliman-marketing-task-management.onrender.com

## 📊 Database Configuration

This app uses **PostgreSQL** in production (Render automatically provisions this).

### Important Changes Made:

1. ✅ Updated `schema.prisma` from SQLite to PostgreSQL
2. ✅ Changed array fields from JSON strings to native PostgreSQL arrays
3. ✅ Updated startup script to use `prisma migrate deploy` instead of `db push`

## 🔧 Environment Variables Setup

### 1. Backend (Render Dashboard)

Go to: https://dashboard.render.com → taskmanagement-backendv2 → Environment

**Render automatically sets `DATABASE_URL` for PostgreSQL** - Don't override it!

Add/Update these variables:

```bash
AI_SERVICE_URL=https://apliman-marketing-task-management.onrender.com
FRONTEND_URL=https://apliman-marketing-task-management.pages.dev
NODE_ENV=production
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=7d
UPLOAD_PATH=./uploads
MAX_FILE_SIZE=5242880
PORT=3001
SESSION_TIMEOUT=480
```

**Important**: The `DATABASE_URL` is automatically managed by Render for SQLite, so don't change it.

### 2. AI Service (Render Dashboard)

Go to: https://dashboard.render.com → apliman-marketing-task-management → Environment

Ensure this variable exists:

```bash
GOOGLE_API_KEY=AIzaSyBlMmpWp0EeZnb4D0NECDeP073DPGodhso
```

### 3. Frontend (Cloudflare Pages Dashboard)

Go to: Cloudflare Dashboard → Pages → apliman-marketing-task-management → Settings → Environment Variables

Add these **Production** environment variables:

```bash
VITE_API_URL=https://taskmanagement-backendv2.onrender.com/api
```

## 📝 What Changed in This Update

### Fixed Issues:

1. **TypeScript Build Errors** ✅
   - Fixed optional chaining for `task.phase` in TaskDetailPage
   - Fixed phase display in TasksPage
   - Removed unused PencilIcon import

2. **Database Initialization** ✅
   - Created `scripts/start-production.js` that automatically:
     - Generates Prisma Client
     - Pushes database schema
     - Seeds database on first run
     - Starts the application

3. **Production Startup** ✅
   - Updated `package.json` to use the new startup script
   - Handles database initialization gracefully

## 🚀 Deployment Steps

1. **Commit and Push Changes:**
   ```bash
   git add .
   git commit -m "Fix production deployment: database init + TypeScript errors"
   git push origin main
   ```

2. **Automatic Deployments:**
   - ✅ Cloudflare Pages will auto-deploy frontend
   - ✅ Render Backend will auto-deploy and run database setup
   - ✅ Render AI Service is already deployed

3. **Verify Deployments:**
   - Check Render logs for successful database seeding
   - Test login at your production URL
   - Test AI content generation

## 🐛 Troubleshooting

### Backend 500 Error on Login

**Cause**: Database not initialized or seeded properly

**Solution**: 
- Check Render logs for the backend deployment
- Look for "🌱 Seeding database" messages
- If seeding failed, manually trigger it:
  1. Go to Render Dashboard → Shell
  2. Run: `npm run prisma:seed`

### Frontend Not Connecting to Backend

**Cause**: `VITE_API_URL` not set correctly

**Solution**:
- Verify in Cloudflare Pages settings
- Must be: `https://taskmanagement-backendv2.onrender.com/api`
- Redeploy frontend after setting

### AI Service Not Responding

**Cause**: `GOOGLE_API_KEY` not set

**Solution**:
- Check Render AI Service environment variables
- Ensure the key is set and valid
- Restart the AI service

### CORS Errors

**Cause**: `FRONTEND_URL` in backend doesn't match actual frontend URL

**Solution**:
- Update backend `FRONTEND_URL` to match your Cloudflare Pages URL
- Redeploy backend

## 📊 Monitoring

### Health Check Endpoints

- **Backend**: https://taskmanagement-backendv2.onrender.com/api/health
- **AI Service**: https://apliman-marketing-task-management.onrender.com/health

### Expected Responses

**Backend Health:**
```json
{
  "status": "ok",
  "timestamp": "2025-10-09T...",
  "database": "connected"
}
```

**AI Service Health:**
```json
{
  "status": "healthy",
  "ai_provider": "gemini",
  "gemini_status": "connected",
  "api_key_configured": true
}
```

## 🔐 Security Checklist

- [ ] Changed default JWT_SECRET
- [ ] GOOGLE_API_KEY is set and private
- [ ] CORS configured correctly (FRONTEND_URL)
- [ ] Environment variables are NOT committed to git
- [ ] Database is backed up (if using PostgreSQL)

## 📈 Performance Tips

1. **Enable Render Persistent Disk** (if on paid plan) for SQLite
2. **Consider PostgreSQL** for production instead of SQLite
3. **Monitor Render metrics** for response times
4. **Use Cloudflare caching** for static assets

## 🆘 Support

If you encounter issues:

1. Check Render deployment logs
2. Check Cloudflare Pages deployment logs  
3. Test health endpoints
4. Verify environment variables are set correctly
5. Check browser console for frontend errors

## 🎉 Success Criteria

Your deployment is successful when:

- ✅ Frontend loads at Cloudflare Pages URL
- ✅ You can log in successfully
- ✅ Tasks can be created
- ✅ AI content generation works (shows "AI Generated" not "Fallback")
- ✅ No console errors in browser
- ✅ Backend health check returns "ok"
- ✅ AI service health check shows "gemini connected"
