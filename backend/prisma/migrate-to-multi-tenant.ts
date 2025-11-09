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

    // Step 4: Create System Super Admin (OUTSIDE all companies)
    console.log('👤 Creating System Super Admin...');
    
    // Get password from environment variable or use default
    const adminPassword = process.env.SUPER_ADMIN_PASSWORD || 'SuperAdmin123!';
    const hashedPassword = await bcrypt.hash(adminPassword, 10);
    
    const superAdmin = await prisma.user.create({
      data: {
        email: 'superadmin@apliman.com',
        name: 'System Administrator',
        password: hashedPassword,
        role: 'SUPER_ADMIN',
        position: 'System Administrator',
        companyId: null, // Super admin has NO company
      },
    });

    console.log(`✅ Created System Super Admin: ${superAdmin.email}`);
    if (process.env.SUPER_ADMIN_PASSWORD) {
      console.log('   🔐 Using custom password from SUPER_ADMIN_PASSWORD environment variable');
    } else {
      console.log('   🔐 Using default password: SuperAdmin123!');
      console.log('   ⚠️  CHANGE THIS PASSWORD IMMEDIATELY!');
    }
    console.log();

    // Step 5: Convert all existing users to belong to Apliman company
    const existingUsers = await prisma.user.findMany({
      where: {
        id: { not: superAdmin.id }, // Exclude the super admin we just created
      },
    });

    console.log(`👥 Migrating ${existingUsers.length} existing users to Apliman company...`);

    for (const user of existingUsers) {
      // Convert any existing SUPER_ADMIN to COMPANY_ADMIN for Apliman
      let newRole = user.role;
      if (user.role === 'SUPER_ADMIN') {
        newRole = 'COMPANY_ADMIN';
        console.log(`   Converting ${user.email} from SUPER_ADMIN to COMPANY_ADMIN`);
      }

      await prisma.user.update({
        where: { id: user.id },
        data: {
          companyId: aplimanCompany.id,
          role: newRole as any,
        },
      });
    }

    console.log(`✅ Migrated ${existingUsers.length} users to Apliman company\n`);

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
        performedBy: superAdmin.id,
      },
    });

    console.log('✅ Created subscription history\n');

    // Summary
    console.log('🎉 Migration completed successfully!\n');
    console.log('📊 Summary:');
    console.log(`   - System Super Admin: ${superAdmin.email} (NO company)`);
    console.log(`   - Company: Apliman (${aplimanCompany.id})`);
    console.log(`   - Apliman Users: ${existingUsers.length}`);
    console.log(`   - Tasks: ${tasksCount}`);
    console.log(`   - Workflows: ${workflowsCount}`);
    console.log(`   - Knowledge Sources: ${knowledgeCount}`);
    console.log(`   - Chat Sessions: ${chatSessionsCount}`);
    console.log('\n✅ Apliman is now a regular company in the system');
    console.log('✅ All existing data has been assigned to Apliman');
    console.log('✅ System Administrator exists OUTSIDE all companies');
    console.log('✅ Data isolation is now active');
    console.log('\n🚀 Next steps:');
    console.log('   1. Login as System Admin: superadmin@apliman.com / SuperAdmin123!');
    console.log('   2. CHANGE THE PASSWORD IMMEDIATELY');
    console.log('   3. Access /super-admin/companies to manage all companies');
    console.log('   4. Create new companies via Super Admin CMS');

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

