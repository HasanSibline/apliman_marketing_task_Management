#!/bin/bash

# 🔧 Neon Database Setup Verification Script
# This script helps verify your Neon connection is configured correctly

echo "🔍 Neon Database Connection Verifier"
echo "===================================="
echo ""

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "⚠️  DATABASE_URL not set in environment"
    echo "Please provide your Neon connection string:"
    read -p "Neon URL: " DATABASE_URL
    export DATABASE_URL
fi

echo "📝 Connection string: ${DATABASE_URL:0:30}...***"
echo ""

# Verify it's a Neon URL
if [[ $DATABASE_URL == *"neon.tech"* ]] || [[ $DATABASE_URL == *"neon.aws"* ]]; then
    echo "✅ Valid Neon connection string detected"
else
    echo "⚠️  WARNING: This doesn't look like a Neon URL"
    echo "   Expected to contain 'neon.tech' or 'neon.aws'"
fi

# Check for pooled connection (recommended)
if [[ $DATABASE_URL == *"-pooler"* ]] || [[ $DATABASE_URL == *"pooler=true"* ]]; then
    echo "✅ Using pooled connection (recommended)"
else
    echo "⚠️  NOTICE: Not using pooled connection"
    echo "   For better performance, use 'Pooled connection' from Neon dashboard"
fi

# Check for SSL mode
if [[ $DATABASE_URL == *"sslmode=require"* ]]; then
    echo "✅ SSL mode enabled"
else
    echo "⚠️  WARNING: sslmode=require not found"
    echo "   Add '?sslmode=require' to the end of your connection string"
fi

echo ""
echo "🧪 Testing connection..."

# Test connection with psql if available
if command -v psql &> /dev/null; then
    if psql "$DATABASE_URL" -c "SELECT version();" > /dev/null 2>&1; then
        echo "✅ Connection successful!"
        
        # Get PostgreSQL version
        PG_VERSION=$(psql "$DATABASE_URL" -t -c "SELECT version();" 2>/dev/null | head -n 1)
        echo "📊 PostgreSQL version: $PG_VERSION"
        
        # Count tables
        TABLE_COUNT=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>/dev/null | xargs)
        echo "📁 Tables in database: $TABLE_COUNT"
        
        if [ "$TABLE_COUNT" -eq "0" ]; then
            echo ""
            echo "ℹ️  Database is empty - migrations will run on first backend deploy"
        else
            echo ""
            echo "✅ Database is ready and populated!"
        fi
    else
        echo "❌ Connection failed!"
        echo ""
        echo "Possible issues:"
        echo "1. Wrong connection string"
        echo "2. Database not created"
        echo "3. Network/firewall issue"
        echo ""
        echo "Check your Neon dashboard: https://console.neon.tech"
    fi
else
    echo "⚠️  psql not installed - skipping connection test"
    echo "   Install PostgreSQL client to test connection"
fi

echo ""
echo "===================================="
echo "Next steps:"
echo "1. Update DATABASE_URL on Render backend"
echo "2. Deploy backend (it will auto-migrate)"
echo "3. Test your application"
echo ""
echo "Full guide: NEON_MIGRATION_GUIDE.md"

