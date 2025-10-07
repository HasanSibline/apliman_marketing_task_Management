# Development startup script with environment variables
Write-Host "Starting Task Management Backend..." -ForegroundColor Cyan
Write-Host ""

# Set environment variables
$env:DATABASE_URL = "postgresql://marketing_system_user:1vACneXxnqKAZR3eBNwNPrWl4s1ZXyLH@dpg-d3d7f7i4d50c73d560qg-a.oregon-postgres.render.com/marketing_system?sslmode=require"
$env:JWT_SECRET = "your-super-secret-jwt-key-change-this-in-production"
$env:JWT_EXPIRES_IN = "7d"
$env:AI_SERVICE_URL = "http://localhost:8001"
$env:UPLOAD_PATH = "./uploads"
$env:MAX_FILE_SIZE = "5242880"
$env:PORT = "3001"
$env:NODE_ENV = "development"
$env:FRONTEND_URL = "http://localhost:5173"
$env:SESSION_TIMEOUT = "480"

Write-Host "✅ Environment variables set" -ForegroundColor Green
Write-Host "🚀 Starting NestJS server..." -ForegroundColor Cyan
Write-Host ""

npm run start:dev
