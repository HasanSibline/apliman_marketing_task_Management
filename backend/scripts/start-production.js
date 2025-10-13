#!/usr/bin/env node
/**
 * Production startup script for Render deployment
 * Handles database migrations and seeding before starting the app
 */

const { execSync } = require('child_process');
const path = require('path');

console.log('🚀 Starting production deployment...\n');

// Helper function to run commands
function runCommand(command, description, required = true) {
  try {
    console.log(`${description}...`);
    execSync(command, { stdio: 'inherit', cwd: path.join(__dirname, '..') });
    console.log(`✅ ${description} completed\n`);
    return true;
  } catch (error) {
    console.error(`⚠️  ${description} failed:`, error.message);
    if (required) {
      console.error('❌ Critical error, exiting...');
      process.exit(1);
    }
    return false;
  }
}

// Step 1: Generate Prisma Client
runCommand('npx prisma generate', '📦 Generating Prisma Client', true);

// Step 2: Run migrations (for production)
// This applies all migration files in the migrations folder
runCommand('npx prisma migrate deploy', '🔄 Running database migrations', true);

// Step 3: Seed database (optional - will skip if already seeded)
runCommand('npx prisma db seed', '🌱 Seeding database', false);

// Step 4: Start the application
console.log('✅ Starting NestJS application...\n');
try {
  require('../dist/main');
} catch (error) {
  console.error('❌ Failed to start application:', error);
  process.exit(1);
}

