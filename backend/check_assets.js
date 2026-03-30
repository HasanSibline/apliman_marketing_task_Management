const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const users = await prisma.user.findMany({ 
    where: { 
      avatar: { not: null } 
    },
    select: { name: true, avatar: true },
    take: 5 
  });
  console.log('Users with avatars:');
  console.table(users);
  
  const companies = await prisma.company.findMany({ 
    where: { 
      logo: { not: null } 
    },
    select: { name: true, logo: true },
    take: 5 
  });
  console.log('Companies with logos:');
  console.table(companies);
}

check().catch(console.error).finally(() => prisma.$disconnect());
