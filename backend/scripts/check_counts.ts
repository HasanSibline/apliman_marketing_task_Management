import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
    const c = await prisma.company.count();
    const u = await prisma.user.count();
    const d = await prisma.department.count();
    console.log({ companies: c, users: u, departments: d });
}
main().finally(() => prisma.$disconnect());
