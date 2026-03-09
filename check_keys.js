require('dotenv').config({ path: 'd:/Marketing task management/backend/.env' });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkKeys() {
    try {
        const companies = await prisma.company.findMany({
            select: {
                id: true,
                name: true,
                aiApiKey: true,
                aiEnabled: true,
                subscriptionPlan: true,
            },
        });

        console.log('--- Company AI Keys ---');
        for (const c of companies) {
            if (c.aiApiKey) {
                try {
                    // Decrypt key if Base64
                    let decoded = '';
                    try {
                        decoded = Buffer.from(c.aiApiKey, 'base64').toString('utf-8');
                    } catch (e) {
                        decoded = 'DECODE_FAILED';
                    }
                    console.log(`Company: ${c.name} (${c.subscriptionPlan})`);
                    console.log(`Enabled: ${c.aiEnabled}`);
                    console.log(`Raw in DB (Start): ${c.aiApiKey.substring(0, 10)}...`);
                    console.log(`Sample: ${decoded.substring(0, 5)}...${decoded.substring(decoded.length - 5)}`);
                    console.log(`Valid Gemini Format? (AIzaS...): ${decoded.startsWith('AIzaSy')}`);
                } catch (e) {
                    console.log(`Company: ${c.name} - ERROR: ${e.message}`);
                }
            } else {
                console.log(`Company: ${c.name} - No Key`);
            }
            console.log('------------------------');
        }
    } catch (e) {
        console.error('Database error:', e);
    } finally {
        await prisma.$disconnect();
    }
}

checkKeys();
