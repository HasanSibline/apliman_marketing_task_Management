# 🚀 Complete Deployment Guide - AI-Powered Task Management System

This comprehensive guide will help you deploy the entire Task Management System to production, including the backend (NestJS), AI service (Python FastAPI), and frontend (React).

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [Environment Setup](#environment-setup)
3. [Database Setup](#database-setup)
4. [Backend Deployment (Render)](#backend-deployment-render)
5. [AI Service Deployment (Render)](#ai-service-deployment-render)
6. [Frontend Deployment (Cloudflare Pages)](#frontend-deployment-cloudflare-pages)
7. [Production Configuration](#production-configuration)
8. [Monitoring & Maintenance](#monitoring--maintenance)
9. [Troubleshooting](#troubleshooting)

## 🔧 Prerequisites

### Required Accounts
- **Render Account** (for backend & AI service) - [render.com](https://render.com)
- **Cloudflare Account** (for frontend) - [cloudflare.com](https://cloudflare.com)
- **GitHub Account** (for code repository)
- **PostgreSQL Database** (Render PostgreSQL or Supabase)

### Local Development Tools
- Node.js 18+ and npm
- Python 3.9+
- Git
- Docker (optional, for local testing)

## 🌍 Environment Setup

### 1. Create Environment Files

#### Backend Environment (`.env`)
```bash
# Database
DATABASE_URL="postgresql://username:password@host:port/database"

# JWT Configuration
JWT_SECRET="your-super-secure-jwt-secret-key-here"
JWT_EXPIRES_IN="7d"

# CORS Settings
CORS_ORIGIN="https://your-frontend-domain.pages.dev"

# AI Service
AI_SERVICE_URL="https://your-ai-service.onrender.com"

# File Upload
MAX_FILE_SIZE="5242880" # 5MB in bytes
UPLOAD_PATH="./uploads"

# Redis (optional, for caching)
REDIS_URL="redis://localhost:6379"

# Email (optional, for notifications)
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_USER="your-email@gmail.com"
SMTP_PASS="your-app-password"

# Production Settings
NODE_ENV="production"
PORT="3001"
```

#### AI Service Environment (`.env`)
```bash
# Model Configuration
MODEL_NAME="google/flan-t5-base"
MODEL_CACHE_DIR="./models"
MAX_LENGTH="512"

# API Configuration
API_HOST="0.0.0.0"
API_PORT="8000"

# CORS Settings
CORS_ORIGINS="https://your-backend.onrender.com,https://your-frontend.pages.dev"

# Performance
WORKERS="1"
TIMEOUT="300"

# Logging
LOG_LEVEL="INFO"

# Production Settings
ENVIRONMENT="production"
```

#### Frontend Environment (`.env`)
```bash
# API Configuration
VITE_API_URL="https://your-backend.onrender.com/api"
VITE_SOCKET_URL="https://your-backend.onrender.com"

# App Configuration
VITE_APP_NAME="Task Management System"
VITE_APP_VERSION="1.0.0"

# Analytics (optional)
VITE_ANALYTICS_ID="your-analytics-id"

# Production Settings
NODE_ENV="production"
```

## 🗄️ Database Setup

### Option 1: Render PostgreSQL (Recommended)

1. **Create Database on Render:**
   ```bash
   # Go to Render Dashboard > New > PostgreSQL
   # Choose plan (Free tier available)
   # Note down the connection details
   ```

2. **Database Configuration:**
   - **Name:** `taskmanagement-db`
   - **Database:** `taskmanagement`
   - **User:** Auto-generated
   - **Password:** Auto-generated
   - **Region:** Choose closest to your users

3. **Get Connection String:**
   ```bash
   # Format: postgresql://user:password@host:port/database
   # Example: postgresql://taskuser:abc123@dpg-xyz.oregon-postgres.render.com:5432/taskmanagement
   ```

### Option 2: Supabase (Alternative)

1. **Create Project:**
   ```bash
   # Go to supabase.com > New Project
   # Choose organization and region
   # Set database password
   ```

2. **Get Connection Details:**
   ```bash
   # Go to Settings > Database
   # Copy the connection string
   # Format: postgresql://postgres:password@host:port/postgres
   ```

### Database Migration

```bash
# Navigate to backend directory
cd backend

# Install dependencies
npm install

# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate deploy

# Seed database (optional)
npx prisma db seed
```

## 🔧 Backend Deployment (Render)

### 1. Prepare Repository

```bash
# Ensure your backend has these files:
backend/
├── Dockerfile
├── package.json
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── src/
└── .env.example
```

### 2. Create Render Web Service

1. **Connect Repository:**
   - Go to Render Dashboard > New > Web Service
   - Connect your GitHub repository
   - Select the repository containing your backend

2. **Configure Service:**
   ```yaml
   # Service Configuration
   Name: taskmanagement-backend
   Environment: Node
   Region: Oregon (US West) # Choose closest to your users
   Branch: main
   Root Directory: backend
   Build Command: npm install && npm run build
   Start Command: npm run start:prod
   ```

3. **Environment Variables:**
   ```bash
   # Add these in Render dashboard
   DATABASE_URL=postgresql://user:pass@host:port/db
   JWT_SECRET=your-jwt-secret
   JWT_EXPIRES_IN=7d
   CORS_ORIGIN=https://your-frontend.pages.dev
   AI_SERVICE_URL=https://your-ai-service.onrender.com
   NODE_ENV=production
   PORT=3001
   ```

4. **Health Check Configuration:**
   ```yaml
   Health Check Path: /api/health
   ```

### 3. Backend Dockerfile (if needed)

```dockerfile
# backend/Dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm ci --only=production

# Generate Prisma client
RUN npx prisma generate

# Copy source code
COPY . .

# Build application
RUN npm run build

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3001/api/health || exit 1

# Start application
CMD ["npm", "run", "start:prod"]
```

### 4. Deploy Backend

```bash
# Push to GitHub (triggers automatic deployment)
git add .
git commit -m "Deploy backend to Render"
git push origin main

# Monitor deployment in Render dashboard
# Check logs for any issues
```

## 🤖 AI Service Deployment (Render)

### 1. Prepare AI Service

```bash
# Ensure your ai-service has these files:
ai-service/
├── Dockerfile
├── requirements.txt
├── main.py
├── services/
└── .env.example
```

### 2. Create Render Web Service

1. **Service Configuration:**
   ```yaml
   Name: taskmanagement-ai
   Environment: Python
   Region: Oregon (US West)
   Branch: main
   Root Directory: ai-service
   Build Command: pip install -r requirements.txt
   Start Command: uvicorn main:app --host 0.0.0.0 --port $PORT
   ```

2. **Environment Variables:**
   ```bash
   MODEL_NAME=google/flan-t5-base
   MODEL_CACHE_DIR=./models
   MAX_LENGTH=512
   API_HOST=0.0.0.0
   API_PORT=$PORT
   CORS_ORIGINS=https://your-backend.onrender.com
   ENVIRONMENT=production
   LOG_LEVEL=INFO
   ```

### 3. AI Service Dockerfile

```dockerfile
# ai-service/Dockerfile
FROM python:3.9-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY . .

# Create models directory
RUN mkdir -p ./models

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:8000/health || exit 1

# Start application
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### 4. Optimize AI Service for Production

```python
# ai-service/main.py - Add production optimizations
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

app = FastAPI(
    title="Task Management AI Service",
    version="1.0.0",
    docs_url="/docs" if os.getenv("ENVIRONMENT") != "production" else None,
    redoc_url="/redoc" if os.getenv("ENVIRONMENT") != "production" else None
)

# Production CORS settings
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "").split(","),
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# Health check endpoint
@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "ai-service"}

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", 8000)),
        workers=1,  # Single worker for free tier
        log_level="info"
    )
```

## 🌐 Frontend Deployment (Cloudflare Pages)

### 1. Prepare Frontend

```bash
# Ensure your frontend has these files:
frontend/
├── package.json
├── vite.config.ts
├── index.html
├── src/
├── public/
└── .env.example
```

### 2. Build Configuration

```typescript
// frontend/vite.config.ts
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
    sourcemap: false, // Disable in production
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          router: ['react-router-dom'],
          redux: ['@reduxjs/toolkit', 'react-redux', 'redux-persist'],
          ui: ['@headlessui/react', '@heroicons/react', 'framer-motion'],
          charts: ['recharts'],
        },
      },
    },
  },
  server: {
    port: 5173,
    host: true,
  },
})
```

### 3. Deploy to Cloudflare Pages

1. **Connect Repository:**
   - Go to Cloudflare Dashboard > Pages
   - Connect to Git > Select your repository
   - Choose the frontend directory

2. **Build Configuration:**
   ```yaml
   Framework preset: Vite
   Build command: npm run build
   Build output directory: dist
   Root directory: frontend
   Node.js version: 18
   ```

3. **Environment Variables:**
   ```bash
   # Add in Cloudflare Pages settings
   VITE_API_URL=https://your-backend.onrender.com/api
   VITE_SOCKET_URL=https://your-backend.onrender.com
   VITE_APP_NAME=Task Management System
   NODE_ENV=production
   ```

4. **Custom Domain (Optional):**
   ```bash
   # In Cloudflare Pages > Custom domains
   # Add your domain: taskmanagement.yourdomain.com
   # Configure DNS records as instructed
   ```

### 4. Frontend Production Optimizations

```typescript
// frontend/src/services/api.ts - Production API configuration
const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://your-backend.onrender.com/api'

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000, // Increased timeout for production
  headers: {
    'Content-Type': 'application/json',
  },
})

// Add retry logic for production
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config
    
    if (error.response?.status === 503 && !originalRequest._retry) {
      originalRequest._retry = true
      // Wait 2 seconds and retry (for Render cold starts)
      await new Promise(resolve => setTimeout(resolve, 2000))
      return api(originalRequest)
    }
    
    return Promise.reject(error)
  }
)
```

## ⚙️ Production Configuration

### 1. Security Headers

```typescript
// backend/src/main.ts - Add security headers
import helmet from 'helmet'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  
  // Security headers
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
  }))
  
  // Rate limiting
  app.use(rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
  }))
  
  await app.listen(process.env.PORT || 3001)
}
```

### 2. Database Connection Pooling

```typescript
// backend/prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// Connection pooling for production
// Add to DATABASE_URL: ?connection_limit=5&pool_timeout=20
```

### 3. Logging Configuration

```typescript
// backend/src/main.ts - Production logging
import { Logger } from '@nestjs/common'

const logger = new Logger('Bootstrap')

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: process.env.NODE_ENV === 'production' 
      ? ['error', 'warn', 'log'] 
      : ['error', 'warn', 'log', 'debug', 'verbose']
  })
  
  logger.log(`Application is running on: ${await app.getUrl()}`)
}
```

### 4. Error Handling

```typescript
// backend/src/filters/http-exception.filter.ts
import { ExceptionFilter, Catch, ArgumentsHost, HttpException, Logger } from '@nestjs/common'

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name)

  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse()
    const request = ctx.getRequest()
    const status = exception.getStatus()

    // Log error in production
    if (process.env.NODE_ENV === 'production') {
      this.logger.error(
        `${request.method} ${request.url}`,
        exception.stack,
        'HttpExceptionFilter'
      )
    }

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message: exception.message,
    })
  }
}
```

## 📊 Monitoring & Maintenance

### 1. Health Checks

```typescript
// backend/src/health/health.controller.ts
import { Controller, Get } from '@nestjs/common'
import { HealthCheck, HealthCheckService, PrismaHealthIndicator } from '@nestjs/terminus'

@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private prisma: PrismaHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.prisma.pingCheck('database'),
    ])
  }
}
```

### 2. Performance Monitoring

```bash
# Add to package.json for monitoring
"scripts": {
  "monitor": "pm2 start ecosystem.config.js",
  "logs": "pm2 logs",
  "restart": "pm2 restart all"
}
```

### 3. Backup Strategy

```bash
# Database backup script (run daily)
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
pg_dump $DATABASE_URL > backup_$DATE.sql
# Upload to cloud storage (AWS S3, Google Cloud, etc.)
```

## 🔧 Troubleshooting

### Common Issues & Solutions

#### 1. Render Cold Starts
```bash
# Problem: 503 errors on first request
# Solution: Implement retry logic and keep-alive pings

# Add to frontend API service:
const keepAlive = setInterval(() => {
  fetch(`${API_BASE_URL}/health`).catch(() => {})
}, 14 * 60 * 1000) // Every 14 minutes
```

#### 2. Database Connection Issues
```bash
# Problem: Connection pool exhausted
# Solution: Optimize connection settings

# Add to DATABASE_URL:
?connection_limit=5&pool_timeout=20&connect_timeout=60
```

#### 3. AI Service Memory Issues
```python
# Problem: Out of memory errors
# Solution: Optimize model loading

import gc
import torch

def cleanup_memory():
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()

# Call after each prediction
```

#### 4. CORS Issues
```typescript
// Problem: CORS errors in production
// Solution: Proper CORS configuration

app.enableCors({
  origin: [
    'https://your-frontend.pages.dev',
    'https://your-custom-domain.com'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
})
```

### Deployment Checklist

- [ ] Database created and migrated
- [ ] Environment variables configured
- [ ] Backend deployed and healthy
- [ ] AI service deployed and responding
- [ ] Frontend built and deployed
- [ ] CORS configured correctly
- [ ] SSL certificates active
- [ ] Health checks passing
- [ ] Error monitoring setup
- [ ] Backup strategy implemented
- [ ] Performance monitoring active

### Support & Resources

- **Render Documentation:** [render.com/docs](https://render.com/docs)
- **Cloudflare Pages:** [developers.cloudflare.com/pages](https://developers.cloudflare.com/pages)
- **NestJS Deployment:** [docs.nestjs.com/deployment](https://docs.nestjs.com/deployment)
- **FastAPI Deployment:** [fastapi.tiangolo.com/deployment](https://fastapi.tiangolo.com/deployment)

---

## 🎉 Congratulations!

Your AI-Powered Task Management System is now deployed to production! 

**Live URLs:**
- **Frontend:** `https://your-app.pages.dev`
- **Backend API:** `https://your-backend.onrender.com/api`
- **AI Service:** `https://your-ai-service.onrender.com`

Remember to monitor your applications and update them regularly for security and performance improvements.
