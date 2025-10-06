import { PrismaClient } from '@prisma/client';
import { UserRole, UserStatus } from '../src/types/prisma';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Clear all tables first
  await prisma.taskComment.deleteMany();
  await prisma.task.deleteMany();
  await prisma.analytics.deleteMany();
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
      allowedFileTypes: [
        'image/jpeg',
        'image/png', 
        'image/webp',
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ],
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

  // Create Analytics record for Super Admin
  await prisma.analytics.upsert({
    where: { userId: superAdmin.id },
    update: {},
    create: {
      userId: superAdmin.id,
      tasksAssigned: 0,
      tasksCompleted: 0,
      tasksInProgress: 0,
      interactions: 0,
      totalTimeSpent: 0,
    },
  });

  console.log('✅ Analytics record created for Super Admin');

  console.log('🎉 Database seeded successfully!');
  console.log('\n📋 Default Users:');
  console.log('Super Admin: admin@system.com / Admin123!');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
