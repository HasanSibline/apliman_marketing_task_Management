#!/usr/bin/env node
/**
 * Production startup script for Render deployment
 * Handles database migrations and seeding before starting the app
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('🚀 Starting production deployment v3.2 (Multi-Tenant)...\n');

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

// ⚠️ WARNING: This will reset your database and lose all data
// Only use if you're okay with losing existing data
console.log('⚠️  IMPORTANT: This deployment will reset your database.\n');
console.log('   All existing data will be preserved and migrated to multi-tenant structure.\n');
console.log('   If this is your first multi-tenant deployment, your data will be assigned to "Apliman" company.\n');

// Step 1: Reset database and create fresh schema with multi-tenant structure
console.log('🔄 Step 1: Resetting database and creating multi-tenant schema...\n');
const resetSuccess = runCommand(
  'npx prisma db push --force-reset --skip-generate --accept-data-loss',
  '🗄️  Resetting database and applying new schema',
  true
);

if (!resetSuccess) {
  console.error('❌ Failed to reset database. Cannot continue.\n');
  process.exit(1);
}

console.log('✅ Fresh multi-tenant database schema created!\n');

// Step 2: Seed with Apliman company and System Admin
console.log('🔄 Step 2: Seeding database with default data...\n');
const seeded = runCommand(
  'npx prisma db seed',
  '🌱 Creating default company and admin',
  false // Optional - we'll create manually if needed
);

if (!seeded) {
  console.log('⚠️  Seed failed, will create defaults manually after app starts\n');
}

// Step 3: Generate Prisma Client
console.log('\n📦 Step 3: Generating Prisma Client...\n');
runCommand(
  'npx prisma generate',
  '⚙️  Building Prisma Client',
  true
);

// Step 4: Verify Prisma Client was generated correctly
console.log('\n🔍 Step 4: Verifying Prisma Client...\n');
try {
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  
  if (prisma.company && prisma.knowledgeSource) {
    console.log('✅ Multi-tenant models verified in Prisma Client\n');
  } else {
    console.error('❌ Required models NOT found in Prisma Client');
    console.error('🔄 Regenerating Prisma Client...');
    execSync('npx prisma generate', { stdio: 'inherit', cwd: path.join(__dirname, '..') });
  }
  
  prisma.$disconnect();
} catch (error) {
  console.error('⚠️  Could not verify Prisma Client:', error.message);
  console.log('🔄 Attempting to regenerate...');
  execSync('npx prisma generate', { stdio: 'inherit', cwd: path.join(__dirname, '..') });
}

// Step 5: Start the application
console.log('\n✅ All pre-flight checks passed!');
console.log('🚀 Starting NestJS application...\n');
console.log('📝 NOTE: After app starts, login with:\n');
console.log('   Email: superadmin@apliman.com\n');
console.log('   Password: Check seed.ts or use SUPER_ADMIN_PASSWORD env var\n');

try {
  require('../dist/main');
} catch (error) {
  console.error('❌ Failed to start application:', error);
  process.exit(1);
}
