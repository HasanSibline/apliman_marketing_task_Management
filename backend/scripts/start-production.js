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

// ─── Step 1: Apply schema ───────────────────────────────────────────────
//
// This used to run `prisma db push --accept-data-loss` on every boot. That flag
// performs destructive changes without asking, so a column removed from
// schema.prisma was silently dropped from production along with its data. It also
// meant migration SQL never ran, so any data fix written inside a migration was a
// no-op in production.
//
// The database was built with db push and has no migration history, so a plain
// `migrate deploy` fails with P3005. On the first run we baseline instead: the
// schema is already in sync from previous pushes, so every migration in the folder
// has effectively been applied and is recorded as such. After that, every deploy is
// an ordinary `migrate deploy`.

const forceReset = process.env.FORCE_DB_RESET === 'true';

function migrationNames() {
  const dir = path.join(ROOT, 'prisma', 'migrations');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(dir, e.name, 'migration.sql')))
    .map((e) => e.name)
    .sort();
}

function hasMigrationHistory() {
  try {
    const script =
      "const{PrismaClient}=require('@prisma/client');" +
      'const p=new PrismaClient();' +
      "p.$queryRawUnsafe('SELECT count(*)::int AS n FROM _prisma_migrations WHERE finished_at IS NOT NULL')" +
      ".then(r=>{console.log('COUNT:'+r[0].n);return p.$disconnect()})" +
      ".catch(()=>{console.log('COUNT:-1');return p.$disconnect()});";
    const out = execSync(`node -e ${JSON.stringify(script)}`, { cwd: ROOT, timeout: 30_000 }).toString();
    const m = out.match(/COUNT:(-?\d+)/);
    return m ? parseInt(m[1], 10) > 0 : false;
  } catch {
    return false;
  }
}

if (forceReset) {
  console.log('⚠️  FORCE_DB_RESET=true — this will WIPE the database!');
  run(
    'npx prisma db push --force-reset --skip-generate --accept-data-loss',
    '🗄️  Resetting + applying schema'
  );
} else {
  console.log('🔄 Step 1: Applying database migrations...');

  if (!hasMigrationHistory()) {
    console.log('   No migration history found. Baselining this database once.');

    // No --accept-data-loss here on purpose: this REFUSES a destructive change
    // rather than performing it, so a deploy that would drop a column now fails
    // loudly instead of losing data quietly.
    run('npx prisma db push --skip-generate', '🗄️  Syncing schema before baseline');

    for (const name of migrationNames()) {
      // Already-recorded migrations answer P3008, which is expected, so this step
      // is not allowed to abort the boot.
      run(`npx prisma migrate resolve --applied ${name}`, `   Baselining ${name}`, false);
    }
  }

  run('npx prisma migrate deploy', '🗄️  Applying migrations');
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
