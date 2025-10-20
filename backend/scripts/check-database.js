#!/usr/bin/env node
/**
 * Database Diagnostic Script
 * Checks for existing workflows, tasks, and identifies any issues
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🔍 Running Database Diagnostics...\n');

  try {
    // Check Workflows
    console.log('📊 Checking Workflows...');
    const workflows = await prisma.workflow.findMany({
      include: {
        _count: {
          select: { tasks: true, phases: true }
        }
      }
    });
    
    console.log(`Found ${workflows.length} workflows:\n`);
    workflows.forEach(w => {
      console.log(`  - ${w.name} (${w.taskType})`);
      console.log(`    ID: ${w.id}`);
      console.log(`    Active: ${w.isActive}`);
      console.log(`    Default: ${w.isDefault}`);
      console.log(`    Tasks: ${w._count.tasks}`);
      console.log(`    Phases: ${w._count.phases}`);
      console.log(`    Created: ${w.createdAt}`);
      console.log('');
    });

    // Check Tasks
    console.log('\n📋 Checking Tasks...');
    const tasks = await prisma.task.findMany({
      select: {
        id: true,
        title: true,
        taskType: true,
        workflowId: true,
        createdAt: true,
        completedAt: true,
        workflow: {
          select: {
            name: true,
            isActive: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 10
    });

    console.log(`Found ${tasks.length} recent tasks:\n`);
    tasks.forEach(t => {
      console.log(`  - ${t.title}`);
      console.log(`    ID: ${t.id}`);
      console.log(`    Type: ${t.taskType}`);
      console.log(`    Workflow: ${t.workflow?.name || 'NONE'} (${t.workflowId})`);
      console.log(`    Workflow Active: ${t.workflow?.isActive ?? 'N/A'}`);
      console.log(`    Created: ${t.createdAt}`);
      console.log(`    Completed: ${t.completedAt || 'No'}`);
      console.log('');
    });

    // Check for orphaned tasks (tasks with invalid workflow references)
    console.log('\n⚠️  Checking for Orphaned Tasks...');
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
        workflowId: true,
        createdAt: true
      }
    });

    if (orphanedTasks.length > 0) {
      console.log(`❌ Found ${orphanedTasks.length} orphaned tasks (no valid workflow):\n`);
      orphanedTasks.forEach(t => {
        console.log(`  - ${t.title} (ID: ${t.id})`);
        console.log(`    Workflow ID: ${t.workflowId || 'NULL'}`);
        console.log(`    Created: ${t.createdAt}`);
        console.log('');
      });
    } else {
      console.log('✅ No orphaned tasks found');
    }

    // Check for tasks with inactive workflows
    console.log('\n⚠️  Checking for Tasks with Inactive Workflows...');
    const inactiveWorkflowTasks = await prisma.task.findMany({
      where: {
        workflow: {
          isActive: false
        }
      },
      select: {
        id: true,
        title: true,
        workflow: {
          select: {
            name: true
          }
        }
      }
    });

    if (inactiveWorkflowTasks.length > 0) {
      console.log(`⚠️  Found ${inactiveWorkflowTasks.length} tasks with inactive workflows:\n`);
      inactiveWorkflowTasks.forEach(t => {
        console.log(`  - ${t.title}`);
        console.log(`    Workflow: ${t.workflow?.name}`);
        console.log('');
      });
    } else {
      console.log('✅ No tasks with inactive workflows');
    }

    // Summary
    console.log('\n📊 Summary:');
    const totalTasks = await prisma.task.count();
    const totalWorkflows = await prisma.workflow.count();
    const activeWorkflows = await prisma.workflow.count({ where: { isActive: true } });
    
    console.log(`  Total Workflows: ${totalWorkflows} (${activeWorkflows} active)`);
    console.log(`  Total Tasks: ${totalTasks}`);
    console.log(`  Orphaned Tasks: ${orphanedTasks.length}`);
    console.log(`  Tasks with Inactive Workflows: ${inactiveWorkflowTasks.length}`);

    console.log('\n✅ Diagnostic completed!\n');

  } catch (error) {
    console.error('❌ Error running diagnostics:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

