import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('--- Backfilling Task Numbers ---');

    const companies = await prisma.company.findMany();

    for (const company of companies) {
        console.log(`Processing ${company.name}...`);
        
        const tasks = await prisma.task.findMany({
            where: { companyId: company.id, taskNumber: null },
            orderBy: { createdAt: 'asc' }
        });

        console.log(`Found ${tasks.length} tasks to backfill.`);

        let counter = 1001;
        // Check for highest existing number first
        const lastTask = await prisma.task.findFirst({
            where: { companyId: company.id, taskNumber: { startsWith: 'TSK-' } },
            orderBy: { taskNumber: 'desc' }, // Note: string sort might be weird, but for 1001-9999 it works
            select: { taskNumber: true }
        });

        if (lastTask && lastTask.taskNumber) {
            const num = parseInt(lastTask.taskNumber.split('-')[1]);
            if (!isNaN(num)) counter = num + 1;
        }

        for (const task of tasks) {
            await prisma.task.update({
                where: { id: task.id },
                data: { taskNumber: `TSK-${counter}` }
            });
            counter++;
        }
        console.log(`Backfilled tasks for ${company.name}`);
    }

    console.log('--- Done ---');
}

main().finally(() => prisma.$disconnect());
