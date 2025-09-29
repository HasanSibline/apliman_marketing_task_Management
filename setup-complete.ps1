# AI-Powered Task Management System - Complete Setup Script (Windows PowerShell)
# This script sets up the entire project with all dependencies and configurations

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
    Write-Host "❌ Python is not installed. Please install Python 3.8+ from https://python.org/" -ForegroundColor Red
    exit 1
}

# Check if Docker is installed
try {
    $dockerVersion = docker --version
    Write-Host "✅ Docker version: $dockerVersion" -ForegroundColor Green
} catch {
    Write-Host "⚠️ Docker is not installed. Some features may not work. Install from https://docker.com/" -ForegroundColor Yellow
}

Write-Host "`n📦 Installing Backend Dependencies..." -ForegroundColor Blue
Set-Location backend
if (Test-Path "node_modules") {
    Remove-Item -Recurse -Force node_modules
}
if (Test-Path "package-lock.json") {
    Remove-Item -Force package-lock.json
}
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Backend dependency installation failed" -ForegroundColor Red
    exit 1
}

Write-Host "🔧 Generating Prisma Client..." -ForegroundColor Blue
npx prisma generate
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Prisma client generation failed" -ForegroundColor Red
    exit 1
}

Write-Host "`n📦 Installing Frontend Dependencies..." -ForegroundColor Blue
Set-Location ../frontend
if (Test-Path "node_modules") {
    Remove-Item -Recurse -Force node_modules
}
if (Test-Path "package-lock.json") {
    Remove-Item -Force package-lock.json
}
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Frontend dependency installation failed" -ForegroundColor Red
    exit 1
}

Write-Host "`n🐍 Setting up AI Service..." -ForegroundColor Blue
Set-Location ../ai-service
if (Test-Path "venv") {
    Remove-Item -Recurse -Force venv
}
python -m venv venv
& .\venv\Scripts\Activate.ps1
pip install --upgrade pip
pip install -r requirements.txt
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ AI service dependency installation failed" -ForegroundColor Red
    exit 1
}
deactivate

Write-Host "`n📄 Setting up Environment Files..." -ForegroundColor Blue
Set-Location ..

# Backend environment
if (-not (Test-Path "backend\.env")) {
    Copy-Item "backend\env.example" "backend\.env"
    Write-Host "✅ Created backend/.env from template" -ForegroundColor Green
    Write-Host "⚠️ Please update backend/.env with your database URL and JWT secret" -ForegroundColor Yellow
}

# Frontend environment
if (-not (Test-Path "frontend\.env")) {
    Copy-Item "frontend\env.example" "frontend\.env"
    Write-Host "✅ Created frontend/.env from template" -ForegroundColor Green
}

# AI service environment
if (-not (Test-Path "ai-service\.env")) {
    Copy-Item "ai-service\env.example" "ai-service\.env"
    Write-Host "✅ Created ai-service/.env from template" -ForegroundColor Green
}

Write-Host "`n🎉 Setup Complete!" -ForegroundColor Green
Write-Host "`nNext Steps:" -ForegroundColor Yellow
Write-Host "1. Update backend/.env with your PostgreSQL database URL" -ForegroundColor White
Write-Host "2. Run database migrations: cd backend && npx prisma migrate dev" -ForegroundColor White
Write-Host "3. Seed the database: cd backend && npx prisma db seed" -ForegroundColor White
Write-Host "4. Start the development servers:" -ForegroundColor White
Write-Host "   - Backend: cd backend && npm run start:dev" -ForegroundColor White
Write-Host "   - Frontend: cd frontend && npm run dev" -ForegroundColor White
Write-Host "   - AI Service: cd ai-service && python main.py" -ForegroundColor White
Write-Host "5. Or use Docker: docker-compose up" -ForegroundColor White

Write-Host "`n📚 Documentation:" -ForegroundColor Cyan
Write-Host "- README.md - Complete project documentation" -ForegroundColor White
Write-Host "- API Documentation: http://localhost:3001/api (when backend is running)" -ForegroundColor White
Write-Host "- Frontend: http://localhost:5173" -ForegroundColor White
Write-Host "- Backend API: http://localhost:3001" -ForegroundColor White
Write-Host "- AI Service: http://localhost:8000" -ForegroundColor White

Write-Host "`n🔧 Troubleshooting:" -ForegroundColor Magenta
Write-Host "- If you encounter TypeScript errors, restart your IDE" -ForegroundColor White
Write-Host "- For database issues, check your PostgreSQL connection" -ForegroundColor White
Write-Host "- For AI service issues, ensure Python dependencies are installed" -ForegroundColor White
Write-Host "- Check the logs in each service for detailed error messages" -ForegroundColor White

Write-Host "`n✨ Happy coding! ✨" -ForegroundColor Green
