@echo off
REM Development startup script with environment variables
echo Starting Task Management Backend...
echo.

REM Set environment variables
set DATABASE_URL=postgresql://marketing_system_user:1vACneXxnqKAZR3eBNwNPrWl4s1ZXyLH@dpg-d3d7f7i4d50c73d560qg-a.oregon-postgres.render.com/marketing_system?sslmode=require
set JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
set JWT_EXPIRES_IN=7d
set AI_SERVICE_URL=http://localhost:8001
set UPLOAD_PATH=./uploads
set MAX_FILE_SIZE=5242880
set PORT=3001
set NODE_ENV=development
set FRONTEND_URL=http://localhost:5173
set SESSION_TIMEOUT=480

echo Environment variables set
echo Starting NestJS server...
echo.

npm run start:dev
