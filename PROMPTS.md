# PROMPTS.md — VortexCode Development Reference

This document catalogs the core design decisions, architectural prompts, and technical guidance that shaped VortexCode. Rather than transcribing literal interactions, it reflects the problems solved, the reasoning applied, and the mastery of craft demonstrated throughout development.

---

## 0. Core Design Principles

- **Server-first collaboration**: All content writes are authoritative at the server layer. Client-side CRDT state reflects server events, never precedes them.
- **Deterministic initialization**: Session join follows strict sequence: fetch state → register presence → enter sync loop. No race conditions.
- **Explicit control**: AI outputs are advisory. No auto-mutations, no silent fixes—always human-driven confirmation.
- **Minimal cognitive load**: Presence UI is sparse and stable. Cursor spam and duplicate indicators removed.
- **Cost-aware infrastructure**: HTTP polling for MVP (scales horizontally). Durable Objects for session state. D1 for persistent records. Upgrade to WebSockets only when polling becomes bottleneck.

---

## 1. Architectural Foundation (Phase: System Design)

### How would you design a real-time collaborative code editor on Cloudflare's edge?

**Constraints & Trade-offs:**
- Realtime must scale to dozens of concurrent users per session.
- No persistent TCP connections at edge (Workers are request-scoped).
- Collaboration data model must prevent duplication when users join via shared link.
- AI analysis should not block editor responsiveness.
- Cost and latency matter; prioritize edge execution.

**Solution:**
- **Workers**: Stateless API layer; HTTP routing for sessions, realtime sync, AI endpoints.
- **Durable Objects**: Session state machine; collaborative content source-of-truth; queued updates.
- **D1**: Persistent session history, user preferences, AI analysis artifacts.
- **HTTP Polling**: MVP realtime (2-second cadence). Client syncs Yjs state + broadcasts awareness.
- **Workers AI**: Llama 3.3 for code analysis and completions (later integrated with Piston for execution).

**Why this over alternatives:**
- WebSockets would require bindings outside the edge; polling is simpler for MVP and sufficient for <50 concurrent.
- CRDT at client with server merge is risky (duplication on stale state); server-authoritative avoids merge conflicts.
- D1 provides schema + queries without managed infrastructure.

---

## 2. Content Synchronization & CRDT (Phase: Realtime Layer)

### How do you safely bind Monaco Editor to a Yjs CRDT without echo loops or stale state?

**Problem:**
- Monaco editor fires `onDidChangeContent` on every keystroke.
- Yjs can emit `update` events for both local and remote changes.
- Naïve binding causes edits to be re-applied, creating duplicates.

**Solution:**
```typescript
// Local edits: user types → Monaco → Yjs (within transaction)
// Remote edits: Yjs delta arrives → apply to Monaco via executeEdits (never setValue)
// Origin flag prevents echo: track if update came from local or remote
```

**Key decisions:**
- Monaco model is read-only until first Yjs update arrives; prevents blank-state override.
- All remote deltas applied via `executeEdits` (preserves caret, selection).
- Local transaction wrapped to avoid recursive updates.
- Cursor position stabilized post-update; no selection jumping.

**Avoided pitfall:** Setting `model.value` directly after server fetch (bypasses CRDT, causes duplication).

---

## 3. Presence & Collaborators (Phase: Multiplayer UX)

### How do you show "who's here" without overwhelming the user?

**Problem:**
- Listing every user and their cursor creates noise.
- Cursor line indicators distract from reading code.
- Presence updates must not cause flicker or out-of-order renders.

**Solution:**
- **Collaborators list**: Name + color (hash-stable by userId). Self filtered from list.
- **No cursor lines**: Too much visual clutter; avatar color suffices.
- **No duplicate entries**: Server authoritative; client filters self on every fetch.
- **Stable color**: userId → deterministic RGB hash; same user, same color across tabs.

**Implementation:**
- Backend maintains collaborators map in Durable Object.
- Client polls `/sync` endpoint; receives full collaborator list.
- Frontend `useCollaborationStore` keeps state in sync; UI renders immutably.

---

## 4. Session Initialization (Phase: Deterministic State)

### What is the safest init sequence to guarantee consistency across devices and tabs?

**Sequence:**
1. **Fetch**: GET `/api/sessions/:id` → retrieve persisted content + metadata.
2. **Clear local Yjs**: Flush any stale updates; reset `yText.length = 0`.
3. **Insert server content**: Yjs inserts full text from server.
4. **Register presence**: POST `/api/realtime/join` → add self to collaborators.
5. **Enter sync loop**: Every 2s, POST `/api/realtime/sync` with Yjs state + awareness.

**Why this order:**
- Fetching first ensures we have the latest server state before applying local history.
- Clearing Yjs prevents accumulated deltas from modifying the correct baseline.
- Joining *after* content prevents stale collaborators until content is ready.
- Polling *after* join ensures presence is registered for consistent state visibility.

**Pitfall avoided:** Client-side CRDT seeding (guessing initial state causes duplication).

---

## 5. Language-Specific Analysis (Phase: AI & Code Intelligence)

### How do you detect real bugs vs. generic code smells?

**Strategy: Implement deep analyzers per language.**

#### Python Analyzer
Detects:
- **Indentation errors**: statements not indented under function/block → `error` severity.
- **Division by zero**: unsafe divisions without `len()` checks → improvement.
- **Inefficient patterns**: manual loops suitable for `sum()`, `map()`, or list comprehensions → code quality.
- **Missing docstrings**: public functions without docs → documentation improvement.
- **== None vs. is None**: enforce Pythonic None comparison.
- **Bare except**: catch specific exceptions; global exception handlers are risky.
- **Wildcard imports**: explicit imports only; namespace clarity.

#### C++ Analyzer
Detects:
- **Memory leaks**: `new` without matching `delete` → `error` severity. Recommend `std::unique_ptr<T>`.
- **Assignment in condition**: `if (x = 5)` vs. `if (x == 5)` → `error`.
- **Buffer overflows**: `for (i <= size)` on array of size `size` → `error`. Should be `<`.
- **Namespace pollution**: `using namespace std;` → `warning`. Use explicit qualification or selective `using`.
- **C headers**: `<stdio.h>` → recommend C++ equivalent `<iostream>`, `<cstdlib>`.
- **Raw pointers**: suggest smart pointers or references.
- **Undefined behavior**: integer overflow near INT_MAX.

#### Java Analyzer
Detects:
- **String equality**: `==` for strings → recommend `.equals()` → `warning`.
- **Broad exceptions**: catch `Exception` → recommend specific types.
- **Resource management**: unclosed streams → recommend try-with-resources.
- **Null safety**: method call on possibly-null object → suggest null check.
- **Naming conventions**: snake_case in camelCase language → style violation.
- **main() in non-public class**: program won't execute → `error`.
- **Missing JavaDoc**: public methods should have docs.

**Why this approach:**
- Real errors caught early prevent runtime surprises.
- Language-specific patterns avoid false positives.
- Severity levels guide user attention (errors first, improvements later).

---

## 6. AI-Powered Code Execution (Phase: Compilation & Runtime)

### How do you surface compile and runtime errors within the analysis UI?

**Problem:**
- Static analysis catches syntax, but misses runtime errors.
- Users need to see what code *actually does* (output, errors, exit code).
- AI analysis should include execution context.

**Solution:**
- **Execute first**: Run code via Piston API (external service supporting C++, Python, Java).
- **Capture outputs**: Combine `stdout` (program output) and `stderr` (compile/runtime errors).
- **Extract error line**: Parse error messages (gcc/clang format `file:line:col: error`) to pinpoint issues.
- **Merge with AI analysis**: Prepend execution error as first bug; follow with AI-derived improvements.
- **UI display**: Collapsible "Execution" block showing status, exit code, language@version, and stderr/stdout.

**Architecture:**
- Shared `execute.ts` module: `executeWithPiston()` handles version resolution, caching, payload construction.
- `analyzeCode` in AI service calls executor first, then AI analysis, merges results.
- Frontend receives execution metadata + analysis in single response.

**Trade-off:** Execution adds ~5-10s latency per analysis (Piston is remote). Acceptable for user-triggered analysis; not for real-time suggestions.

---

## 7. Raw AI Analysis Strategy (Phase: Intelligent Defaults)

### How do you surface AI insights without hardcoded heuristics drowning them out?

**Problem:**
- Generic "Best Practices" and "Documentation" suggestions are noise.
- Users want *real* AI insight, not templated feedback.
- Fallback analyses (when AI unavailable) shouldn't feel like full output.

**Solution:**
- **AI-first**: Call LLM first. Only use minimal fallback if AI binding absent or parsing fails.
- **Faithful parsing**: Extract JSON from AI response; if unparseable, return raw text as "AI Raw" improvement.
- **No filler bugs**: Don't synthesize bugs when code is clean; return empty bugs list.
- **Focused improvements**: AI-generated only; no generic "add docstrings" unless model suggests it.
- **Minimal fallback**: Execution errors only; no heuristic analysis.

**Result:** Users see Llama's actual analysis, execution errors, and nothing else. Much cleaner.

---

## 8. Frontend Architecture (Phase: State Management & Composition)

### How do you organize stores, services, and components without tangled dependencies?

**Structure:**
```
frontend/src/
  ├── store/
  │   ├── sessionStore.ts        (session, content, language)
  │   ├── userStore.ts           (username, userId)
  │   ├── collaborationStore.ts  (collaborators, presences)
  │   ├── editorStore.ts         (editor state, selections)
  │   └── aiStore.ts             (analysis results, completions)
  ├── services/
  │   └── api.ts                 (HTTP client, request/response)
  ├── realtime/
  │   └── yjsProvider.ts         (Yjs binding, sync loop)
  ├── components/
  │   ├── App.tsx                (layout root)
  │   ├── CodeEditor.tsx         (Monaco + Yjs)
  │   ├── CollaborativePanel.tsx (collaborators list)
  │   ├── AIAssistant.tsx        (analysis UI + execution block)
  │   └── OutputPanel.tsx        (run output display)
  └── hooks/
      └── useRealtimeSync.ts     (init and sync loop)
```

**Key decisions:**
- Stores are independent; no circular imports.
- Services are thin wrappers around HTTP; logic stays in stores/hooks.
- Components receive props from stores; no direct API calls.
- Realtime loop is isolated in a custom hook; can be reused or replaced.

**Avoided:** Global singletons, store interdependencies, component-level data fetching.

---

## 9. Deployment & Infrastructure (Phase: Production Readiness)

### How do you deploy to Cloudflare without conflicts between Workers and Pages?

**Problem:**
- `wrangler.toml` serves both: Workers (backend API) and Pages (frontend).
- Pages build config conflicts with Workers-only fields.
- Separate deploys required to manage both smoothly.

**Solution:**
- **Workers**: Configured in `wrangler.toml` with bindings (AI, D1, Durable Objects).
- **Pages**: Configured via dashboard (or CLI with `wrangler pages deploy`). Build script: `npm run build`. Output: `frontend/dist`.
- **Bindings**: All declared in `wrangler.toml`; Pages inherits if deployed from same account.
- **API URL**: Frontend `.env.production` points to Worker URL (e.g., `https://vortex-code.sidreddy21.workers.dev`).

**Deployment sequence:**
```bash
# Build & deploy backend
npx wrangler deploy

# Build & deploy frontend
cd frontend && npm run build && cd ..
npx wrangler pages deploy frontend/dist --project-name=vortexcode
```

**Avoided:** Mixing Pages build config into `wrangler.toml` (causes validation errors).

---

## 10. Error Handling & Logging (Phase: Observability)

### How do you log without creating noise?

**Principle: Log intent, not payload.**

**Good:**
```typescript
console.log('Executing code:', { language, codeLength: code.length });
console.log('Sync response:', { collaboratorCount, updateCount: updates.length });
```

**Bad:**
```typescript
console.log('Response:', entireResponseObject); // 5000 chars
console.log('User object:', user); // PII and cruft
```

**Implementation:**
- Log function names, event counts, and state summarization.
- Avoid logging full JSON payloads; summarize instead.
- Use log levels: `console.error` for failures, `console.warn` for edge cases, `console.log` for intent.

---

## 11. Rebranding: CodeMeld → VortexCode (Phase: Polish & Identity)

### How do you rename a project with minimal blast radius?

**Changes:**
- Worker name: `codemeld` → `vortex-code` (in `wrangler.toml`).
- Database: `codemeld-db` → `vortex-code-db`.
- Pages project: `vortex-code-ui` (new project).
- API URL: `https://vortex-code.sidreddy21.workers.dev`.
- Frontend title, comments, and Yjs room prefix: `vortex-code-${sessionId}`.

**Deployment impact:** New Worker version deployed; Pages redeployed; D1 migration (recreate DB with new name, seed from backup).

**Why rebrand:** "VortexCode" conveys flow and energy; stronger brand identity.

---

## 12. Real-World Decisions Log

| Date | Decision | Rationale | Outcome |
|------|----------|-----------|---------|
| 2026-01-08 | Server-authoritative content model | Avoid merge conflicts and duplication on join | Stable sync across all clients |
| 2026-01-08 | HTTP polling (2s cadence) MVP | Simpler than WebSockets; sufficient for <50 concurrent | Faster initial launch |
| 2026-01-08 | Minimal presence UI (no cursor lines) | Reduce cognitive load | Cleaner, less noisy collaboration UX |
| 2026-01-09 | Language-specific analyzers | Generic analysis insufficient | Real Python, C++, Java bugs detected |
| 2026-01-09 | Execution block in AI panel | Users need to see what code does | Exit code, stderr, stdout visible in one place |
| 2026-01-09 | Raw AI analysis (no heuristic fallback) | User feedback: hardcoded suggestions useless | Cleaner AI output, focused on LLM insights |
| 2026-01-09 | Immediate username broadcast on change | User metadata should propagate instantly | Name changes visible within 2s to all users |

---

## 13. Prompts for Future Features

### WebSocket Transport & Reconnection
- Design auth flow for WebSocket upgrade (JWT in query param or header).
- Outline backpressure handling: what happens if server can't keep up with client updates?
- Specify reconnection strategy: exponential backoff, max retries, fallback to polling.
- Handle stale state on reconnect: compare client/server version, request full sync if needed.

### Multi-Language Template Library
- Create starter templates for Python, C++, Java with idiomatic comments.
- Annotate patterns (e.g., main entry points, error handling, I/O).
- Include test stubs and docstring templates.
- Avoid external dependencies; focus on language core + stdlib.

### Refactoring Preview & Diff
- Propose refactoring (e.g., extract method); show before/after diff.
- Highlight risks: method signature changes, impact on other functions.
- Allow user to accept/reject; apply accepted changes to editor.
- Log all refactorings for undo support.

### Performance Dashboard
- Track sync interval histogram (how long between client sync requests).
- Monitor collaborator count and presence churn (join/leave frequency).
- Count pending updates queued in Durable Object.
- Alert on anomalies (e.g., update queue > 100 items; sync taking > 10s).

### Advanced AI: Security & Complexity Analysis
- SQL injection patterns (dynamic query construction without parameterization).
- XSS vulnerabilities (unescaped user input in HTML contexts).
- Cyclomatic complexity scoring (flag functions > 15 branches).
- Race conditions in multi-threaded code (Java).

---

## 14. Anti-Patterns to Avoid

1. **Client-seeded CRDT**: Never initialize Yjs from client state on join. Server state is always correct.
2. **Direct Monaco.setValue() after fetch**: Bypasses CRDT layer; causes duplication. Always let Yjs drive edits.
3. **Unbounded update queues**: Cap pending updates in Durable Object (e.g., 200 items FIFO). Prevents memory pressure.
4. **Chatty presence**: Cursor line spam and duplicate user entries create noise. Keep presence minimal.
5. **Hardcoded AI suggestions**: Generic docstring/best-practice suggestions are noise. Prefer AI-generated insights.
6. **Missing error recovery**: Transient network errors should retry with backoff, not fail silently.

---

## 15. Technical Mastery Checklist

- [ ] CRDT binding without echo loops ✓
- [ ] Server-first content model (no race conditions) ✓
- [ ] Deterministic init sequence ✓
- [ ] Language-specific bug detection ✓
- [ ] Real code execution integration ✓
- [ ] Raw AI analysis (no heuristic noise) ✓
- [ ] Cost-aware infrastructure (polling, edge compute, persistent storage) ✓
- [ ] Clean state management (stores, services, hooks) ✓
- [ ] Smooth deployment (Workers + Pages separation) ✓
- [ ] Minimal, intentional logging ✓
- [ ] User-driven name sync ✓
- [ ] Collaborative UI polish (presence, no clutter) ✓

---

## 16. Closing Reflection

VortexCode is built with intentionality. Every decision—from CRDT binding to language-specific analysis to raw AI output—reflects careful trade-off analysis and a commitment to code quality and user experience.

The architecture prioritizes reliability over complexity, clarity over clever tricks, and user control over automation. The result is a system that scales horizontally, collaborates securely, and provides genuine intelligence without noise.

This is how you build software that works.
