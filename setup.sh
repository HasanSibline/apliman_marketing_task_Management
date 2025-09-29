#!/bin/bash

# AI-Powered Task Management System Setup Script
echo "🚀 Setting up AI-Powered Task Management System..."

# Check if Node.js is installed
if command -v node &> /dev/null; then
    echo "✅ Node.js version: $(node --version)"
else
    echo "❌ Node.js is not installed. Please install Node.js 18+ from https://nodejs.org/"
    exit 1
fi

# Check if Python is installed
if command -v python3 &> /dev/null; then
    echo "✅ Python version: $(python3 --version)"
elif command -v python &> /dev/null; then
    echo "✅ Python version: $(python --version)"
else
    echo "❌ Python is not installed. Please install Python 3.9+ from https://python.org/"
    exit 1
fi

# Install root dependencies
echo "📦 Installing root dependencies..."
npm install

# Install backend dependencies
echo "📦 Installing backend dependencies..."
cd backend
npm install

# Generate Prisma client
echo "🔧 Generating Prisma client..."
npx prisma generate

# Go back to root
cd ..

# Install frontend dependencies
echo "📦 Installing frontend dependencies..."
cd frontend
npm install

# Go back to root
cd ..

# Install AI service dependencies
echo "📦 Installing AI service dependencies..."
cd ai-service
if command -v python3 &> /dev/null; then
    pip3 install -r requirements.txt
else
    pip install -r requirements.txt
fi

# Go back to root
cd ..

echo "✅ Setup completed successfully!"
echo ""
echo "📋 Next steps:"
echo "1. Set up your PostgreSQL database"
echo "2. Copy backend/env.example to backend/.env and configure your database URL"
echo "3. Copy frontend/env.example to frontend/.env (optional)"
echo "4. Copy ai-service/env.example to ai-service/.env (optional)"
echo "5. Run database migrations: cd backend && npx prisma migrate dev"
echo "6. Seed the database: cd backend && npx prisma db seed"
echo "7. Start the development servers: npm run dev"
echo ""
echo "🌐 Application URLs:"
echo "Frontend: http://localhost:5173"
echo "Backend API: http://localhost:3001"
echo "AI Service: http://localhost:8001"
echo "API Documentation: http://localhost:3001/api/docs"
