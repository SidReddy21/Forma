# PROMPTS.md — Curated AI Prompts with Human Oversight

This document is a curated catalog of the AI prompts I used and refined while building VortexCode. It’s intentionally structured to highlight where I made human decisions, overrode AI suggestions, and guided the system toward the architecture and implementation I wanted.

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
This catalog is a working reference. It elevates real decisions I made—server-authoritative content, clean presence UI, deterministic init—and presents AI prompts I used or would use to keep the system robust. The goal is clarity and control: AI accelerates, I decide.

---

## 11. Language-Specific Prompt Sets

### C++
- "Generate a minimal CMake-less C++ template with `int main()` and comments suited for teaching, no I/O until requested."
- "Suggest safe memory practices for C++ snippets in this editor context; avoid raw pointers unless pedagogically necessary."
- "Refactor sample C++ function to be exception-safe; use RAII and predictable destructors."

### Python
- "Provide a concise script starter with a clear `if __name__ == '__main__':` entrypoint; include one docstring template."
- "Recommend type hints for a given Python function; keep runtime dependencies zero unless explicitly allowed."
- "Suggest test cases with `pytest` style given code; minimal fixtures."

### Java
- "Produce a simple `public class Main` with a deterministic `main` method; avoid external libs."
- "Propose refactoring steps to extract methods for readability without increasing cyclomatic complexity."
- "Outline JUnit-style tests for a small utility class; include boundary conditions."

---

## 12. Monaco & Editor UX Prompt Sets
- "Describe best-practice `executeEdits` usage to apply remote deltas without causing selection jumps; keep caret stable."
- "Provide guidance on theming choices for readability in dark UI; avoid overly saturated colors."
- "Suggest debounce intervals for high-frequency updates; explain trade-offs for 150ms vs 250ms vs 400ms."

---

## 13. Error Messaging & Recovery Prompts
- "Craft succinct user-facing error messages for session join failures; avoid jargon, provide next step."
- "Design logging phrasing that emphasizes ‘reason’ and ‘count’ instead of raw payload dumps."
- "Propose a retry strategy for transient network issues with capped exponential backoff."

---

## 14. AI Guardrails Prompts
- "List guardrails that prevent AI from mutating source without confirmation; include UI affordances for accept/reject."
- "Explain prompt patterns that yield analyses rather than code changes, and when to prefer each."
- "Define a lightweight rubric to score AI suggestions on readability, correctness, and risk."

---

## 15. Decision Journal
Entries demonstrating human oversight that steered outcomes:
- "2026-01-08 — Realtime init order changed to fetch → join → register → loop. Reason: eliminate duplication; Outcome: stable first render."
- "2026-01-08 — Presence UI simplified (removed line indicators). Reason: reduce cognitive noise; Outcome: clearer collaborator display."
- "2026-01-09 — CRDT seeding from client removed. Reason: avoid race with server content; Outcome: consistent state across tabs."
- "2026-01-09 — Backend deploy held via wrangler; updated to default command path. Reason: CLI stability; Outcome: successful Worker deploy."

---

## 16. Anti-Patterns Avoided
- Client-seeded CRDT state during init (causes duplication).
- Direct `model.setValue()` after server fetch (bypasses CRDT flow).
- Overly chatty presence indicators (cursor line spam).
- Unbounded update queues (risk of memory pressure in Durable Objects).

---

## 17. Prompt Backlog (Future Work)
- "Enable WebSocket transport; outline auth, reconnect, and backpressure handling."
- "Implement AI refactoring preview diff UI; highlight risks and edge cases."
- "Add multi-language template library with annotations explaining idiomatic patterns."
- "Create performance dashboard: sync interval histogram, queue length, collaborator count trends."

---

## 18. Style Guide for Prompting
- Be specific: include constraints, performance goals, and safety rails.
- Prefer analyses first: ask for rationale before code changes.
- Keep outputs minimal: short lists, clear steps; no noisy logs.
- Call out human decisions explicitly: note overrides and reasons.


---

## 19. AI Analysis Enhancements (2026-01-09)

### Prompt A3 — Language-Specific Code Analysis
Implement detailed analyzers for Python, C++, and Java that detect real bugs, not generic placeholders:

**Python Analyzer:**
- Indentation errors: statement not indented under function/block → `severity: error`
- Division by zero: detect unsafe divisions without `len()` checks → improvement suggestion
- Inefficient patterns: manual loops suitable for `sum()` → code quality suggestion
- Missing docstrings: functions without documentation → documentation improvement
- `== None` vs `is None`: enforce proper None comparison
- Bare except clauses: catch specific exceptions
- Wildcard imports: explicit imports only

**C++ Analyzer:**
- Memory leaks: `new` without `delete` → `severity: error`, recommend smart pointers
- `using namespace std`: namespace pollution → `severity: warning`
- C-style arrays: recommend `std::string` or `std::array`
- Raw pointers: suggest smart pointers or references
- C headers: suggest C++ equivalents (`<iostream>` vs `<stdio.h>`)
- Null pointer dereference: check before `->` operator

**Java Analyzer:**
- String comparison with `==`: detect and recommend `.equals()` → `severity: warning`
- Broad exception catching: specific exception types only
- Try-with-resources: AutoCloseable resource management
- Null safety: method calls on potentially null objects
- Naming conventions: camelCase enforcement, JavaDoc on public methods
- main() placement in non-public class → `severity: error`

Outcome: `backend/src/ai.ts` now features `analyzePython`, `analyzeCpp`, `analyzeJava` methods with real pattern detection.

Human Decision: Remove generic "No critical issues detected" fallback when actual bugs are found; ensure analyzers report language-specific threats.

### Prompt A4 — Remove Useless Metrics
Eliminate test coverage and code complexity metrics from AI output:
- Backend: Stop calculating and returning `testCoverage` and `complexity` fields
- Frontend: Hardcode these values (testCoverage=0, complexity='medium') rather than displaying
- UI: Remove complexity badge and test coverage percentage from `AIAssistant.tsx`

Outcome: AI analysis focused on actionable bugs and improvements, not vanity metrics.

Human Decision: User feedback stated both metrics were "horrible" and "useless"; removed entirely rather than improving.

### Prompt A5 — Immediate Username Sync on Change
Add real-time username propagation across all connected users:
- Store trigger function in global `__yjsTriggerSync` to allow userStore access
- When `setUsername()` is called, immediately post sync message to backend with new username
- Backend updates collaborators map and broadcasts on next client poll
- All clients pull fresh collaborator list including updated username

Outcome: Username changes visible to all users within 2 seconds; no waiting for next periodic sync.

Implementation files: `frontend/src/realtime/yjsProvider.ts` (triggerImmediateSync), `frontend/src/store/userStore.ts` (hook into setUsername).

Human Decision: Avoid forcing client to wait until next 2-second sync cycle; use on-demand sync for user-facing metadata changes.

---

## 20. Rebranding: CodeMeld → VortexCode (2026-01-09)

### Prompt R1 — Complete Rebranding
Rebrand the project from "CodeMeld" to "VortexCode" across all surfaces:

**Backend Changes:**
- `wrangler.toml`: worker name `codemeld` → `vortex-code`
- Database name: `codemeld-db` → `vortex-code-db`
- Code comments: "CodeMeld Backend" → "VortexCode Backend"
- API response names: update metadata references

**Frontend Changes:**
- `package.json`: `codemeld-frontend` → `vortex-code-frontend`
- `index.html`: page title "CodeMeld" → "VortexCode"
- `App.tsx`: landing page heading "CodeMeld" → "VortexCode"
- `.env.production`: API URL `codemeld` → `vortex-code`
- Yjs room prefix: `codemeld-${sessionId}` → `vortex-code-${sessionId}`

**Deployment:**
- New Cloudflare Pages project: `vortex-code-ui`
- New Worker endpoint: `vortex-code.sidreddypleaseworktesting.workers.dev`
- Database connection: `vortex-code-db`

Outcome: Complete rebranding with new URLs and all references updated.

Human Decision: Rebranding improves project identity; "VortexCode" suggests powerful collaborative flow. Worth redeploy cost.

---

## 21. Updated Decision Journal
- "2026-01-09 — AI metrics removed (testCoverage, complexity). Reason: useless per user; Outcome: cleaner AI output focused on bugs/improvements."
- "2026-01-09 — Language-specific analyzers implemented. Reason: generic analysis insufficient; Outcome: real Python indentation, C++ memory, Java string bugs detected."
- "2026-01-09 — Immediate username sync added. Reason: user metadata should propagate instantly; Outcome: all collaborators see name changes within 2s."
- "2026-01-09 — Rebranded to VortexCode. Reason: improve project identity; Outcome: new URLs, fresh branding, updated docs and frontend."

---

## 22. Future Enhancements for AI Analysis
- Multi-line pattern detection: trace variable usage across function boundaries
- Security analysis: SQL injection, XSS, path traversal patterns per language
- Performance hotspots: O(n²) loops, excessive allocations (C++), large-scale pandas ops (Python)
- Test coverage inference: estimate coverage based on function/class structure
- Refactoring suggestions: extract methods, reduce cyclomatic complexity with before/after diffs
- Framework-specific rules: Spring stereotypes (Java), async/await patterns (Python), const correctness (C++)

---

## 23. Closing Notes (Updated)
VortexCode is now a mature, real-time collaborative editor with:
- Server-authoritative realtime sync preventing duplication
- Language-specific AI analysis catching actual bugs
- Immediate username propagation for true collaboration
- Polished brand and clean UI
- Extensible architecture ready for WebSocket, multi-language AI, and advanced refactoring

The decision journal and anti-patterns catalog ensure future development maintains this clarity and control.
