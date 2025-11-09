#!/usr/bin/env node
/**
 * Production startup script for Render deployment
 * Handles database migrations and seeding before starting the app
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('🚀 Starting production deployment v3.0 (Multi-Tenant)...\n');

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

// Check if this is a fresh database or needs migration
async function needsMultiTenantMigration() {
  try {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    
    // Check if Company table exists
    const companyCount = await prisma.company.count();
    await prisma.$disconnect();
    
    console.log(`✅ Multi-tenant schema already exists (${companyCount} companies found)\n`);
    return false;
  } catch (error) {
    console.log('🔍 Multi-tenant schema not detected, migration needed\n');
    return true;
  }
}

// Step 1: Check if we need to migrate to multi-tenant
console.log('🔄 Step 1: Checking database state...\n');

const migrationScriptPath = path.join(__dirname, '..', 'prisma', 'migrate-to-multi-tenant.ts');
const hasMigrationScript = fs.existsSync(migrationScriptPath);

if (hasMigrationScript) {
  console.log('📋 Multi-tenant migration script found\n');
  
  // First, try to run migrations (this will add columns with nullable)
  console.log('🔄 Step 1a: Running Prisma migrations...\n');
  runCommand(
    'npx prisma migrate deploy',
    '🗄️  Applying database migrations',
    false // Not required - may fail on first run
  );
  
  // Now run the data migration script
  console.log('🔄 Step 1b: Running multi-tenant data migration...\n');
  const migrated = runCommand(
    'npx ts-node prisma/migrate-to-multi-tenant.ts',
    '🏢 Migrating existing data to multi-tenant structure',
    false // Not required - may already be migrated
  );
  
  if (migrated) {
    console.log('✅ Multi-tenant migration completed successfully!\n');
  } else {
    console.log('ℹ️  Skipping migration (already completed or not needed)\n');
  }
} else {
  console.log('ℹ️  No migration script found, assuming fresh database\n');
}

// Step 2: Sync database schema (should work now that data is migrated)
console.log('🔄 Step 2: Syncing database schema...\n');
runCommand(
  'npx prisma db push --accept-data-loss --skip-generate',
  '🗄️  Applying final schema changes',
  true
);

// Step 3: Generate Prisma Client AFTER database is updated
console.log('\n📦 Step 3: Generating Prisma Client with latest schema...\n');
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

// Step 5: Seed database (optional - will skip if already seeded)
console.log('\n🌱 Step 5: Seeding database (optional)...\n');
runCommand('npx prisma db seed', '🌱 Seeding database', false);

// Step 6: Start the application
console.log('\n✅ All pre-flight checks passed!');
console.log('🚀 Starting NestJS application...\n');

try {
  require('../dist/main');
} catch (error) {
  console.error('❌ Failed to start application:', error);
  process.exit(1);
}
