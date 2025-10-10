import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function seedWorkflows(adminUserId: string) {
  console.log('🌱 Seeding workflows...');

  // Get all users to use for allowedUsers
  const allUsers = await prisma.user.findMany({
    select: { id: true }
  });
  const allUserIds = allUsers.map(u => u.id);
  
  // Admin users only
  const adminUsers = await prisma.user.findMany({
    where: { role: { in: ['SUPER_ADMIN', 'ADMIN'] } },
    select: { id: true }
  });
  const adminUserIds = adminUsers.map(u => u.id);

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
            allowedUsers: allUserIds,
            isStartPhase: true,
          },
          {
            name: 'Content Creation',
            description: 'Write copy and create visuals',
            order: 1,
            color: '#2563EB',
            allowedUsers: allUserIds,
          },
          {
            name: 'Review & Approval',
            description: 'Quality check and approval',
            order: 2,
            color: '#F59E0B',
            allowedUsers: adminUserIds.length > 0 ? adminUserIds : allUserIds,
            requiresApproval: true,
          },
          {
            name: 'Published',
            description: 'Content published',
            order: 3,
            color: '#10B981',
            allowedUsers: adminUserIds.length > 0 ? adminUserIds : allUserIds,
            isEndPhase: true,
          },
        ],
      },
    },
    include: {
      phases: true,
    },
  });

  const smPhases = socialMediaWorkflow.phases;

  // Create transitions for Social Media Workflow
  await prisma.transition.create({
    data: {
      fromPhaseId: smPhases[0].id,
      toPhaseId: smPhases[1].id,
      notifyUsers: [],
    },
  });

  await prisma.transition.create({
    data: {
      fromPhaseId: smPhases[1].id,
      toPhaseId: smPhases[2].id,
      notifyUsers: [],
    },
  });

  await prisma.transition.create({
    data: {
      fromPhaseId: smPhases[2].id,
      toPhaseId: smPhases[3].id,
      notifyUsers: [],
    },
  });

  // Video Content Workflow
  const videoWorkflow = await prisma.workflow.create({
    data: {
      name: 'Video Content Workflow',
      description: 'Workflow for video content creation and production',
      taskType: 'VIDEO_CONTENT',
      isDefault: false,
      color: '#EF4444',
      createdById: adminUserId,
      phases: {
        create: [
          {
            name: 'Pre-production',
            description: 'Planning and scripting',
            order: 0,
            color: '#9333EA',
            allowedUsers: allUserIds,
            isStartPhase: true,
          },
          {
            name: 'Production',
            description: 'Recording and filming',
            order: 1,
            color: '#2563EB',
            allowedUsers: allUserIds,
          },
          {
            name: 'Post-production',
            description: 'Editing and effects',
            order: 2,
            color: '#F59E0B',
            allowedUsers: allUserIds,
          },
          {
            name: 'Review & Approval',
            description: 'Final review and approval',
            order: 3,
            color: '#F97316',
            allowedUsers: adminUserIds.length > 0 ? adminUserIds : allUserIds,
            requiresApproval: true,
          },
          {
            name: 'Published',
            description: 'Video published',
            order: 4,
            color: '#10B981',
            allowedUsers: adminUserIds.length > 0 ? adminUserIds : allUserIds,
            isEndPhase: true,
          },
        ],
      },
    },
    include: {
      phases: true,
    },
  });

  const vPhases = videoWorkflow.phases;

  // Create transitions for Video Workflow
  await prisma.transition.create({
    data: {
      fromPhaseId: vPhases[0].id,
      toPhaseId: vPhases[1].id,
      notifyUsers: [],
    },
  });

  await prisma.transition.create({
    data: {
      fromPhaseId: vPhases[1].id,
      toPhaseId: vPhases[2].id,
      notifyUsers: [],
    },
  });

  await prisma.transition.create({
    data: {
      fromPhaseId: vPhases[2].id,
      toPhaseId: vPhases[3].id,
      notifyUsers: [],
    },
  });

  await prisma.transition.create({
    data: {
      fromPhaseId: vPhases[3].id,
      toPhaseId: vPhases[4].id,
      notifyUsers: [],
    },
  });

  // General Task Workflow
  const generalWorkflow = await prisma.workflow.create({
    data: {
      name: 'General Task Workflow',
      description: 'Standard workflow for general tasks',
      taskType: 'GENERAL',
      isDefault: true,
      color: '#6B7280',
      createdById: adminUserId,
      phases: {
        create: [
          {
            name: 'To Do',
            description: 'Task ready to start',
            order: 0,
            color: '#9333EA',
            allowedUsers: allUserIds,
            isStartPhase: true,
          },
          {
            name: 'In Progress',
            description: 'Task being worked on',
            order: 1,
            color: '#2563EB',
            allowedUsers: allUserIds,
          },
          {
            name: 'Review',
            description: 'Task under review',
            order: 2,
            color: '#F59E0B',
            allowedUsers: adminUserIds.length > 0 ? adminUserIds : allUserIds,
          },
          {
            name: 'Complete',
            description: 'Task completed',
            order: 3,
            color: '#10B981',
            allowedUsers: adminUserIds.length > 0 ? adminUserIds : allUserIds,
            isEndPhase: true,
          },
        ],
      },
    },
    include: {
      phases: true,
    },
  });

  const gPhases = generalWorkflow.phases;

  // Create transitions for General Workflow
  await prisma.transition.create({
    data: {
      fromPhaseId: gPhases[0].id,
      toPhaseId: gPhases[1].id,
      notifyUsers: [],
    },
  });

  await prisma.transition.create({
    data: {
      fromPhaseId: gPhases[1].id,
      toPhaseId: gPhases[2].id,
      notifyUsers: [],
    },
  });

  await prisma.transition.create({
    data: {
      fromPhaseId: gPhases[2].id,
      toPhaseId: gPhases[3].id,
      notifyUsers: [],
    },
  });

  console.log('✅ Workflows seeded successfully');
  console.log(`   - Social Media Workflow: ${socialMediaWorkflow.id}`);
  console.log(`   - Video Content Workflow: ${videoWorkflow.id}`);
  console.log(`   - General Task Workflow: ${generalWorkflow.id}`);
}