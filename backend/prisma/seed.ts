import { PrismaClient } from '@prisma/client';
import { UserRole, UserStatus } from '../src/types/prisma';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

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

  // Hash passwords
  const saltRounds = 12;
  const adminPassword = await bcrypt.hash('Admin123!', saltRounds);
  const managerPassword = await bcrypt.hash('Manager123!', saltRounds);
  const employeePassword = await bcrypt.hash('Employee123!', saltRounds);

  // Clear all tables first
  await prisma.taskComment.deleteMany();
  await prisma.task.deleteMany();
  await prisma.analytics.deleteMany();
  await prisma.user.deleteMany();
  await prisma.systemSettings.deleteMany();

  console.log('✅ All tables cleared');

  // Create Super Admin
  const superAdmin = await prisma.user.upsert({
    where: { email: 'Admin@apliman.com' },
    update: {},
    create: {
      email: 'Admin@apliman.com',
      name: 'System Administrator',
      password: adminPassword,
      role: UserRole.SUPER_ADMIN,
      position: 'System Administrator',
      status: UserStatus.ACTIVE,
    },
  });

  console.log('✅ Super Admin created:', superAdmin.email);

  // Create Admin
  const admin = await prisma.user.upsert({
    where: { email: 'manager@company.com' },
    update: {},
    create: {
      email: 'manager@company.com',
      name: 'Project Manager',
      password: managerPassword,
      role: UserRole.ADMIN,
      position: 'Project Manager',
      status: UserStatus.ACTIVE,
    },
  });

  console.log('✅ Admin created:', admin.email);

  // Create Employee
  const employee = await prisma.user.upsert({
    where: { email: 'employee@company.com' },
    update: {},
    create: {
      email: 'employee@company.com',
      name: 'John Employee',
      password: employeePassword,
      role: UserRole.EMPLOYEE,
      position: 'Software Developer',
      status: UserStatus.ACTIVE,
    },
  });

  console.log('✅ Employee created:', employee.email);

  // Create Analytics records for users
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

  await prisma.analytics.upsert({
    where: { userId: admin.id },
    update: {},
    create: {
      userId: admin.id,
      tasksAssigned: 0,
      tasksCompleted: 0,
      tasksInProgress: 0,
      interactions: 0,
      totalTimeSpent: 0,
    },
  });

  await prisma.analytics.upsert({
    where: { userId: employee.id },
    update: {},
    create: {
      userId: employee.id,
      tasksAssigned: 0,
      tasksCompleted: 0,
      tasksInProgress: 0,
      interactions: 0,
      totalTimeSpent: 0,
    },
  });

  console.log('✅ Analytics records created');

  // Create sample tasks
  const sampleTask1 = await prisma.task.create({
    data: {
      title: 'Setup Development Environment',
      description: 'Configure the development environment for the new project including IDE setup, dependencies installation, and database configuration.',
      phase: 'ASSIGNED',
      goals: 'Complete environment setup within 2 days with all required tools and dependencies working properly.',
      priority: 3,
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
      createdById: admin.id,
      assignedToId: employee.id,
    },
  });

  const sampleTask2 = await prisma.task.create({
    data: {
      title: 'Code Review Process Documentation',
      description: 'Create comprehensive documentation for the code review process including guidelines, checklists, and best practices.',
      phase: 'PENDING_APPROVAL',
      goals: 'Establish clear code review standards to improve code quality and team collaboration.',
      priority: 2,
      createdById: admin.id,
    },
  });

  console.log('✅ Sample tasks created');

  // Create sample comments
  await prisma.taskComment.create({
    data: {
      taskId: sampleTask1.id,
      userId: admin.id,
      comment: 'Please make sure to include Docker setup in your environment configuration.',
    },
  });

  await prisma.taskComment.create({
    data: {
      taskId: sampleTask1.id,
      userId: employee.id,
      comment: 'Understood. I will include Docker and document the setup process.',
    },
  });

  console.log('✅ Sample comments created');

  console.log('🎉 Database seeded successfully!');
  console.log('\n📋 Default Users:');
  console.log('Super Admin: admin@system.com / Admin123!');
  console.log('Admin: manager@company.com / Manager123!');
  console.log('Employee: employee@company.com / Employee123!');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
