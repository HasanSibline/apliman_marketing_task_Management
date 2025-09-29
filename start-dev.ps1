# PowerShell script to start the development environment

Write-Host "🚀 Starting AI-Powered Task Management System..." -ForegroundColor Green

# Function to start backend
function Start-Backend {
    Write-Host "📦 Starting Backend..." -ForegroundColor Yellow
    Set-Location "backend"
    
    # Check if node_modules exists
    if (!(Test-Path "node_modules")) {
        Write-Host "Installing backend dependencies..." -ForegroundColor Cyan
        npm install
    }
    
    # Start backend in new window
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "npm run start:dev"
    Set-Location ".."
}

# Function to start frontend  
function Start-Frontend {
    Write-Host "🎨 Starting Frontend..." -ForegroundColor Yellow
    Set-Location "frontend"
    
    # Check if node_modules exists
    if (!(Test-Path "node_modules")) {
        Write-Host "Installing frontend dependencies..." -ForegroundColor Cyan
        npm install
    }
    
    # Start frontend in new window
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "npm run dev"
    Set-Location ".."
}

# Check if we're in the right directory
if (!(Test-Path "backend") -or !(Test-Path "frontend")) {
    Write-Host "❌ Please run this script from the project root directory" -ForegroundColor Red
    exit 1
}

# Start services
Start-Backend
Start-Sleep -Seconds 3
Start-Frontend

Write-Host "✅ Services starting..." -ForegroundColor Green
Write-Host "🌐 Frontend: http://localhost:5173" -ForegroundColor Cyan
Write-Host "🔧 Backend: http://localhost:3001/api" -ForegroundColor Cyan
Write-Host "📚 API Docs: http://localhost:3001/api/docs" -ForegroundColor Cyan

Write-Host "`n👥 Login Credentials:" -ForegroundColor Yellow
Write-Host "Super Admin: admin@system.com / Admin123!" -ForegroundColor White
Write-Host "Admin: manager@company.com / Manager123!" -ForegroundColor White  
Write-Host "Employee: employee@company.com / Employee123!" -ForegroundColor White

Write-Host "`nPress any key to exit..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
