# Forma

A collaborative vector canvas, Monaco code editor, and Workers AI agent built on Cloudflare Durable Objects and Yjs. React owns the surrounding interface; imperative Konva nodes own the drawing surface. The existing canvas, artwork, rooms, and editing tools are preserved.

## Run locally

Requires Node.js 22.18+ and npm. No Cloudflare account is needed for the local canvas, code editor, or deterministic structural translator.

```sh
npm install
npm run build:frontend
npm run db:init
npm run dev
```

Open http://127.0.0.1:8787. The first canvas contains editable poster studies. Use the Forma menu to create an empty canvas. Share the room URL to collaborate; opening that URL in another browser exercises the actual WebSocket connection.

For frontend hot reload, leave the Worker running and run `npm run dev:frontend` in another terminal. Vite proxies the WebSocket connection to port 8787.

### Enable Workers AI

The default environment uses a real Babel AST translator and deterministic linked TSX generation. It does **not** simulate LLM responses. Natural-language requests require the Workers AI binding:

```sh
npx wrangler login
npx wrangler d1 execute forma-db --env ai --local --file schema.sql
npm run dev:ai
```

Stop the default Worker first, or pass `-- --port 8788` to run the AI environment alongside it. Local environments have separate Durable Object storage. Workers AI inference runs remotely against your Cloudflare account and can incur usage charges. Canvas geometry, layer content, selected connection IDs, and the shared source file are sent to the model for AI requests. Configure `AGENT_MODEL` in `wrangler.toml` to change the model. Automatic translation starts disabled.

Use Canvas, Split, and Code to switch views; the Agent panel provides explicit translation commands, room-wide automatic sync, per-surface write permissions, cancellation, and result activity. Monaco includes syntax diagnostics, completion, find, folding, wrapping, code download, and collaborator selections. In split view, toolbar undo follows the last focused surface.

## Editing

- Move/select, hand, frame, rectangle, ellipse, line, and text tools.
- Drag to draw or click for a default size. Shift-click for multiple selection; drag an empty area for marquee selection.
- Resize and rotate shapes using canvas handles. Frame and group dragging moves their descendants. Frames use world coordinates and do not clip children.
- Edit geometry, fill, stroke, opacity, typography, and parent in the inspector.
- Drag a layer onto a frame/group to reparent; choose Page 1 in the parent selector to return it to the root.
- Group/ungroup, duplicate, delete, align, hide/lock, and send to front/back.
- PNG export at up to 2x, capped at 4096 pixels on the longest side; SVG export preserves vector geometry and explicit text line breaks. Automatic text wrapping can differ between SVG viewers and the canvas.
- Undo/redo tracks only this client's edits. IndexedDB retains document edits offline; reconnection exchanges Yjs state vectors to catch up.

Shortcuts: V move, H hand, F frame, R rectangle, O ellipse, L line, T text, Space pan, Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z redo, Ctrl/Cmd+D duplicate, Ctrl/Cmd+G group, Ctrl/Cmd+Shift+G ungroup, Delete remove, arrows nudge, Shift+arrows nudge 10, `[` send back, `]` bring front, Shift+1 fit canvas, Shift+2 fit selection. Wheel pans; Ctrl/Cmd+wheel zooms around the pointer.

## Architecture

```text
React interface       Imperative Konva scene       Monaco + y-monaco
       |                   | keyed shapes               |
       +---------------- Y.Doc -------------------------+
                |
      nodes: Y.Map<id, Y.Map<field, value>>
      code: Y.Text
      metadata: Y.Map<string>
                |
      y-protocols sync over binary WebSocket
                |
      One SessionManager Durable Object per room
                |                  |
                |          WorkspaceAgent Y.Doc replica
                |          own client ID + Awareness
                |          Babel AST / Workers AI
                |
      Durable Object document snapshot
                |
      Debounced D1 canvas_documents checkpoint

Awareness (user, cursor, canvasSelection, code selection, bounds, agent presence)
       <---- separate WebSocket message type ---->
       Memory only on server. Never persisted.
```

### Flat nodes and trees

`shared/canvas.ts` is the shared model. The top-level `nodes` dictionary provides direct ID lookup. Each record is a field-level Y.Map so concurrent movement and color edits can merge independently. There are no stored child arrays. A child's `parentId` is its only parent reference, making simultaneous reparenting converge without duplicated IDs.

Rendering and the layer tree derive their hierarchy from these records. Invalid or deleted parents resolve to the root. If concurrent moves form a cycle, the smallest node ID in that cycle becomes a derived root. This is deterministic and does not generate competing repair transactions.

### Ordering

Nodes hold lexicographically ordered fractional keys generated by the `fractional-indexing` package. Front/back operations change only the moved record. Concurrent equal keys use the node ID as a deterministic tie-breaker. Sibling order is derived locally; neither arrays nor numeric positions are rewritten in the shared document.

### Persistence and presence

`backend/src/SessionManager.ts` serializes initialization and document mutations. It writes a Yjs snapshot to Durable Object storage before broadcasting edits, then schedules a debounced D1 checkpoint. A pending alarm survives a Worker restart. D1 can restore a room when its Durable Object has no document snapshot.

Awareness has a distinct binary message branch. It never invokes the document persistence routine. The server tracks which awareness identity belongs to each socket and removes it on disconnect; protocol heartbeats expire stale clients. Pointer movement is throttled and preview bounding boxes remain ephemeral until a transform completes.

This implementation uses accepted WebSockets and an in-memory Y.Doc, rather than the WebSocket Hibernation API. Active rooms therefore keep their Durable Object alive. A room allows 50 concurrent connections and limits incoming message sizes. Room links grant edit access; there are no accounts, role-based permissions, or private-team authorization yet. This is intended for trusted shared workspaces, not untrusted public document hosting.

### Rendering

`frontend/src/canvas/CanvasEngine.ts` creates native Konva nodes in a keyed map. React never mounts canvas shapes and no React-Konva bindings are used. Separate content and overlay layers batch draw calls; presence updates only touch the overlay. The initial artwork is made entirely from editable vector nodes, with no external image dependencies.

### Agent as a client

`backend/src/WorkspaceAgent.ts` owns a separate Y.Doc with its own Yjs client ID. It subscribes to authoritative document updates, mirrors them into its replica, and authors accepted changes on that replica before merging them back through the Durable Object's serialized commit queue. Agent code and canvas edits are one validated transaction, persisted before broadcast. Both surfaces and their history share the same document checkpoint and browser IndexedDB record.

The server, not model output or client-provided origins, enforces agent write permissions. Changing permissions cancels queued work and invalidates in-flight results. Settings are saved separately in Durable Object storage; activity is bounded, in-memory only. All participants with the room link can change these settings. They are room-level agent capabilities, not user authentication or access-control roles.

### Bidirectional translation

- **Canvas to code:** `serializeCanvas` emits flat records, absolute bounding boxes, parent IDs, fractional order keys, and explicit connection endpoints. Workers AI receives this structured JSON together with source code and a linked TSX baseline. Without an AI binding, the structural translator generates linked SVG/TSX directly. It replaces the `data-forma-root` subtree, preserving surrounding code; when no linked root exists it appends a named component. A selection scopes the regenerated subtree.
- **Code to canvas:** Babel parses TypeScript/JSX without executing it. Literal JSX geometry, style, text, `data-node-id`, and `data-parent-id` update linked nodes. Unlinked components create agent-owned nodes; named functions/classes without JSX create a structure diagram with direct function-call connections. Both can coexist in one source file. Generated IDs are stable for named symbols and explicit JSX IDs; unkeyed JSX uses traversal identities, so add `data-node-id` to preserve identity through structural reorderings.
- Only obsolete **agent-created** nodes may be deleted. Original artwork is never removed by translation. Locked targets reject the entire result. A line's optional `sourceId`/`targetId` resolve to live endpoint geometry without adding child arrays or persisting drag previews; endpoints can also be assigned in the inspector.
- This is structural translation, not a browser layout engine or arbitrary-program visualization. Dynamic expressions, runtime data, imported implementations, CSS cascade, and flex/grid layout are not evaluated. Unsupported expressions retain existing geometry or use layout defaults. Invalid/incomplete syntax produces an activity error and leaves both surfaces untouched. Limits are 150,000 source characters, 500 patch nodes, 4,000 prompt characters, and a 45-second inference wait.

### Debounce and loop prevention

Human transactions schedule one trailing 1,200 ms timer per room. Only one generation runs at a time; newer edits replace the pending request. `AGENT_ORIGIN`, `REPLICA_ORIGIN`, and `INITIALIZE_ORIGIN` are process-local symbols. Agent-origin writes and initialization do not trigger the observer. Origins are not serialized by Yjs: remote clients echoing an already-applied agent update produce no new CRDT change, so an echo cannot start another generation.

Every human canvas/code change increments a document epoch. Generation captures this epoch and a cancellation generation, then checks both again inside the commit queue. A human edit to either surface, cancellation, or permission change prevents a stale result from overwriting newer work. Automatic mode schedules the latest request after an active call settles. Cancellation invalidates the result; it cannot undo inference already sent to Workers AI or its associated charges.

## Verify

```sh
npm run type-check
npm test
npm run build
npx playwright install chromium
# With the local Worker running:
npm run test:e2e
```

Model tests cover concurrent canvas edits/reparenting, ordering, Awareness isolation, SVG escaping, AST round-trips, linked-code preservation, agent identity, permissions, debounce/echo suppression, stale-result rejection, and invalid model output. Browser tests exercise actual canvas pixels, drawing, exports, offline catch-up, persistence, unchanged D1 revisions during presence traffic, two-browser Monaco synchronization, both translation directions, automatic syntax recovery, local code undo, and mobile split/agent layouts. Screenshots are written to `.local/`. Workers AI request/response contracts are tested with an injected binding; a live account is required to verify remote inference.

## Deploy

Create a D1 database with `npx wrangler d1 create forma-db`, then replace the placeholder `database_id` for the target environment in `wrangler.toml`. Apply `schema.sql` using `npx wrangler d1 execute forma-db --remote --file schema.sql` (add `--env ai` for the AI environment). Run `npm run deploy` for structural mode or `npm run deploy:ai` for Workers AI. Both publish the Worker and bundled frontend to the same origin. The existing `SessionManager` class and migration name are retained. Existing Forma documents gain a Y.Text without changing their canvas nodes; an existing nonempty `code` text is retained. Older pre-Forma code-editor schemas are not automatically imported.

## Protocol references

- [Yjs Awareness](https://docs.yjs.dev/api/about-awareness)
- [Yjs binary protocols](https://github.com/yjs/y-protocols/blob/master/PROTOCOL.md)
- [Fractional indexing](https://github.com/rocicorp/fractional-indexing)
- [Konva draw batching](https://konvajs.org/docs/performance/Batch_Draw.html)
- [Cloudflare WebSocket Durable Objects](https://developers.cloudflare.com/durable-objects/examples/websocket-server/)
- [Yjs Monaco binding](https://github.com/yjs/y-monaco)
- [Babel parser](https://babeljs.io/docs/babel-parser)
- [Workers AI with Wrangler](https://developers.cloudflare.com/workers-ai/get-started/workers-wrangler/)
- [Workers AI JSON mode](https://developers.cloudflare.com/workers-ai/features/json-mode/)
