"""
Gunicorn configuration for AI Service on Render
"""
import multiprocessing
import os

# Server socket
bind = f"0.0.0.0:{os.getenv('PORT', '8001')}"
backlog = 2048

# Worker processes
worker_class = "uvicorn.workers.UvicornWorker"
workers = 1  # Single worker to save memory on Render free tier
worker_connections = 1000
max_requests = 1000
max_requests_jitter = 50

# Timeouts
timeout = 600  # 10 minutes for initial startup (heavy ML models)
graceful_timeout = 120
keepalive = 5

# Logging
accesslog = "-"  # Log to stdout
errorlog = "-"   # Log to stderr
loglevel = os.getenv("LOG_LEVEL", "info").lower()
access_log_format = '%(h)s %(l)s %(u)s %(t)s "%(r)s" %(s)s %(b)s "%(f)s" "%(a)s" %(D)s'

# Process naming
proc_name = "ai-service"

# Server mechanics
daemon = False
pidfile = None
umask = 0
user = None
group = None
tmp_upload_dir = None

# Preload app to speed up worker startup
preload_app = True

# Restart workers after this many requests (helps with memory leaks)
max_requests = 1000
max_requests_jitter = 50

def on_starting(server):
    """Called just before the master process is initialized."""
    server.log.info("🚀 Starting AI Service...")
    server.log.info(f"   Binding to: {bind}")
    server.log.info(f"   Workers: {workers}")
    server.log.info(f"   Timeout: {timeout}s")

def on_reload(server):
    """Called to recycle workers during a reload via SIGHUP."""
    server.log.info("🔄 Reloading AI Service...")

def when_ready(server):
    """Called just after the server is started."""
    server.log.info("✅ AI Service is ready to accept connections")

def worker_int(worker):
    """Called when a worker receives the SIGINT or SIGQUIT signal."""
    worker.log.info("⚠️  Worker received INT or QUIT signal")

def worker_abort(worker):
    """Called when a worker receives the SIGABRT signal."""
    worker.log.info("❌ Worker received ABORT signal")

