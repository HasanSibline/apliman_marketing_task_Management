# AI-Powered Task Management System Setup Script
Write-Host "🚀 Setting up AI-Powered Task Management System..." -ForegroundColor Green

# Check if Node.js is installed
try {
    $nodeVersion = node --version
    Write-Host "✅ Node.js version: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Node.js is not installed. Please install Node.js 18+ from https://nodejs.org/" -ForegroundColor Red
    exit 1
}

# Check if Python is installed
try {
    $pythonVersion = python --version
    Write-Host "✅ Python version: $pythonVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Python is not installed. Please install Python 3.9+ from https://python.org/" -ForegroundColor Red
    exit 1
}

# Install root dependencies
Write-Host "📦 Installing root dependencies..." -ForegroundColor Yellow
npm install

# Install backend dependencies
Write-Host "📦 Installing backend dependencies..." -ForegroundColor Yellow
Set-Location backend
npm install

# Generate Prisma client
Write-Host "🔧 Generating Prisma client..." -ForegroundColor Yellow
npx prisma generate

# Go back to root
Set-Location ..

# Install frontend dependencies
Write-Host "📦 Installing frontend dependencies..." -ForegroundColor Yellow
Set-Location frontend
npm install

# Go back to root
Set-Location ..

# Install AI service dependencies
Write-Host "📦 Installing AI service dependencies..." -ForegroundColor Yellow
Set-Location ai-service
pip install -r requirements.txt

# Go back to root
Set-Location ..

Write-Host "✅ Setup completed successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Next steps:" -ForegroundColor Cyan
Write-Host "1. Set up your PostgreSQL database" -ForegroundColor White
Write-Host "2. Copy backend/env.example to backend/.env and configure your database URL" -ForegroundColor White
Write-Host "3. Copy frontend/env.example to frontend/.env (optional)" -ForegroundColor White
Write-Host "4. Copy ai-service/env.example to ai-service/.env (optional)" -ForegroundColor White
Write-Host "5. Run database migrations: cd backend && npx prisma migrate dev" -ForegroundColor White
Write-Host "6. Seed the database: cd backend && npx prisma db seed" -ForegroundColor White
Write-Host "7. Start the development servers: npm run dev" -ForegroundColor White
Write-Host ""
Write-Host "🌐 Application URLs:" -ForegroundColor Cyan
Write-Host "Frontend: http://localhost:5173" -ForegroundColor White
Write-Host "Backend API: http://localhost:3001" -ForegroundColor White
Write-Host "AI Service: http://localhost:8001" -ForegroundColor White
Write-Host "API Documentation: http://localhost:3001/api/docs" -ForegroundColor White
