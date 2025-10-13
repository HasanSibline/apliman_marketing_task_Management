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

// Step 2: Database migration strategy
// First deployment: Use db push (database already exists from previous deployments)
// This will sync the schema without requiring migration history
console.log('🔄 Syncing database schema...');
const dbPushSuccess = runCommand('npx prisma db push --skip-generate', '🔄 Syncing database schema', false);

if (!dbPushSuccess) {
  // Fallback: Try migrate deploy (for future deployments with proper migration history)
  console.log('⚠️  DB push failed, trying migrate deploy...');
  runCommand('npx prisma migrate deploy', '🔄 Running database migrations', true);
}

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

