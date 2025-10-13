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

// Step 1: Sync database schema first (handles existing databases)
console.log('🔄 Step 1: Syncing database schema...\n');
runCommand(
  'npx prisma db push --accept-data-loss --skip-generate', 
  '🗄️  Applying schema changes to database', 
  true
);

// Step 2: Generate Prisma Client AFTER database is updated
console.log('\n📦 Step 2: Generating Prisma Client with latest schema...\n');
runCommand(
  'npx prisma generate', 
  '⚙️  Building Prisma Client', 
  true
);

// Step 3: Verify Prisma Client was generated correctly
console.log('\n🔍 Step 3: Verifying Prisma Client...\n');
try {
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  
  if (prisma.knowledgeSource) {
    console.log('✅ KnowledgeSource model verified in Prisma Client\n');
  } else {
    console.error('❌ KnowledgeSource model NOT found in Prisma Client');
    console.error('🔄 Regenerating Prisma Client...');
    execSync('npx prisma generate', { stdio: 'inherit', cwd: path.join(__dirname, '..') });
  }
  
  prisma.$disconnect();
} catch (error) {
  console.error('⚠️  Could not verify Prisma Client:', error.message);
  console.log('🔄 Attempting to regenerate...');
  execSync('npx prisma generate', { stdio: 'inherit', cwd: path.join(__dirname, '..') });
}

// Step 4: Seed database (optional - will skip if already seeded)
console.log('\n🌱 Step 4: Seeding database (optional)...\n');
runCommand('npx prisma db seed', '🌱 Seeding database', false);

// Step 5: Start the application
console.log('\n✅ All pre-flight checks passed!');
console.log('🚀 Starting NestJS application...\n');

try {
  require('../dist/main');
} catch (error) {
  console.error('❌ Failed to start application:', error);
  process.exit(1);
}
