import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function clearWorkflows() {
  console.log('🗑️  Starting workflow cleanup...\n');

  try {
    // Delete in correct order due to foreign key constraints
    console.log('1. Deleting phase approvals...');
    await prisma.phaseApproval.deleteMany();
    
    console.log('2. Deleting phase history...');
    await prisma.phaseHistory.deleteMany();
    
    console.log('3. Deleting subtasks...');
    await prisma.subtask.deleteMany();
    
    console.log('4. Deleting task assignments...');
    await prisma.taskAssignment.deleteMany();
    
    console.log('5. Deleting notifications...');
    await prisma.notification.deleteMany();
    
    console.log('6. Deleting task comments...');
    await prisma.taskComment.deleteMany();
    
    console.log('7. Deleting task files...');
    await prisma.taskFile.deleteMany();
    
    console.log('8. Deleting tasks...');
    const deletedTasks = await prisma.task.deleteMany();
    console.log(`   ✓ Deleted ${deletedTasks.count} tasks`);
    
    console.log('9. Deleting transitions...');
    const deletedTransitions = await prisma.transition.deleteMany();
    console.log(`   ✓ Deleted ${deletedTransitions.count} transitions`);
    
    console.log('10. Deleting phases...');
    const deletedPhases = await prisma.phase.deleteMany();
    console.log(`   ✓ Deleted ${deletedPhases.count} phases`);
    
    console.log('11. Deleting workflows...');
    const deletedWorkflows = await prisma.workflow.deleteMany();
    console.log(`   ✓ Deleted ${deletedWorkflows.count} workflows`);

    console.log('\n✅ Database cleaned successfully!');
    console.log('\n📋 Summary:');
    console.log(`   - ${deletedWorkflows.count} workflows removed`);
    console.log(`   - ${deletedPhases.count} phases removed`);
    console.log(`   - ${deletedTransitions.count} transitions removed`);
    console.log(`   - ${deletedTasks.count} tasks removed`);
    console.log('\n💡 Users can now create fresh workflows from scratch.');
  } catch (error) {
    console.error('❌ Error clearing workflows:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

clearWorkflows();

