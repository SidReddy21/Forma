#!/bin/bash

# CodeMeld Setup Script
# Initializes all necessary Cloudflare resources

set -e

echo "🚀 CodeMeld Setup Script"
echo "========================"
echo ""

# Check prerequisites
echo "Checking prerequisites..."
command -v wrangler &> /dev/null || { echo "❌ wrangler CLI not found. Install: npm install -g wrangler"; exit 1; }
command -v node &> /dev/null || { echo "❌ Node.js not found. Install Node 18+"; exit 1; }
echo "✅ Prerequisites met"
echo ""

# Login
echo "Logging in to Cloudflare..."
wrangler login
echo ""

# Create D1 Database
echo "Creating D1 Database..."
DB_OUTPUT=$(wrangler d1 create codemeld-db --yes)
DB_ID=$(echo "$DB_OUTPUT" | grep -oP "database_id = \K[^}]*" | tr -d "'" | head -1)
echo "✅ Database created: $DB_ID"
echo ""

# Initialize schema
echo "Initializing database schema..."
wrangler d1 execute codemeld-db --file schema.sql
echo "✅ Schema initialized"
echo ""

# Create KV namespaces
echo "Creating KV namespaces..."
KV_OUTPUT=$(wrangler kv:namespace create "CACHE" --yes)
KV_ID=$(echo "$KV_OUTPUT" | grep -oP "id = \K[^,]*" | tr -d '"' | head -1)
KV_PREVIEW=$(echo "$KV_OUTPUT" | grep -oP "preview_id = \K[^,]*" | tr -d '"')
echo "✅ KV namespace created: $KV_ID"
echo ""

# Update wrangler.toml
echo "Updating wrangler.toml..."
sed -i.bak "s/database_id = \"your-db-id\"/database_id = \"$DB_ID\"/g" wrangler.toml
sed -i.bak "s/id = \"your-kv-id\"/id = \"$KV_ID\"/g" wrangler.toml
sed -i.bak "s/preview_id = \"your-preview-id\"/preview_id = \"$KV_PREVIEW\"/g" wrangler.toml
rm wrangler.toml.bak
echo "✅ wrangler.toml updated"
echo ""

# Install dependencies
echo "Installing dependencies..."
npm install
cd frontend && npm install && cd ..
echo "✅ Dependencies installed"
echo ""

echo "🎉 Setup complete!"
echo ""
echo "Next steps:"
echo "1. Review DEPLOYMENT.md for configuration"
echo "2. Run: npm run dev (backend)"
echo "3. Run: cd frontend && npm run dev (frontend)"
echo "4. Open http://localhost:5173"
