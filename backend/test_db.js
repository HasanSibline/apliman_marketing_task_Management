require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
  const users = await prisma.user.findMany();
  console.log('All Users:', users.map(u => ({ id: u.id, email: u.email, isMicrosoftSynced: u.isMicrosoftSynced, hasRefreshToken: !!u.microsoftRefreshToken })));
}
test().then(() => process.exit(0));
