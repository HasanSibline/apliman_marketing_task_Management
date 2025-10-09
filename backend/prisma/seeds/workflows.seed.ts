import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function seedWorkflows(adminUserId: string) {
  console.log('🌱 Seeding workflows...');

  // Social Media Workflow
  const socialMediaWorkflow = await prisma.workflow.create({
    data: {
      name: 'Social Media Workflow',
      description: 'Standard workflow for social media content creation',
      taskType: 'SOCIAL_MEDIA_POST',
      isDefault: true,
      color: '#3B82F6',
      createdById: adminUserId,
      phases: {
        create: [
          {
            name: 'Research & Strategy',
            description: 'Define objectives and strategy',
            order: 0,
            color: '#9333EA',
            allowedRoles: JSON.stringify(['SUPER_ADMIN', 'ADMIN', 'EMPLOYEE']),
            isStartPhase: true,
          },
          {
            name: 'Content Creation',
            description: 'Write copy and create visuals',
            order: 1,
            color: '#2563EB',
            allowedRoles: JSON.stringify(['SUPER_ADMIN', 'ADMIN', 'EMPLOYEE']),
          },
          {
            name: 'Review & Approval',
            description: 'Quality check and approval',
            order: 2,
            color: '#F59E0B',
            allowedRoles: JSON.stringify(['SUPER_ADMIN', 'ADMIN']),
            requiresApproval: true,
          },
          {
            name: 'Published',
            description: 'Content published',
            order: 3,
            color: '#10B981',
            allowedRoles: JSON.stringify(['SUPER_ADMIN', 'ADMIN']),
            isEndPhase: true,
          },
        ],
      },
    },
    include: {
      phases: { orderBy: { order: 'asc' } },
    },
  });

  // Create transitions for social media workflow
  const smPhases = socialMediaWorkflow.phases;
  for (let i = 0; i < smPhases.length - 1; i++) {
    await prisma.transition.create({
      data: {
        fromPhaseId: smPhases[i].id,
        toPhaseId: smPhases[i + 1].id,
        name: `Move to ${smPhases[i + 1].name}`,
        notifyRoles: '[]',
      },
    });
  }

  console.log('  ✅ Social Media Workflow created');

  // Video Production Workflow
  const videoWorkflow = await prisma.workflow.create({
    data: {
      name: 'Video Production Workflow',
      description: 'Complete video production pipeline',
      taskType: 'VIDEO_CONTENT',
      isDefault: true,
      color: '#EC4899',
      createdById: adminUserId,
      phases: {
        create: [
          {
            name: 'Pre-Production',
            description: 'Script, storyboard, planning',
            order: 0,
            color: '#9333EA',
            allowedRoles: JSON.stringify(['SUPER_ADMIN', 'ADMIN', 'EMPLOYEE']),
            isStartPhase: true,
          },
          {
            name: 'Production',
            description: 'Filming and recording',
            order: 1,
            color: '#2563EB',
            allowedRoles: JSON.stringify(['SUPER_ADMIN', 'ADMIN', 'EMPLOYEE']),
          },
          {
            name: 'Post-Production',
            description: 'Editing, effects, sound',
            order: 2,
            color: '#F59E0B',
            allowedRoles: JSON.stringify(['SUPER_ADMIN', 'ADMIN', 'EMPLOYEE']),
          },
          {
            name: 'Review',
            description: 'Final review and approval',
            order: 3,
            color: '#EF4444',
            allowedRoles: JSON.stringify(['SUPER_ADMIN', 'ADMIN']),
            requiresApproval: true,
          },
          {
            name: 'Published',
            description: 'Video published',
            order: 4,
            color: '#10B981',
            allowedRoles: JSON.stringify(['SUPER_ADMIN', 'ADMIN']),
            isEndPhase: true,
          },
        ],
      },
    },
    include: {
      phases: { orderBy: { order: 'asc' } },
    },
  });

  // Create transitions for video workflow
  const vPhases = videoWorkflow.phases;
  for (let i = 0; i < vPhases.length - 1; i++) {
    await prisma.transition.create({
      data: {
        fromPhaseId: vPhases[i].id,
        toPhaseId: vPhases[i + 1].id,
        name: `Move to ${vPhases[i + 1].name}`,
        notifyRoles: '[]',
      },
    });
  }

  console.log('  ✅ Video Production Workflow created');

  // General Marketing Workflow
  const generalWorkflow = await prisma.workflow.create({
    data: {
      name: 'General Marketing Workflow',
      description: 'Default workflow for all other task types',
      taskType: 'GENERAL',
      isDefault: true,
      color: '#6B7280',
      createdById: adminUserId,
      phases: {
        create: [
          {
            name: 'To Do',
            description: 'Task pending',
            order: 0,
            color: '#9CA3AF',
            allowedRoles: JSON.stringify(['SUPER_ADMIN', 'ADMIN', 'EMPLOYEE']),
            isStartPhase: true,
          },
          {
            name: 'In Progress',
            description: 'Task in progress',
            order: 1,
            color: '#3B82F6',
            allowedRoles: JSON.stringify(['SUPER_ADMIN', 'ADMIN', 'EMPLOYEE']),
          },
          {
            name: 'Review',
            description: 'Under review',
            order: 2,
            color: '#F59E0B',
            allowedRoles: JSON.stringify(['SUPER_ADMIN', 'ADMIN']),
          },
          {
            name: 'Completed',
            description: 'Task completed',
            order: 3,
            color: '#10B981',
            allowedRoles: JSON.stringify(['SUPER_ADMIN', 'ADMIN']),
            isEndPhase: true,
          },
        ],
      },
    },
    include: {
      phases: { orderBy: { order: 'asc' } },
    },
  });

  // Create transitions for general workflow
  const gPhases = generalWorkflow.phases;
  for (let i = 0; i < gPhases.length - 1; i++) {
    await prisma.transition.create({
      data: {
        fromPhaseId: gPhases[i].id,
        toPhaseId: gPhases[i + 1].id,
        name: `Move to ${gPhases[i + 1].name}`,
        notifyRoles: '[]',
      },
    });
  }

  console.log('  ✅ General Marketing Workflow created');

  console.log('✅ Default workflows seeded successfully!');
}

