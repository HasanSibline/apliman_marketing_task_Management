#!/usr/bin/env node
/**
 * EMERGENCY FIX: Force-assign first available workflow to orphaned tasks
 * Run this if tasks exist but have invalid workflow references
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixOrphanedTasks() {
  console.log('🔍 Checking for orphaned tasks...\n');

  try {
    // Find tasks with invalid workflows
    const orphanedTasks = await prisma.task.findMany({
      where: {
        OR: [
          { workflowId: null },
          {
            workflow: {
              is: null
            }
          }
        ]
      },
      select: {
        id: true,
        title: true,
        taskType: true,
        workflowId: true,
      }
    });

    console.log(`Found ${orphanedTasks.length} orphaned tasks without valid workflows\n`);

    if (orphanedTasks.length === 0) {
      console.log('✅ No orphaned tasks found!');
      return;
    }

    // Get first available workflow
    const workflow = await prisma.workflow.findFirst({
      where: { isActive: true },
      include: { phases: { orderBy: { order: 'asc' } } }
    });

    if (!workflow) {
      console.error('❌ No workflows available! Please create a workflow first.');
      return;
    }

    console.log(`Using workflow: ${workflow.name} (${workflow.id})\n`);

    // Fix each orphaned task
    for (const task of orphanedTasks) {
      console.log(`Fixing task: ${task.title} (${task.id})`);
      
      await prisma.task.update({
        where: { id: task.id },
        data: {
          workflowId: workflow.id,
          currentPhaseId: workflow.phases[0].id,
          taskType: workflow.taskType,
        }
      });
    }

    console.log(`\n✅ Fixed ${orphanedTasks.length} orphaned tasks!`);
    console.log(`All tasks now use workflow: ${workflow.name}`);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixOrphanedTasks();

