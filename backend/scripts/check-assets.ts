import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const users = await prisma.user.findMany({
    select: { name: true, email: true, avatar: true }
  });
  console.log('--- Users Avatars ---');
  console.table(users);
  
  const companies = await prisma.company.findMany({
    select: { name: true, logo: true }
  });
  console.log('--- Companies Logos ---');
  console.table(companies);
}
main().catch(console.error).finally(() => prisma.$disconnect());
