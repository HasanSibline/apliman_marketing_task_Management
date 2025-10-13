# 🏠 Local Development Setup

## Quick Fix (Choose One)

### Option 1: Don't Run Backend Locally (Easiest)
Just work on frontend locally and use production backend:

1. **Frontend only**:
   ```bash
   cd frontend
   npm run dev
   ```

2. **Edit frontend `.env`** to point to production:
   ```
   VITE_API_URL=https://taskmanagement-backendv2.onrender.com/api
   ```

3. **That's it!** Frontend works, backend runs in production ✅

---

### Option 2: Install PostgreSQL Locally (Full Setup)

1. **Install PostgreSQL**:
   - Windows: Download from https://www.postgresql.org/download/windows/
   - Or use Docker: `docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres`

2. **Create database**:
   ```bash
   psql -U postgres
   CREATE DATABASE taskmanagement;
   \q
   ```

3. **Create `backend/.env` file** (manually):
   ```env
   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/taskmanagement"
   JWT_SECRET="local-dev-secret"
   JWT_EXPIRES_IN="7d"
   AI_SERVICE_URL="https://apliman-marketing-task-management.onrender.com"
   UPLOAD_PATH="./uploads"
   MAX_FILE_SIZE=5242880
   PORT=3001
   NODE_ENV="development"
   FRONTEND_URL="http://localhost:5173"
   SESSION_TIMEOUT=480
   ```

4. **Setup database**:
   ```bash
   cd backend
   npx prisma db push
   npx prisma db seed
   ```

5. **Start backend**:
   ```bash
   npm run start:dev
   ```

---

### Option 3: Use Render PostgreSQL (Cloud Development)

1. **Get production DATABASE_URL** from Render:
   - https://dashboard.render.com
   - `taskmanagement-backendv2` → Environment
   - Copy the `DATABASE_URL`

2. **Create `backend/.env`** with production URL:
   ```env
   DATABASE_URL="<paste_production_url_here>"
   # ... other vars from env.example
   ```

3. **⚠️ WARNING**: This connects to PRODUCTION database!
   - Don't run migrations locally
   - Read-only testing recommended

---

## Recommended: Option 1

Unless you're actively developing backend features, just use Option 1 and let the backend run in production.

**Current Status**:
- ✅ Production backend is working
- ✅ Production frontend is working  
- ✅ Knowledge Sources feature is deployed
- ❌ Local backend needs PostgreSQL

**You can test Knowledge Sources right now in production without setting up local dev!**

Go to: https://apliman-marketing-task-management.pages.dev

