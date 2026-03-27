import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('--- Initializing Departments for Existing Companies ---');

    const companies = await prisma.company.findMany();
    console.log(`Found ${companies.length} companies.`);

    for (const company of companies) {
        console.log(`Processing Company: ${company.name} (${company.id})`);

        // 1. Create Default Marketing Department
        let marketingDept = await prisma.department.findUnique({
            where: { companyId_name: { companyId: company.id, name: 'Marketing' } }
        });

        if (!marketingDept) {
            marketingDept = await prisma.department.create({
                data: {
                    name: 'Marketing',
                    companyId: company.id,
                }
            });
            console.log(`Created Marketing department for ${company.name}`);
        } else {
            console.log(`Marketing department already exists for ${company.name}`);
        }

        // 2. Assign all existing users to Marketing department
        const users = await prisma.user.updateMany({
            where: { companyId: company.id, departmentId: null },
            data: { departmentId: marketingDept.id }
        });
        console.log(`Updated ${users.count} users for ${company.name}`);

        // 3. Mark the first ADMIN as the department manager if not set
        const adminUser = await prisma.user.findFirst({
            where: { companyId: company.id, role: { in: ['COMPANY_ADMIN', 'ADMIN', 'SUPER_ADMIN'] } }
        });

        if (adminUser && !marketingDept.managerId) {
            await prisma.department.update({
                where: { id: marketingDept.id },
                data: { managerId: adminUser.id }
            });
            console.log(`Set ${adminUser.name} as Manager for Marketing department`);
        }
    }

    console.log('--- Done ---');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
