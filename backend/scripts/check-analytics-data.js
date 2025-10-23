const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkAnalyticsData() {
  try {
    console.log('=== Checking Analytics Data ===\n');

    // Get all users
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
    });

    console.log(`Found ${users.length} users:\n`);

    for (const user of users) {
      console.log(`\n📊 User: ${user.name} (${user.email}) - ${user.role}`);
      console.log(`   ID: ${user.id}`);

      // Count tasks by type
      const allTasks = await prisma.task.count({
        where: { assignedToId: user.id },
      });

      const mainTasks = await prisma.task.count({
        where: { 
          assignedToId: user.id,
          taskType: 'MAIN',
        },
      });

      const subtasks = await prisma.task.count({
        where: { 
          assignedToId: user.id,
          taskType: 'SUBTASK',
        },
      });

      console.log(`   📋 Total tasks assigned: ${allTasks}`);
      console.log(`   📋 MAIN tasks: ${mainTasks}`);
      console.log(`   📋 SUBTASKS: ${subtasks}`);

      // Get sample tasks
      const sampleTasks = await prisma.task.findMany({
        where: { assignedToId: user.id },
        take: 3,
        select: {
          id: true,
          title: true,
          taskType: true,
          currentPhase: {
            select: {
              name: true,
              isEndPhase: true,
            },
          },
        },
      });

      if (sampleTasks.length > 0) {
        console.log(`   Sample tasks:`);
        sampleTasks.forEach(task => {
          console.log(`      - ${task.title} (${task.taskType}) - Phase: ${task.currentPhase?.name || 'None'}`);
        });
      }

      // Count created tasks
      const createdTasks = await prisma.task.count({
        where: { 
          createdById: user.id,
          taskType: 'MAIN',
        },
      });
      console.log(`   ✏️  Created tasks: ${createdTasks}`);
    }

    // Check phases
    console.log('\n\n=== Checking Phases ===\n');
    const phases = await prisma.phase.findMany({
      select: {
        id: true,
        name: true,
        isStartPhase: true,
        isEndPhase: true,
        _count: {
          select: {
            tasks: true,
          },
        },
      },
    });

    console.log(`Found ${phases.length} phases:\n`);
    phases.forEach(phase => {
      const flags = [];
      if (phase.isStartPhase) flags.push('START');
      if (phase.isEndPhase) flags.push('END');
      console.log(`   - ${phase.name} [${flags.join(', ') || 'MIDDLE'}] - ${phase._count.tasks} tasks`);
    });

    // Check task types distribution
    console.log('\n\n=== Task Types Distribution ===\n');
    const taskTypes = await prisma.task.groupBy({
      by: ['taskType'],
      _count: true,
    });

    taskTypes.forEach(type => {
      console.log(`   ${type.taskType}: ${type._count} tasks`);
    });

    console.log('\n=== Done ===\n');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkAnalyticsData();

