import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function migrateToMultiTenant() {
  console.log('🚀 Starting multi-tenant migration...\n');

  try {
    // Step 1: Check if Company table exists (migration already run)
    const companyCount = await prisma.company.count();
    
    if (companyCount > 0) {
      console.log('⚠️  Migration already completed. Companies exist.');
      console.log(`   Found ${companyCount} companies in database.`);
      return;
    }

    // Step 2: Create default "Apliman" company
    console.log('📦 Creating default Apliman company...');
    
    const aplimanCompany = await prisma.company.create({
      data: {
        name: 'Apliman',
        slug: 'apliman',
        primaryColor: '#3B82F6',
        subscriptionPlan: 'ENTERPRISE',
        subscriptionStatus: 'ACTIVE',
        subscriptionStart: new Date(),
        subscriptionEnd: null, // Lifetime
        monthlyPrice: 0,
        maxUsers: -1, // Unlimited
        maxTasks: -1, // Unlimited
        maxStorage: 100,
        aiEnabled: false, // Will be set when AI key is added
        isActive: true,
      },
    });

    console.log(`✅ Created Apliman company (ID: ${aplimanCompany.id})\n`);

    // Step 3: Create default company settings
    await prisma.companySettings.create({
      data: {
        companyId: aplimanCompany.id,
      },
    });

    console.log('✅ Created company settings\n');

    // Step 4: Find the first SUPER_ADMIN to keep as system admin
    const firstSuperAdmin = await prisma.user.findFirst({
      where: { role: 'SUPER_ADMIN' },
      orderBy: { createdAt: 'asc' },
    });

    if (!firstSuperAdmin) {
      console.log('⚠️  No SUPER_ADMIN found. Creating one...');
      
      // Prompt for super admin creation
      const hashedPassword = await bcrypt.hash('AdminPassword123!', 10);
      
      await prisma.user.create({
        data: {
          email: 'admin@system.com',
          name: 'System Administrator',
          password: hashedPassword,
          role: 'SUPER_ADMIN',
          companyId: null, // System admin has no company
        },
      });

      console.log('✅ Created system admin: admin@system.com / AdminPassword123!');
      console.log('   ⚠️  CHANGE THIS PASSWORD IMMEDIATELY!\n');
    } else {
      // Update first super admin to have no companyId (system admin)
      await prisma.user.update({
        where: { id: firstSuperAdmin.id },
        data: { companyId: null },
      });

      console.log(`✅ Set ${firstSuperAdmin.email} as system admin (no company)\n`);
    }

    // Step 5: Assign all other users to Apliman company
    const usersToUpdate = await prisma.user.findMany({
      where: {
        id: firstSuperAdmin ? { not: firstSuperAdmin.id } : undefined,
      },
    });

    console.log(`👥 Migrating ${usersToUpdate.length} users to Apliman...`);

    for (const user of usersToUpdate) {
      // Convert SUPER_ADMIN to COMPANY_ADMIN for Apliman
      const newRole = user.role === 'SUPER_ADMIN' ? 'COMPANY_ADMIN' : user.role;

      await prisma.user.update({
        where: { id: user.id },
        data: {
          companyId: aplimanCompany.id,
          role: newRole as any,
        },
      });
    }

    console.log(`✅ Migrated ${usersToUpdate.length} users\n`);

    // Step 6: Assign all tasks to Apliman
    const tasksCount = await prisma.task.count();
    console.log(`📋 Migrating ${tasksCount} tasks to Apliman...`);

    await prisma.task.updateMany({
      data: {
        companyId: aplimanCompany.id,
      },
    });

    console.log(`✅ Migrated ${tasksCount} tasks\n`);

    // Step 7: Assign all workflows to Apliman
    const workflowsCount = await prisma.workflow.count();
    console.log(`🔄 Migrating ${workflowsCount} workflows to Apliman...`);

    await prisma.workflow.updateMany({
      data: {
        companyId: aplimanCompany.id,
      },
    });

    console.log(`✅ Migrated ${workflowsCount} workflows\n`);

    // Step 8: Assign all knowledge sources to Apliman
    const knowledgeCount = await prisma.knowledgeSource.count();
    if (knowledgeCount > 0) {
      console.log(`📚 Migrating ${knowledgeCount} knowledge sources to Apliman...`);

      await prisma.knowledgeSource.updateMany({
        data: {
          companyId: aplimanCompany.id,
        },
      });

      console.log(`✅ Migrated ${knowledgeCount} knowledge sources\n`);
    }

    // Step 9: Assign all chat sessions to Apliman
    const chatSessionsCount = await prisma.chatSession.count();
    if (chatSessionsCount > 0) {
      console.log(`💬 Migrating ${chatSessionsCount} chat sessions to Apliman...`);

      await prisma.chatSession.updateMany({
        data: {
          companyId: aplimanCompany.id,
        },
      });

      console.log(`✅ Migrated ${chatSessionsCount} chat sessions\n`);
    }

    // Step 10: Create subscription history
    await prisma.subscriptionHistory.create({
      data: {
        companyId: aplimanCompany.id,
        action: 'CREATED',
        toPlan: 'ENTERPRISE',
        amount: 0,
        performedBy: firstSuperAdmin?.id || 'system',
      },
    });

    console.log('✅ Created subscription history\n');

    // Summary
    console.log('🎉 Migration completed successfully!\n');
    console.log('📊 Summary:');
    console.log(`   - Company: Apliman (${aplimanCompany.id})`);
    console.log(`   - Users: ${usersToUpdate.length + 1}`);
    console.log(`   - Tasks: ${tasksCount}`);
    console.log(`   - Workflows: ${workflowsCount}`);
    console.log(`   - Knowledge Sources: ${knowledgeCount}`);
    console.log(`   - Chat Sessions: ${chatSessionsCount}`);
    console.log('\n✅ All existing data has been assigned to Apliman company');
    console.log('✅ Data isolation is now active');
    console.log('\n🚀 Next steps:');
    console.log('   1. Test login as system admin');
    console.log('   2. Access /companies endpoint');
    console.log('   3. Create new companies via Super Admin CMS');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run migration
migrateToMultiTenant()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

