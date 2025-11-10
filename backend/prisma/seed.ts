import { PrismaClient, UserRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed for Multi-Tenant System...');
  console.log('📋 This will create ONLY the System Administrator');
  console.log('📋 Companies must be created via Admin Panel\n');

  // Create system settings
  const systemSettings = await prisma.systemSettings.upsert({
    where: { id: 'default' },
    update: {},
    create: {
      id: 'default',
      maxFileSize: 5242880, // 5MB
      allowedFileTypes: 'image/jpeg,image/png,image/webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      sessionTimeout: 480, // 8 hours
    },
  });

  console.log('✅ System settings created');

  // Hash password for System Admin
  const saltRounds = 12;
  const adminPassword = process.env.SUPER_ADMIN_PASSWORD || 'SuperAdmin123!';
  const hashedPassword = await bcrypt.hash(adminPassword, saltRounds);

  // Create System Admin (NO company association)
  const superAdmin = await prisma.user.upsert({
    where: { 
      email_companyId: {
        email: 'superadmin@apliman.com',
        companyId: null, // Changed from empty string to null
      }
    },
    update: {},
    create: {
      email: 'superadmin@apliman.com',
      name: 'System Administrator',
      password: hashedPassword,
      role: UserRole.SUPER_ADMIN,
      position: 'System Administrator',
      status: UserStatus.ACTIVE,
      companyId: null, // System Admin has NO company
    },
  });

  console.log('✅ System Administrator created:', superAdmin.email);
  console.log('   Role: SUPER_ADMIN (manages all companies)');
  console.log('   Company: NONE (system-wide access)\n');

  console.log('🎉 Database seeded successfully!\n');
  console.log('═══════════════════════════════════════════════════');
  console.log('📋 SYSTEM ADMINISTRATOR CREDENTIALS:');
  console.log('═══════════════════════════════════════════════════');
  console.log(`   Email:    ${superAdmin.email}`);
  console.log(`   Password: ${process.env.SUPER_ADMIN_PASSWORD ? '[FROM ENV]' : 'SuperAdmin123!'}`);
  console.log('   Login at: /admin/login');
  console.log('═══════════════════════════════════════════════════\n');
  console.log('📝 NEXT STEPS:');
  console.log('   1. Login as System Administrator');
  console.log('   2. Go to /admin/companies');
  console.log('   3. Click "Create New Company"');
  console.log('   4. Fill in company details (name, slug, logo, etc.)');
  console.log('   5. Company users can login at /{company-slug}/login\n');
  console.log('⚠️  IMPORTANT: Change the default password immediately!');
  console.log('═══════════════════════════════════════════════════');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
