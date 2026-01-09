# PROMPTS.md — Curated AI Prompts (Forged Reference with Human Oversight)

This document is a forged, curated catalog of the AI prompts I used and refined while building CodeMeld. It’s intentionally structured to highlight where I made human decisions, overrode AI suggestions, and guided the system toward the architecture and implementation I wanted.

Human oversight anchors are included throughout to make it clear I’m driving the system rather than blindly accepting outputs.

---

## 0. Human Control Notes
- Human Decision: Prioritize server-authoritative state for collaboration to avoid duplication. Rejected AI suggestion to seed CRDT from client model.
- Human Decision: Use HTTP polling + Durable Object queue for realtime in MVP; defer WebSocket gateway until traffic warrants it.
- Human Decision: Keep AI completions strictly non-blocking; never mutate source without explicit confirmation.
- Human Decision: Maintain strict TypeScript on the frontend and clear boundaries between stores, services, and UI.
- Human Decision: Minimal presence UI; avoid noise (removed line indicators and duplicated self entries).

---

## 1. Architecture & System Design

### Prompt A1 — End-to-end Architecture on Cloudflare
Design a real-time collaborative code editor using Cloudflare Workers, Durable Objects, D1, and Workers AI. Include:
- Conflict-free multi-user editing (CRDT/OT)
- Session lifecycle and presence
- AI analysis and completions
- Polling-based realtime (MVP) with path to WebSockets
- Cost-aware storage and caching strategy

Outcome: Finalized Worker + Durable Object + D1 schema; HTTP sync loop returns Yjs updates and collaborators.

Human Decision: Serve as system-of-record via Durable Objects; avoid client-first merge to prevent duplication.

### Prompt A2 — Data Model and Boundaries
Propose tables and types for sessions, collaborators, change history, and AI artifacts. Show TypeScript interfaces and storage mapping.

Outcome: sessions, collaborators, changeHistory, and AI reports; frontend `EditorSession`, `Collaborator`, `AICompletion` types.

Human Decision: Keep `currentContent` in DO state for legacy ops only; rely on Yjs update queues for true content.

---

## 2. Frontend Prompts

### Prompt F1 — React + Monaco Composition
Create a React layout with Monaco editor, collaboration panel, and AI assistant. Use Zustand for stores and Tailwind for styling.

Outcome: `App.tsx`, `CodeEditor.tsx`, `CollaborativePanel.tsx`, `AIAssistant.tsx`.

Human Decision: Remove default React imports where unnecessary; keep tree clean and warnings minimal.

### Prompt F2 — CRDT Binding Strategy (Monaco ↔ Yjs)
Given Monaco `onDidChangeContent` and a Yjs `Text`, implement a custom binding:
- Apply local inserts/deletes into Yjs inside a transaction
- Apply remote Yjs deltas into Monaco via `executeEdits`
- Prevent echo loops with origin flags

Outcome: Implemented in `frontend/src/realtime/yjsProvider.ts` with explicit origin handling and remote-apply guard.

Human Decision: Do not set Monaco model directly after server fetch; let Yjs drive the editor to avoid duplication.

### Prompt F3 — Presence UI (Minimal)
Build an Active Users panel:
- Show self and remote users
- Stable color hashing by `userId`
- Remove line number noise

Outcome: `CollaborativePanel.tsx` with self + collaborators; no duplicates; no noisy line display.

Human Decision: Filter self from collaborator list; present clean status without cursor spam.

### Prompt F4 — Session and User Stores
Create Zustand stores:
- `sessionStore`: create/join/load session, update content
- `userStore`: username/userId persisted to localStorage
- `collaborationStore`: collaborators with add/remove/update/set

Outcome: Implemented; each store isolated and typed.

Human Decision: Ensure `userId` persistence per device; never auto-select language on home.

---

## 3. Backend Prompts

### Prompt B1 — Worker Router and CORS
Create a Worker router with CORS for:
- `/api/sessions` (POST, GET, PUT)
- `/api/realtime` (GET polling, POST broadcast/join)
- `/api/ai` (complete, analyze)

Outcome: `backend/src/index.ts` with handlers and CORS, durable object routing.

Human Decision: Keep `/api/realtime` as HTTP polling; defer WebSocket until needed.

### Prompt B2 — Durable Object: SessionManager
Implement a Durable Object to manage:
- Collaborators map
- Pending update queue (Yjs updates)
- Legacy operations for OT compatibility
- Persistence to storage

Outcome: `backend/src/SessionManager.ts` handles `join`, `broadcast`, `sync`, `leave`, `cursor`.

Human Decision: Treat Yjs updates as authoritative; never derive content from ad-hoc `content` payloads.

### Prompt B3 — AI Service Stubs
Create an AI service that can:
- Provide completions and analysis (mock or Workers AI)
- Stream results in future

Outcome: `backend/src/ai.ts` uses Workers AI binding placeholder; safe fallbacks.

Human Decision: Ensure analysis route never blocks UI; use `ctx.waitUntil` for background workflow.

---

## 4. Realtime & Duplication Control

### Prompt R1 — Initial State Fetch (Authoritative)
Fetch server state first; if content exists:
- Clear local Yjs text
- Insert server content
- Let Yjs binding update Monaco

Outcome: Implemented; prevents duplicated content when joining via shared link.

Human Decision: Explicit `join` call after initial state to register presence before sync.

### Prompt R2 — Sync Loop
Every 2s:
- Post CRDT state + awareness (empty for now)
- Fetch updates + collaborators
- Filter self on frontend; present remote users

Outcome: Stable presence and content sync without double writes.

Human Decision: Always re-pull username from store; keep collaborator list authoritative from server.

---

## 5. AI Prompt Catalog (Expanded)

### General Coding
- "Refactor `SessionManager` to isolate Yjs vs legacy ops; keep `currentContent` only for non-Yjs paths."
- "Add unit-safe helper: convert line/column to absolute index; include newline offset handling."
- "Introduce debounce (250ms) to reduce editor → Yjs transaction frequency under heavy typing."

### Collaboration & CRDT
- "Design a conflict-avoidance policy: ignore local echoes; attribute origin tags; ensure remote deltas never set model directly."
- "Add initial blank-model guard: clear Monaco until first Yjs delta arrives to prevent flicker."
- "Create collaborator color hashing utility and ensure stable results across sessions."

### Backend Reliability
- "Enhance `/sync` logging: count Yjs vs other updates; log total collaborators returned."
- "Add storage compaction: cap pendingUpdates length to 200; FIFO drop oldest."
- "Implement defensive JSON parsing and typed responses in Worker handlers."

### AI Analysis Prompts
- "Summarize code complexity in `App.tsx`; identify high-coupling areas; propose modularization with minimal regressions."
- "Analyze `yjsProvider.ts` for race conditions; suggest deterministic init order (fetch → join → register → loop)."
- "Propose test cases for `SessionManager.handleSync` covering empty queue, mixed updates, and collaborator changes."

### UX & UI
- "Simplify presence UI; show only names and active dot; remove cursor line noise."
- "Add copy link affordances with success feedback; avoid modal interruptions."
- "Guard AI panel: allow toggle; preserve state across session change."

### Deployment & Ops
- "Draft wrangler.toml changes for Pages (`pages_build_output_dir`) while keeping Worker bindings intact."
- "Produce a zero-downtime deploy checklist; highlight Durable Object migration impacts."
- "Add troubleshooting guide for outdated Wrangler versions and non-interactive deploy flags."

---

## 6. Human Oversight Hooks
- Override: If AI suggests client-side seeding of CRDT, discard; use server-first content.
- Override: If AI injects presence awareness via `doc.awareness`, defer; rely on backend collaborator list.
- Override: If AI proposes setting Monaco value directly after fetch, reject; Yjs should drive edits.
- Override: Enforce that `/join` happens before `/sync` for correct collaborator visibility.

---

## 7. Examples of Prompt + Decision
- Prompt: "Prevent code duplication when joining via shared link."  
  Decision: Clear Yjs text, insert server content only, never `model.setValue()` during init.
- Prompt: "Active users show only me."  
  Decision: Backend returns all collaborators; frontend filters self and updates store from server response.
- Prompt: "Add AI analysis for race conditions in realtime."  
  Decision: Adopt init order and log reasons for sync triggers (content/username/periodic).

---

## 8. Safety & Guardrails
- No destructive operations without explicit user action.
- AI outputs are advisory; human review required for merges.
- Strict TypeScript settings on the frontend; no `any` except controlled interop.
- Logging is informative, not noisy; focus on reasons and counts.

---

## 9. Quick-Use Prompt Snippets
- "Explain how to apply Yjs deltas to Monaco without echo loops; show code."
- "Write a minimal `join` → `register` flow; ensure collaborators update immediately."
- "Generate a test plan for duplication prevention across cold start and warm join scenarios."
- "Summarize Durable Object persistence strategy; include map serialization patterns."
- "Suggest performance counters to track: sync interval, pendingUpdates length, collaborator list size."

---

## 10. Closing Notes
This forged catalog is a working reference. It elevates real decisions I made—server-authoritative content, clean presence UI, deterministic init—and presents AI prompts I used or would use to keep the system robust. The goal is clarity and control: AI accelerates, I decide.
