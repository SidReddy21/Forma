# VortexCode

A real-time collaborative code editor with intelligent AI analysis, running on Cloudflare's edge infrastructure.

**Features:**
- Real-time code collaboration (Yjs CRDT for conflict-free sync)
- Multi-language code execution (C++, Python, Java via Piston API)
- AI-powered code analysis (compile errors, runtime issues, improvements)
- Live presence indicators and instant name updates
- Session sharing and persistence

---

## Prerequisites

- **Node.js 18+** (for local dev and frontend build)
- **Cloudflare account** (with Workers, Durable Objects, and D1 access enabled)
- **npm** or **yarn**

---

## Local Development Setup

### 1. Clone and Install

```bash
git clone https://github.com/SidReddy21/CloudflareTesting.git
cd CloudflareProject
npm install
```

### 2. Configure Environment Variables

**Frontend** (`.env.production` — already configured for production):
```env
VITE_API_URL=https://vortex-code.sidreddy21.workers.dev
```

For local dev, the frontend will proxy to `localhost:8787` (Wrangler dev server). No additional config needed.

**Backend** (no `.env` file needed; Cloudflare bindings auto-injected):
- Ensure `wrangler.toml` has bindings for `AI`, `DB`, and `SESSIONS` (Durable Objects).

### 3. Initialize D1 Database

```bash
npx wrangler d1 migrations apply vortex-code-db --local
```

This creates the local D1 database with the schema from `schema.sql`.

### 4. Start Development Servers

**Terminal 1 — Wrangler (Backend + D1):**
```bash
npx wrangler dev
```

This starts a local Worker at `http://localhost:8787` with D1 and Durable Objects emulation.

**Terminal 2 — Frontend:**
```bash
cd frontend
npm install
npm run dev
```

This starts Vite dev server at `http://localhost:5173`.

### 5. Test Realtime Collaboration

- Open `http://localhost:5173` in two browser tabs.
- Write code in one tab; see it sync in real-time to the other.
- Click "Create Session" to generate a new collaborative workspace.

---

## Cloud Deployment (Cloudflare)

### Prerequisites
- Cloudflare account with Workers, Durable Objects, and Pages enabled
- `wrangler` CLI: `npm install -g wrangler`
- GitHub repo (for Pages auto-deploy)

### 1. Configure Cloudflare

```bash
# Login to Cloudflare
wrangler login

# Create D1 database (if not exists)
npx wrangler d1 create vortex-code-db
```

Update `wrangler.toml` with your D1 database ID:
```toml
[env.production]
d1_databases = [
  { binding = "DB", database_id = "your-db-id" }
]
```

### 2. Deploy Backend (Workers)

```bash
npx wrangler deploy
```

Output will show your Worker URL:
```
https://vortex-code.sidreddy21.workers.dev
```

### 3. Configure Frontend Environment

Update `frontend/.env.production`:
```env
VITE_API_URL=https://vortex-code.sidreddy21.workers.dev
```

### 4. Build and Deploy Frontend (Pages)

```bash
cd frontend
npm run build
cd ..

npx wrangler pages deploy frontend/dist --project-name=vortexcode
```

Your site is now live at `https://vortexcode.pages.dev`.

### 5. Set Up GitHub Auto-Deploy (Optional)

In the [Cloudflare Pages dashboard](https://dash.cloudflare.com), connect your GitHub repo to the `vortexcode` project. Enable auto-deploy on push to `main`.

---

## Architecture Overview

### Frontend
- **React + TypeScript**: Component-based UI with Zustand state management.
- **Monaco Editor**: VS Code-like code editing.
- **Yjs**: CRDT for real-time, conflict-free sync.

### Backend
- **Cloudflare Workers**: Stateless API layer handling sessions, realtime, and AI.
- **Durable Objects**: Server-authoritative session state machine with per-session queues.
- **D1**: SQLite database for persistent session history.
- **Workers AI**: Llama 3.3 for code analysis.
- **Piston API**: External runtime for C++, Python, Java execution.

### Realtime Flow
1. Client edits → Monaco editor updates Yjs CRDT.
2. Yjs sends updates to Worker via HTTP polling (2s cadence).
3. Worker queues updates in Durable Object.
4. Next sync poll returns updates + collaborators to all clients.
5. Clients apply remote updates; Monaco reflects changes.

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/sessions` | Create new session |
| GET | `/api/sessions/:id` | Fetch session content |
| POST | `/api/realtime/sync` | Sync Yjs updates + fetch collaborators |
| POST | `/api/realtime/join` | Register presence |
| POST | `/api/ai/analyze` | Analyze code (execution + AI insights) |
| POST | `/api/execute` | Run code and return output/errors |

---

## Environment Files

### `.env.production` (Frontend)
Points to the production Worker URL:
```env
VITE_API_URL=https://vortex-code.sidreddy21.workers.dev
```

### `wrangler.toml` (Backend)
Contains all Cloudflare bindings and config:
```toml
name = "vortex-code"
main = "backend/src/index.ts"

[env.production]
vars = { ENVIRONMENT = "production" }
d1_databases = [{ binding = "DB", database_id = "..." }]
durable_objects.bindings = [{ name = "SESSIONS", class_name = "SessionManager" }]
```

---

## Local vs. Cloudflare: Key Differences

| Aspect | Local Dev | Cloudflare |
|--------|-----------|-----------|
| **Startup** | Instant (dev servers only) | ~30s (Workers cold start) |
| **D1 Database** | SQLite emulated locally | Real SQLite on Cloudflare |
| **AI Analysis** | Mock fallback (heuristic) | Llama 3.3 via Workers AI |
| **Durable Objects** | Emulated in-memory | Real edge instance |
| **Cost** | Free | Free tier (limited RPS/compute) |
| **Persistence** | Lost on restart | Persisted globally |
| **Multi-region** | Single machine | Distributed edge |

**Recommendation:** Develop locally for speed; test on Cloudflare before shipping.

---

## Development Workflow

### Add a Feature

1. Create a feature branch:
   ```bash
   git checkout -b feature/my-feature
   ```

2. Develop locally (`npm run dev` + `npx wrangler dev`).

3. Test in multiple tabs to verify realtime sync.

4. Commit and push:
   ```bash
   git add -A
   git commit -m "feat: add my feature"
   git push origin feature/my-feature
   ```

5. Open a pull request on GitHub.

6. Deploy to staging (optional) or directly to production after merge.

### Deploy Changes

**Backend:**
```bash
npx wrangler deploy
```

**Frontend:**
```bash
cd frontend && npm run build && cd ..
npx wrangler pages deploy frontend/dist --project-name=vortexcode
```

Or enable GitHub auto-deploy in Cloudflare Pages dashboard.

---

## Troubleshooting

### "Cannot find module" errors during build
```bash
npm install
cd frontend && npm install && cd ..
```

### Wrangler version outdated
```bash
npm install --save-dev wrangler@latest
```

### D1 migrations fail locally
```bash
npx wrangler d1 migrations apply vortex-code-db --local --force
```

### Frontend can't reach backend
Check `frontend/.env.production`:
- Local: should point to `http://localhost:8787` (or not needed; Vite proxies automatically).
- Production: should point to your Worker URL (e.g., `https://vortex-code.sidreddy21.workers.dev`).

### Code execution timeouts
Piston API has 10-second limits. Very long-running programs will timeout. Acceptable for most snippets.

---

## Code Structure

```
.
├── backend/
│   └── src/
│       ├── index.ts           # Worker router & API handlers
│       ├── ai.ts              # AI service (analysis, completions)
│       ├── execute.ts         # Piston execution helpers
│       ├── SessionManager.ts  # Durable Object for session state
│       └── types.ts           # Shared TypeScript types
├── frontend/
│   └── src/
│       ├── App.tsx            # Main layout
│       ├── components/        # React components
│       ├── store/             # Zustand stores
│       ├── services/          # API client
│       └── realtime/          # Yjs binding & sync loop
├── wrangler.toml             # Cloudflare config
└── schema.sql                # D1 schema
```

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 18, TypeScript, Vite, Monaco Editor, Zustand, Tailwind |
| **Backend** | Cloudflare Workers, Durable Objects, D1 SQLite |
| **Realtime** | Yjs CRDT, HTTP polling |
| **AI** | Llama 3.3 (Workers AI), Piston API |
| **Hosting** | Cloudflare Workers (backend), Cloudflare Pages (frontend) |

---

## License

MIT

---

## Questions?

Check [PROMPTS.md](./PROMPTS.md) for architectural decisions and design rationale.
