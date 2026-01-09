# CodeMeld

Real-time collaborative code editor with AI assistance, running on Cloudflare.

## Setup

**Prerequisites:** Node.js 18+, Cloudflare account

```bash
npm install
chmod +x setup.sh
./setup.sh
```

The setup script creates your D1 database and configures everything automatically.

## Local Development

Frontend:
```bash
cd frontend
npm run dev
```

Backend (separate terminal):
```bash
npx wrangler dev
```

Open `http://localhost:5173` and start coding. Open multiple tabs to test realtime sync.

## Deploy

```bash
# Deploy frontend
cd frontend
npm run build
npx wrangler pages deploy dist

# Deploy backend
cd ..
npx wrangler deploy
```

## How It Works

- **Realtime sync** via Yjs CRDT over WebSocket (no polling, no request spam)
- **Durable Objects** manage session state on Cloudflare's edge
- **AI completions** powered by Cloudflare Workers AI
- **Monaco editor** for VS Code-like editing experience

Share the session link to collaborate. Edits sync instantly across all connected users.

## Tech Stack

- React + TypeScript + Monaco Editor
- Cloudflare Workers + Durable Objects
- Yjs CRDT for conflict-free sync
- D1 SQLite database
- Workers AI (Llama)
