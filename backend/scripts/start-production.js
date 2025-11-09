#!/usr/bin/env node
/**
 * Production startup script for Render deployment
 * Handles database migrations and seeding before starting the app
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('🚀 Starting production deployment v4.0 (Multi-Tenant - Clean Start)...\n');

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

// ⚠️ WARNING: This will reset your database
console.log('⚠️  IMPORTANT: This deployment will create a fresh database.\n');
console.log('   NO default company will be created.');
console.log('   System Admin must create companies via Admin Panel.\n');

// Step 1: Reset database and create fresh schema
console.log('🔄 Step 1: Creating fresh multi-tenant database...\n');
const resetSuccess = runCommand(
  'npx prisma db push --force-reset --skip-generate --accept-data-loss',
  '🗄️  Applying schema to database',
  true
);

if (!resetSuccess) {
  console.error('❌ Failed to apply schema. Cannot continue.\n');
  process.exit(1);
}

console.log('✅ Multi-tenant database schema applied!\n');

// Step 2: Seed with System Admin ONLY
console.log('🔄 Step 2: Creating System Administrator...\n');
const seeded = runCommand(
  'npx prisma db seed',
  '🌱 Creating System Admin',
  true // Required - we need the admin
);

if (!seeded) {
  console.error('❌ Failed to create System Admin. Cannot continue.\n');
  process.exit(1);
}

// Step 3: Generate Prisma Client
console.log('\n📦 Step 3: Generating Prisma Client...\n');
runCommand(
  'npx prisma generate',
  '⚙️  Building Prisma Client',
  true
);

// Step 4: Verify Prisma Client
console.log('\n🔍 Step 4: Verifying Prisma Client...\n');
try {
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  
  if (prisma.company && prisma.user) {
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
console.log('\n═══════════════════════════════════════════════════');
console.log('✅ DATABASE READY - MULTI-TENANT SYSTEM');
console.log('═══════════════════════════════════════════════════');
console.log('🚀 Starting NestJS application...\n');
console.log('📋 SYSTEM ADMINISTRATOR LOGIN:');
console.log('   URL:      /admin/login');
console.log('   Email:    superadmin@apliman.com');
console.log('   Password: SuperAdmin123! (or from SUPER_ADMIN_PASSWORD env)');
console.log('\n📝 NEXT STEPS AFTER APP STARTS:');
console.log('   1. Login as System Administrator');
console.log('   2. Go to /admin/companies');
console.log('   3. Create your first company (e.g., Apliman)');
console.log('   4. Add company admin user');
console.log('   5. Company users login at /{company-slug}/login');
console.log('═══════════════════════════════════════════════════\n');

try {
  require('../dist/main');
} catch (error) {
  console.error('❌ Failed to start application:', error);
  process.exit(1);
}
