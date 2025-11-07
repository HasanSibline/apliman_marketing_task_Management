#!/bin/bash

# 📥 Import Database to Neon
# This script imports your SQL dump into Neon database

echo "📥 Starting database import to Neon..."

# Check if backup file is provided
if [ -z "$1" ]; then
    echo "❌ ERROR: No backup file provided"
    echo "Usage: ./import-to-neon.sh <backup_file.sql>"
    echo "Example: ./import-to-neon.sh database_backup_20250107_123456.sql"
    exit 1
fi

BACKUP_FILE="$1"

# Check if file exists
if [ ! -f "$BACKUP_FILE" ]; then
    echo "❌ ERROR: File not found: $BACKUP_FILE"
    exit 1
fi

# Check if NEON_DATABASE_URL is set
if [ -z "$NEON_DATABASE_URL" ]; then
    echo "Please provide your Neon database URL (Pooled connection):"
    read -p "Neon URL: " NEON_DATABASE_URL
fi

echo "🔄 Importing from: $BACKUP_FILE"
echo "🎯 Target: Neon database"
echo ""
echo "⚠️  WARNING: This will add data to your Neon database"
read -p "Continue? (y/N): " confirm

if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
    echo "❌ Import cancelled"
    exit 0
fi

# Use psql to import (requires PostgreSQL client tools)
if command -v psql &> /dev/null; then
    psql "$NEON_DATABASE_URL" < "$BACKUP_FILE"
    
    if [ $? -eq 0 ]; then
        echo "✅ Import successful!"
        echo ""
        echo "Next steps:"
        echo "1. Update DATABASE_URL on Render backend to use Neon"
        echo "2. Redeploy your backend"
        echo "3. Test your application"
    else
        echo "❌ Import failed!"
        exit 1
    fi
else
    echo "❌ ERROR: psql not found"
    echo "Please install PostgreSQL client tools:"
    echo "  - macOS: brew install postgresql"
    echo "  - Ubuntu: sudo apt-get install postgresql-client"
    echo "  - Windows: Download from https://www.postgresql.org/download/windows/"
    exit 1
fi

