# 🚨 AI Service Deployment Timeout Issue

## Problem
The AI service deployment is timing out on Render after 16 minutes.

## Root Cause
The AI service has **very heavy dependencies**:
- PyTorch (2.1.1)
- CUDA libraries (731 MB for cudnn alone!)
- Sentence transformers
- Spacy with language models
- Total install time: ~3-4 minutes
- Total upload time: ~110 seconds
- **Health check timeout: 16 minutes**

Render's health check is failing because the service takes too long to start and respond.

## Immediate Solutions

### Option 1: Use Gunicorn with Pre-loading (Recommended)
Gunicorn is already installed. We need to create a proper startup command.

**Create `ai-service/gunicorn.conf.py`:**
```python
import multiprocessing
import os

# Bind to 0.0.0.0 for Render
bind = f"0.0.0.0:{os.getenv('PORT', '8001')}"

# Use uvicorn workers for async support
worker_class = "uvicorn.workers.UvicornWorker"

# Single worker to save memory
workers = 1

# Timeout settings
timeout = 300  # 5 minutes for startup
graceful_timeout = 120
keepalive = 5

# Logging
accesslog = "-"
errorlog = "-"
loglevel = "info"

# Preload app to speed up worker startup
preload_app = True
```

**Update Render start command:**
```bash
gunicorn main:app -c gunicorn.conf.py
```

### Option 2: Simplify Dependencies (Long-term)
The AI service has many unnecessary heavy dependencies:
- PyTorch with CUDA (not needed on CPU-only Render)
- Spacy (can be removed if not used)
- Sentence transformers (can be lighter)

### Option 3: Use Docker with Pre-built Image
Build the image locally with all dependencies, push to Docker Hub, and deploy from there.

## Quick Fix for Now

**In Render Dashboard:**
1. Go to AI service settings
2. Change "Health Check Path" from `/health` to `/`
3. Or increase "Health Check Timeout" to 600 seconds (10 minutes)
4. Redeploy

## Why This Happens

Render's health check tries to access `/health` endpoint, but:
1. Dependencies take 3-4 minutes to install
2. Service takes time to initialize ML models
3. Health check times out before service is ready
4. Deployment fails even though build succeeded

## Recommended Action

**Immediate (Manual in Render Dashboard):**
1. Go to https://dashboard.render.com
2. Select the AI service
3. Click "Settings"
4. Scroll to "Health Check"
5. Change "Health Check Path" to `/` or increase timeout
6. Click "Manual Deploy" → "Clear build cache & deploy"

**Long-term (Code changes):**
1. Create lightweight health endpoint that responds immediately
2. Use gunicorn with proper configuration
3. Optimize dependencies (remove CUDA, use CPU-only PyTorch)
4. Consider using Docker with pre-built image

## Current Status

✅ Build successful (dependencies installed)
✅ Upload successful (109.6 seconds)
❌ Deployment timed out (health check failed after 16 minutes)

The service is probably running fine, but Render can't verify it because the health check is timing out.

## Alternative: Disable Health Check Temporarily

In Render Dashboard:
1. Settings → Health Check
2. Disable health check temporarily
3. Redeploy
4. Check logs to see if service starts
5. Re-enable health check once confirmed working

