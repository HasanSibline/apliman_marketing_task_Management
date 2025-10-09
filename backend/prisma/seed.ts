import { PrismaClient, UserRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { seedWorkflows } from './seeds/workflows.seed';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Clear all tables first (in correct order due to foreign keys)
  console.log('  Clearing existing data...');
  await prisma.phaseHistory.deleteMany();
  await prisma.subtask.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.taskComment.deleteMany();
  await prisma.taskFile.deleteMany();
  await prisma.taskAssignment.deleteMany();
  await prisma.task.deleteMany();
  await prisma.transition.deleteMany();
  await prisma.phase.deleteMany();
  await prisma.workflow.deleteMany();
  await prisma.user.deleteMany();
  await prisma.systemSettings.deleteMany();

  console.log('✅ All tables cleared');

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

  // Hash password for Super Admin
  const saltRounds = 12;
  const adminPassword = await bcrypt.hash('Admin123!', saltRounds);

  // Create Super Admin only
  const superAdmin = await prisma.user.upsert({
    where: { email: 'admin@system.com' },
    update: {},
    create: {
      email: 'admin@system.com',
      name: 'System Administrator',
      password: adminPassword,
      role: UserRole.SUPER_ADMIN,
      position: 'System Administrator',
      status: UserStatus.ACTIVE,
    },
  });

  console.log('✅ Super Admin created:', superAdmin.email);

  // Seed default workflows
  await seedWorkflows(superAdmin.id);

  console.log('🎉 Database seeded successfully!');
  console.log('\n📋 Default Users:');
  console.log('Super Admin: admin@system.com / Admin123!');
  console.log('\n📋 Default Workflows:');
  console.log('  - Social Media Workflow (SOCIAL_MEDIA_POST)');
  console.log('  - Video Production Workflow (VIDEO_CONTENT)');
  console.log('  - General Marketing Workflow (GENERAL)');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
