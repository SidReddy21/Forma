#!/bin/bash

set -e

echo "Setting up CodeMeld..."

# Check prerequisites
command -v wrangler &> /dev/null || { echo "Error: Install wrangler first (npm install -g wrangler)"; exit 1; }
command -v node &> /dev/null || { echo "Error: Install Node.js 18+"; exit 1; }

# Login to Cloudflare
wrangler login

# Create D1 database
echo "Creating database..."
DB_OUTPUT=$(wrangler d1 create codemeld-db --yes 2>&1)
DB_ID=$(echo "$DB_OUTPUT" | grep -oE '[a-f0-9-]{36}' | head -1)

if [ -z "$DB_ID" ]; then
    echo "Error: Could not create database"
    exit 1
fi

echo "Database ID: $DB_ID"

# Update wrangler.toml with database ID
sed -i.bak "s/database_id = \".*\"/database_id = \"$DB_ID\"/" wrangler.toml
rm -f wrangler.toml.bak

# Initialize schema
echo "Setting up schema..."
wrangler d1 execute codemeld-db --file=schema.sql

# Install dependencies
echo "Installing dependencies..."
npm install
cd frontend && npm install && cd ..

echo ""
echo "Setup complete!"
echo ""
echo "To run locally:"
echo "  Terminal 1: npx wrangler dev"
echo "  Terminal 2: cd frontend && npm run dev"
echo ""
echo "Then open http://localhost:5173"
