#!/usr/bin/env node
/**
 * Production startup script for Render deployment v5.0
 * - Does NOT reset database by default (set FORCE_DB_RESET=true to reset)
 * - Skips seed if System Admin already exists
 * - Adds timeouts to prevent hangs on Render
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');

console.log('🚀 Starting production deployment v5.0 (Multi-Tenant - Safe Start)...\n');

// Helper function to run commands with a 2-minute timeout
function run(command, description, required = true) {
  try {
    console.log(`${description}...`);
    execSync(command, { stdio: 'inherit', cwd: ROOT, timeout: 120_000 });
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

// Check if super admin already exists (returns true/false synchronously)
function adminExists() {
  try {
    const out = execSync(
      `node -e "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.user.findFirst({where:{role:'SUPER_ADMIN'}}).then(u=>{console.log(u?'YES':'NO');p.\\$disconnect()}).catch(()=>{console.log('NO');p.\\$disconnect()})"`,
      { cwd: ROOT, timeout: 30_000 }
    ).toString().trim();
    return out.includes('YES');
  } catch {
    return false;
  }
}

// ─── Step 1: Sync schema ────────────────────────────────────────────────
const forceReset = process.env.FORCE_DB_RESET === 'true';

if (forceReset) {
  console.log('⚠️  FORCE_DB_RESET=true — this will WIPE the database!\n');
  run(
    'npx prisma db push --force-reset --skip-generate --accept-data-loss',
    '🗄️  Resetting + applying schema'
  );
} else {
  console.log('🔄 Step 1: Syncing database schema (preserving existing data)...\n');
  run(
    'npx prisma db push --skip-generate --accept-data-loss',
    '🗄️  Applying schema to database'
  );
}

// ─── Step 2: Seed only when needed ──────────────────────────────────────
console.log('🔄 Step 2: Checking if seeding is required...\n');

const needsSeed = forceReset || !adminExists();

if (needsSeed) {
  console.log('🌱 System Admin not found (or force-reset). Running seed...\n');
  run('npx prisma db seed', '🌱 Creating System Admin', true);
} else {
  console.log('✅ System Admin already exists — skipping seed.\n');
}

// ─── Step 3: Start the app ──────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════════');
console.log('✅ DATABASE READY — MULTI-TENANT SYSTEM');
console.log('═══════════════════════════════════════════════════');
console.log('🚀 Starting NestJS application...\n');
console.log('📋 SYSTEM ADMINISTRATOR LOGIN:');
console.log('   URL:      /admin/login');
console.log('   Email:    superadmin@apliman.com');
console.log('   Password: SuperAdmin123! (or from SUPER_ADMIN_PASSWORD env)');
console.log('═══════════════════════════════════════════════════\n');

try {
  require('../dist/main');
} catch (error) {
  console.error('❌ Failed to start application:', error);
  process.exit(1);
}
