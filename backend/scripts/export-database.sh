#!/bin/bash

# 🗄️ Export Database from Render
# This script exports your current database to a SQL dump file

echo "📦 Starting database export..."

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "❌ ERROR: DATABASE_URL environment variable not set"
    echo "Please provide your Render database URL:"
    read -p "Database URL: " DATABASE_URL
fi

# Export filename with timestamp
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
EXPORT_FILE="database_backup_${TIMESTAMP}.sql"

echo "🔄 Exporting database to: $EXPORT_FILE"

# Use pg_dump to export (requires PostgreSQL client tools)
if command -v pg_dump &> /dev/null; then
    pg_dump "$DATABASE_URL" > "$EXPORT_FILE"
    
    if [ $? -eq 0 ]; then
        echo "✅ Export successful!"
        echo "📄 File saved: $EXPORT_FILE"
        echo "📊 File size: $(du -h $EXPORT_FILE | cut -f1)"
        echo ""
        echo "Next steps:"
        echo "1. Create your Neon database"
        echo "2. Run: psql <NEON_DATABASE_URL> < $EXPORT_FILE"
    else
        echo "❌ Export failed!"
        exit 1
    fi
else
    echo "❌ ERROR: pg_dump not found"
    echo "Please install PostgreSQL client tools:"
    echo "  - macOS: brew install postgresql"
    echo "  - Ubuntu: sudo apt-get install postgresql-client"
    echo "  - Windows: Download from https://www.postgresql.org/download/windows/"
    exit 1
fi

