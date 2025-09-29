# 🚀 Production Setup & Checklist

## 📋 Pre-Deployment Checklist

### 🔧 Development Environment
- [ ] **Node.js 18+** installed
- [ ] **Python 3.9+** installed  
- [ ] **Git** configured
- [ ] **Docker** installed (optional)
- [ ] All dependencies installed (`npm install` in backend/frontend, `pip install -r requirements.txt` in ai-service)

### 🗄️ Database Setup
- [ ] **PostgreSQL database** created (Render PostgreSQL or Supabase)
- [ ] **Connection string** obtained and tested
- [ ] **Prisma migrations** run successfully
- [ ] **Database seeded** with initial data (optional)
- [ ] **Backup strategy** planned

### 🔐 Security Configuration
- [ ] **JWT secrets** generated (use strong, random strings)
- [ ] **Environment variables** configured for all services
- [ ] **CORS origins** properly set
- [ ] **Rate limiting** configured
- [ ] **Input validation** implemented
- [ ] **SQL injection protection** verified (Prisma handles this)

## 🌍 Environment Variables Setup

### Backend (.env)
```bash
# Database
DATABASE_URL="postgresql://user:pass@host:port/database?connection_limit=5&pool_timeout=20"

# Authentication
JWT_SECRET="your-256-bit-secret-key-here"
JWT_EXPIRES_IN="7d"

# CORS & Security
CORS_ORIGIN="https://your-frontend.pages.dev"
RATE_LIMIT_WINDOW="15"
RATE_LIMIT_MAX="100"

# External Services
AI_SERVICE_URL="https://your-ai-service.onrender.com"

# File Upload
MAX_FILE_SIZE="5242880"
UPLOAD_PATH="./uploads"
ALLOWED_FILE_TYPES="jpg,jpeg,png,pdf,doc,docx,txt"

# Email (Optional)
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_USER="your-email@gmail.com"
SMTP_PASS="your-app-password"

# Production
NODE_ENV="production"
PORT="3001"
LOG_LEVEL="info"
```

### AI Service (.env)
```bash
# Model Configuration
MODEL_NAME="google/flan-t5-base"
MODEL_CACHE_DIR="./models"
MAX_LENGTH="512"
BATCH_SIZE="1"

# API Configuration
API_HOST="0.0.0.0"
API_PORT="8000"
WORKERS="1"
TIMEOUT="300"

# CORS
CORS_ORIGINS="https://your-backend.onrender.com,https://your-frontend.pages.dev"

# Performance
CACHE_ENABLED="true"
CACHE_TTL="3600"

# Production
ENVIRONMENT="production"
LOG_LEVEL="INFO"
```

### Frontend (.env)
```bash
# API Configuration
VITE_API_URL="https://your-backend.onrender.com/api"
VITE_SOCKET_URL="https://your-backend.onrender.com"

# App Configuration
VITE_APP_NAME="Task Management System"
VITE_APP_VERSION="1.0.0"
VITE_APP_DESCRIPTION="AI-Powered Task Management System"

# Features
VITE_ENABLE_ANALYTICS="true"
VITE_ENABLE_NOTIFICATIONS="true"
VITE_MAX_FILE_SIZE="5242880"

# Production
NODE_ENV="production"
```

## 🔧 Service-Specific Setup

### Backend Service Setup

#### 1. Package.json Scripts
```json
{
  "scripts": {
    "build": "nest build",
    "start": "node dist/main",
    "start:dev": "nest start --watch",
    "start:debug": "nest start --debug --watch",
    "start:prod": "node dist/main",
    "lint": "eslint \"{src,apps,libs,test}/**/*.ts\" --fix",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:cov": "jest --coverage",
    "test:debug": "node --inspect-brk -r tsconfig-paths/register -r ts-node/register node_modules/.bin/jest --runInBand",
    "test:e2e": "jest --config ./test/jest-e2e.json",
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate deploy",
    "prisma:seed": "prisma db seed",
    "prisma:studio": "prisma studio"
  }
}
```

#### 2. Prisma Configuration
```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String
  password  String
  role      Role     @default(EMPLOYEE)
  position  String?
  status    Status   @default(ACTIVE)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  // Relations
  createdTasks Task[] @relation("TaskCreator")
  assignedTasks Task[] @relation("TaskAssignee")
  comments     TaskComment[]
  analytics    Analytics[]

  @@map("users")
}

model Task {
  id          String    @id @default(cuid())
  title       String
  description String
  phase       TaskPhase @default(PENDING_APPROVAL)
  priority    Int       @default(1)
  goals       String?
  dueDate     DateTime?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  // Relations
  createdById  String
  createdBy    User @relation("TaskCreator", fields: [createdById], references: [id])
  assignedToId String?
  assignedTo   User? @relation("TaskAssignee", fields: [assignedToId], references: [id])
  
  files    TaskFile[]
  comments TaskComment[]

  @@map("tasks")
}

model TaskFile {
  id         String   @id @default(cuid())
  taskId     String
  fileName   String
  filePath   String
  fileType   String
  fileSize   Int
  uploadedAt DateTime @default(now())

  task Task @relation(fields: [taskId], references: [id], onDelete: Cascade)

  @@map("task_files")
}

model TaskComment {
  id        String   @id @default(cuid())
  taskId    String
  userId    String
  comment   String
  createdAt DateTime @default(now())

  task Task @relation(fields: [taskId], references: [id], onDelete: Cascade)
  user User @relation(fields: [userId], references: [id])

  @@map("task_comments")
}

model Analytics {
  id             String   @id @default(cuid())
  userId         String
  tasksAssigned  Int      @default(0)
  tasksCompleted Int      @default(0)
  interactions   Int      @default(0)
  lastActive     DateTime @default(now())
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  user User @relation(fields: [userId], references: [id])

  @@map("analytics")
}

enum Role {
  SUPER_ADMIN
  ADMIN
  EMPLOYEE
}

enum Status {
  ACTIVE
  AWAY
  OFFLINE
  RETIRED
}

enum TaskPhase {
  PENDING_APPROVAL
  APPROVED
  ASSIGNED
  IN_PROGRESS
  COMPLETED
  ARCHIVED
}
```

#### 3. Database Seed Script
```typescript
// prisma/seed.ts
import { PrismaClient, Role } from '@prisma/client'
import * as bcrypt from 'bcrypt'

const prisma = new PrismaClient()

async function main() {
  // Create Super Admin
  const hashedPassword = await bcrypt.hash('Admin123!', 10)
  
  const superAdmin = await prisma.user.upsert({
    where: { email: 'admin@system.com' },
    update: {},
    create: {
      email: 'admin@system.com',
      name: 'System Administrator',
      password: hashedPassword,
      role: Role.SUPER_ADMIN,
      position: 'System Administrator',
    },
  })

  // Create Admin
  const adminPassword = await bcrypt.hash('Manager123!', 10)
  
  const admin = await prisma.user.upsert({
    where: { email: 'manager@company.com' },
    update: {},
    create: {
      email: 'manager@company.com',
      name: 'Project Manager',
      password: adminPassword,
      role: Role.ADMIN,
      position: 'Project Manager',
    },
  })

  // Create Employee
  const employeePassword = await bcrypt.hash('Employee123!', 10)
  
  const employee = await prisma.user.upsert({
    where: { email: 'employee@company.com' },
    update: {},
    create: {
      email: 'employee@company.com',
      name: 'John Doe',
      password: employeePassword,
      role: Role.EMPLOYEE,
      position: 'Software Developer',
    },
  })

  console.log({ superAdmin, admin, employee })
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
```

### AI Service Setup

#### 1. Requirements.txt
```txt
fastapi==0.104.1
uvicorn[standard]==0.24.0
transformers==4.35.2
torch==2.1.1
tokenizers==0.15.0
pydantic==2.5.0
python-multipart==0.0.6
aiofiles==23.2.1
Pillow==10.1.0
pytesseract==0.3.10
python-dotenv==1.0.0
httpx==0.25.2
redis==5.0.1
```

#### 2. Main Application
```python
# main.py
import os
import logging
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from contextlib import asynccontextmanager
import uvicorn

from services.summarization import SummarizationService
from services.priority_analyzer import PriorityAnalyzer
from services.completeness_checker import CompletenessChecker
from services.performance_insights import PerformanceInsights

# Configure logging
logging.basicConfig(
    level=getattr(logging, os.getenv("LOG_LEVEL", "INFO")),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Global services
services = {}

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Starting AI Service...")
    
    # Initialize services
    services["summarization"] = SummarizationService()
    services["priority"] = PriorityAnalyzer()
    services["completeness"] = CompletenessChecker()
    services["insights"] = PerformanceInsights()
    
    logger.info("AI Service started successfully")
    yield
    
    # Shutdown
    logger.info("Shutting down AI Service...")

# Create FastAPI app
app = FastAPI(
    title="Task Management AI Service",
    description="AI-powered services for task management",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs" if os.getenv("ENVIRONMENT") != "production" else None,
    redoc_url="/redoc" if os.getenv("ENVIRONMENT") != "production" else None
)

# Add middleware
app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "").split(","),
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "ai-service",
        "version": "1.0.0"
    }

@app.post("/summarize")
async def summarize_text(request: dict):
    try:
        text = request.get("text", "")
        max_length = request.get("maxLength", 150)
        
        if not text:
            raise HTTPException(status_code=400, detail="Text is required")
        
        summary = await services["summarization"].summarize(text, max_length)
        return {"summary": summary}
    
    except Exception as e:
        logger.error(f"Summarization error: {str(e)}")
        raise HTTPException(status_code=500, detail="Summarization failed")

@app.post("/analyze-priority")
async def analyze_priority(request: dict):
    try:
        title = request.get("title", "")
        description = request.get("description", "")
        
        if not title or not description:
            raise HTTPException(status_code=400, detail="Title and description are required")
        
        priority = await services["priority"].analyze(title, description)
        return {"priority": priority}
    
    except Exception as e:
        logger.error(f"Priority analysis error: {str(e)}")
        raise HTTPException(status_code=500, detail="Priority analysis failed")

@app.post("/check-completeness")
async def check_completeness(request: dict):
    try:
        description = request.get("description", "")
        goals = request.get("goals", "")
        phase = request.get("phase", "")
        
        if not description:
            raise HTTPException(status_code=400, detail="Description is required")
        
        completeness = await services["completeness"].check(description, goals, phase)
        return {"completeness": completeness}
    
    except Exception as e:
        logger.error(f"Completeness check error: {str(e)}")
        raise HTTPException(status_code=500, detail="Completeness check failed")

@app.post("/performance-insights")
async def generate_insights(request: dict):
    try:
        analytics_data = request.get("analyticsData", {})
        
        if not analytics_data:
            raise HTTPException(status_code=400, detail="Analytics data is required")
        
        insights = await services["insights"].generate(analytics_data)
        return {"insights": insights}
    
    except Exception as e:
        logger.error(f"Insights generation error: {str(e)}")
        raise HTTPException(status_code=500, detail="Insights generation failed")

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host=os.getenv("API_HOST", "0.0.0.0"),
        port=int(os.getenv("API_PORT", 8000)),
        workers=int(os.getenv("WORKERS", 1)),
        log_level=os.getenv("LOG_LEVEL", "info").lower()
    )
```

### Frontend Setup

#### 1. Build Configuration
```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    minify: 'terser',
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          router: ['react-router-dom'],
          redux: ['@reduxjs/toolkit', 'react-redux', 'redux-persist'],
          ui: ['@headlessui/react', '@heroicons/react', 'framer-motion'],
          charts: ['recharts'],
          forms: ['react-hook-form', '@hookform/resolvers', 'yup'],
        },
      },
    },
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
```

#### 2. Production API Configuration
```typescript
// src/services/api.ts
import axios from 'axios'
import toast from 'react-hot-toast'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// Response interceptor with retry logic
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config
    
    // Handle 401 Unauthorized
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      window.location.href = '/login'
      return Promise.reject(error)
    }
    
    // Retry logic for 503 Service Unavailable (Render cold starts)
    if (error.response?.status === 503 && !originalRequest._retry) {
      originalRequest._retry = true
      await new Promise(resolve => setTimeout(resolve, 2000))
      return api(originalRequest)
    }
    
    // Handle 5xx errors
    if (error.response?.status >= 500) {
      toast.error('Server error. Please try again later.')
    }
    
    return Promise.reject(error)
  }
)

export default api
```

## 🚀 Deployment Steps

### 1. Backend Deployment (Render)
```bash
# 1. Push code to GitHub
git add .
git commit -m "Prepare backend for production"
git push origin main

# 2. Create Render Web Service
# - Connect GitHub repository
# - Set root directory: backend
# - Build command: npm install && npx prisma generate && npm run build
# - Start command: npm run start:prod

# 3. Add environment variables in Render dashboard
# 4. Deploy and monitor logs
```

### 2. AI Service Deployment (Render)
```bash
# 1. Create Render Web Service for AI
# - Root directory: ai-service
# - Build command: pip install -r requirements.txt
# - Start command: uvicorn main:app --host 0.0.0.0 --port $PORT

# 2. Configure environment variables
# 3. Deploy and test endpoints
```

### 3. Frontend Deployment (Cloudflare Pages)
```bash
# 1. Connect repository to Cloudflare Pages
# - Framework: Vite
# - Build command: npm run build
# - Build output: dist
# - Root directory: frontend

# 2. Configure environment variables
# 3. Deploy and test application
```

## ✅ Post-Deployment Verification

### Health Checks
- [ ] **Backend Health:** `GET https://your-backend.onrender.com/api/health`
- [ ] **AI Service Health:** `GET https://your-ai-service.onrender.com/health`
- [ ] **Frontend Loading:** Visit `https://your-app.pages.dev`
- [ ] **Database Connection:** Check backend logs for successful connection
- [ ] **Authentication:** Test login with demo credentials

### Functionality Tests
- [ ] **User Registration/Login** working
- [ ] **Task Creation** working
- [ ] **File Upload** working
- [ ] **AI Features** responding (summarization, priority analysis)
- [ ] **Real-time Updates** working (WebSocket connection)
- [ ] **Analytics Dashboard** loading data
- [ ] **Export Functionality** working

### Performance Tests
- [ ] **Page Load Times** < 3 seconds
- [ ] **API Response Times** < 2 seconds
- [ ] **AI Service Response** < 30 seconds
- [ ] **File Upload** working for files up to 5MB
- [ ] **Mobile Responsiveness** verified

### Security Verification
- [ ] **HTTPS** enabled on all services
- [ ] **CORS** properly configured
- [ ] **JWT Authentication** working
- [ ] **Rate Limiting** active
- [ ] **Input Validation** working
- [ ] **Error Messages** don't expose sensitive info

## 🔧 Troubleshooting Guide

### Common Issues

#### 1. Database Connection Errors
```bash
# Check connection string format
postgresql://user:password@host:port/database?connection_limit=5

# Verify database is accessible
npx prisma db pull

# Check migrations
npx prisma migrate status
```

#### 2. CORS Errors
```typescript
// Ensure CORS origins match exactly
CORS_ORIGIN="https://your-app.pages.dev"

// No trailing slashes
// Include both www and non-www if needed
```

#### 3. AI Service Timeouts
```python
# Increase timeout in production
TIMEOUT="300"

# Optimize model loading
# Use smaller models if needed
MODEL_NAME="google/flan-t5-small"
```

#### 4. Frontend Build Errors
```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install

# Check environment variables
npm run build
```

### Monitoring Commands
```bash
# Check service status
curl https://your-backend.onrender.com/api/health
curl https://your-ai-service.onrender.com/health

# Monitor logs (in Render dashboard)
# Check performance metrics
# Set up alerts for downtime
```

## 📊 Production Monitoring

### Key Metrics to Monitor
- **Response Times:** API < 2s, AI Service < 30s
- **Error Rates:** < 1% for critical endpoints
- **Uptime:** > 99.5%
- **Database Connections:** Monitor pool usage
- **Memory Usage:** AI service memory consumption
- **Disk Usage:** File upload storage

### Alerting Setup
```bash
# Set up alerts for:
# - Service downtime
# - High error rates
# - Slow response times
# - Database connection issues
# - High memory usage
```

## 🔄 Maintenance Schedule

### Daily
- [ ] Check service health
- [ ] Monitor error logs
- [ ] Verify backup completion

### Weekly
- [ ] Review performance metrics
- [ ] Check security updates
- [ ] Test critical functionality

### Monthly
- [ ] Update dependencies
- [ ] Review and rotate secrets
- [ ] Analyze usage patterns
- [ ] Plan capacity scaling

---

## 🎉 Success!

Your AI-Powered Task Management System is now live in production!

**Next Steps:**
1. Monitor the application for the first 24-48 hours
2. Gather user feedback
3. Plan feature enhancements
4. Set up regular maintenance schedule

**Support Resources:**
- Monitor service dashboards regularly
- Keep documentation updated
- Maintain backup and recovery procedures
- Plan for scaling as usage grows
