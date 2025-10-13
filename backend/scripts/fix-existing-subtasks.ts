/**
 * Script to create linkedTasks for existing assigned subtasks
 * Run this once to fix subtasks created before the linkedTask relation was added
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fixExistingSubtasks() {
  console.log('🔍 Finding subtasks without linkedTask...');

  // Find all subtasks that have an assignee but no linkedTask
  const subtasksWithoutLinkedTask = await prisma.subtask.findMany({
    where: {
      assignedToId: { not: null },
      linkedTask: null,
    },
    include: {
      task: {
        include: {
          workflow: { include: { phases: true } },
        },
      },
      assignedTo: true,
      phase: true,
    },
  });

  console.log(`📊 Found ${subtasksWithoutLinkedTask.length} subtasks to fix`);

  let fixed = 0;
  let skipped = 0;

  for (const subtask of subtasksWithoutLinkedTask) {
    try {
      // Create individual task for this subtask
      const individualTask = await prisma.task.create({
        data: {
          title: `${subtask.title} (from: ${subtask.task.title})`,
          description: subtask.description || `Subtask from main task: ${subtask.task.title}`,
          goals: `Complete subtask: ${subtask.title}`,
          priority: subtask.task.priority,
          taskType: 'SUBTASK',
          workflowId: subtask.task.workflowId,
          currentPhaseId: subtask.phaseId || subtask.task.currentPhaseId,
          assignedToId: subtask.assignedToId!,
          createdById: subtask.task.createdById,
          dueDate: subtask.task.dueDate,
          parentTaskId: subtask.task.id,
          subtaskId: subtask.id, // This creates the linkedTask relation
        },
      });

      // Create task assignment record
      await prisma.taskAssignment.create({
        data: {
          taskId: individualTask.id,
          userId: subtask.assignedToId!,
          assignedById: subtask.task.createdById,
        },
      });

      console.log(`✅ Created linkedTask for subtask: "${subtask.title}"`);
      fixed++;
    } catch (error: any) {
      console.error(`❌ Failed to fix subtask "${subtask.title}": ${error.message}`);
      skipped++;
    }
  }

  console.log('\n📈 Summary:');
  console.log(`   ✅ Fixed: ${fixed}`);
  console.log(`   ❌ Skipped: ${skipped}`);
  console.log(`   📊 Total: ${subtasksWithoutLinkedTask.length}`);
}

fixExistingSubtasks()
  .catch((error) => {
    console.error('💥 Script failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

