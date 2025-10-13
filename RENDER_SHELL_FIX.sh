#!/bin/bash
# Run this in Render Shell to fix immediately
# Go to: https://dashboard.render.com/web/srv-ctg89bd2ng1s73dchke0
# Click "Shell" tab, then paste these commands:

echo "🔧 Emergency Fix for Knowledge Sources"
echo "======================================"

# Step 1: Force schema sync
echo "Step 1: Syncing database schema..."
npx prisma db push --accept-data-loss --skip-generate

# Step 2: Generate fresh Prisma client
echo "Step 2: Generating Prisma client..."
npx prisma generate

# Step 3: Verify KnowledgeSource model exists
echo "Step 3: Verifying model..."
node -e "const {PrismaClient} = require('@prisma/client'); const p = new PrismaClient(); console.log(p.knowledgeSource ? '✅ SUCCESS - Model exists!' : '❌ FAILED - Model missing'); process.exit(p.knowledgeSource ? 0 : 1);"

if [ $? -eq 0 ]; then
  echo "✅ Fix applied successfully!"
  echo "🔄 Type 'exit' to restart the service"
else
  echo "❌ Fix failed - contact support"
fi

