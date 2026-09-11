import * as Y from 'yjs';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import * as sync from 'y-protocols/sync';
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from 'y-protocols/awareness';
import {
  SYNC,
  AWARENESS,
  SAVED,
  syncStep,
  documentUpdate,
  presenceUpdate,
  awarenessClientIds,
  AGENT_COMMAND,
  AGENT_STATE,
  jsonMessage,
} from '../../shared/protocol';
import { seedDocument } from '../../shared/seed';
import type { Env } from './index';
import { WorkspaceAgent } from './WorkspaceAgent';
import { createGenerator } from './AgentModel';
import { codeOf, replaceCode, INITIALIZE_ORIGIN, type AgentSettings } from '../../shared/workspace';
import { canvasToCode } from '../../shared/translation';
import { metadataOf, nodesOf } from '../../shared/canvas';

export class SessionManager {
  private doc = new Y.Doc();
  private awareness = new Awareness(this.doc);
  private sockets = new Map<WebSocket, Set<number>>();
  private ready: Promise<void>;
  private queue: Promise<void> = Promise.resolve();
  private room = '';
  private revision = 0;
  private changed = false;
  private agent!: WorkspaceAgent;
  private agentPresence!: Awareness;

  constructor(
    private state: DurableObjectState,
    private env: Env,
  ) {
    this.awareness.setLocalState(null);
    this.ready = state.blockConcurrencyWhile(async () => {
      const stored = await state.storage.get<Uint8Array>('document');
      this.room = (await state.storage.get<string>('room')) ?? '';
      this.revision = (await state.storage.get<number>('revision')) ?? 0;
      if (stored) Y.applyUpdate(this.doc, stored, INITIALIZE_ORIGIN);
      this.changed = false;
      this.agent = new WorkspaceAgent(
        this.doc,
        {
          engine: env.AI ? 'workers-ai' : 'structural',
          generate: createGenerator(env.AI, env.AGENT_MODEL),
          commit: (work) =>
            this.enqueue(async () => {
              const before = Y.encodeStateVector(this.doc);
              work();
              if (this.changed) {
                await this.persist();
                this.broadcast(documentUpdate(Y.encodeStateAsUpdate(this.doc, before)));
              }
            }),
          retain: (promise) => state.waitUntil(promise),
          saveSettings: (settings) => state.storage.put('agentSettings', settings),
          publish: (status) => {
            this.broadcast(jsonMessage(AGENT_STATE, status));
            this.agentPresence?.setLocalStateField('agent', {
              busy: status.busy,
              engine: status.engine,
            });
          },
        },
        await state.storage.get<AgentSettings>('agentSettings'),
      );
      this.agentPresence = new Awareness(this.agent.doc);
      this.agentPresence.on('update', () =>
        applyAwarenessUpdate(
          this.awareness,
          encodeAwarenessUpdate(this.agentPresence, [this.agent.doc.clientID]),
          'agent-presence',
        ),
      );
      this.agentPresence.setLocalState({
        user: { name: 'Forma agent', color: '#597d68', role: 'agent' },
        agent: { busy: false, engine: env.AI ? 'workers-ai' : 'structural' },
      });
    });
    this.doc.on('update', () => {
      this.changed = true;
      // Every mutation path persists before broadcasting; presence is separate.
    });
    this.awareness.on(
      'update',
      ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }) => {
        this.broadcast(presenceUpdate(this.awareness, [...added, ...updated, ...removed]));
      },
    );
  }

  async fetch(request: Request): Promise<Response> {
    await this.ready;
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket')
      return new Response('WebSocket required', { status: 426 });
    // Serialize first-join initialization with incoming document mutations.
    await this.enqueue(async () => {
      if (!this.room) {
        const url = new URL(request.url);
        this.room = url.pathname.split('/').at(-1)!;
        const recovered = await this.env.DB.prepare(
          'SELECT state, revision FROM canvas_documents WHERE id = ?',
        )
          .bind(this.room)
          .first<{ state: number[]; revision: number }>();
        if (recovered) {
          Y.applyUpdate(this.doc, new Uint8Array(recovered.state), 'seed');
          this.revision = recovered.revision;
        } else seedDocument(this.doc, url.searchParams.get('empty') === '1');
        await this.persist();
      }
      if (metadataOf(this.doc).get('codeInitialized') !== '1') {
        this.doc.transact(() => {
          if (!codeOf(this.doc).length)
            replaceCode(
              codeOf(this.doc),
              nodesOf(this.doc).size > 500
                ? '// Canvas.tsx\nexport {};\n'
                : canvasToCode(this.doc).code!,
            );
          metadataOf(this.doc).set('codeInitialized', '1');
        }, INITIALIZE_ORIGIN);
        await this.persist();
      }
    });
    if (this.sockets.size >= 50) return new Response('Room is full', { status: 503 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.binaryType = 'arraybuffer';
    server.accept();
    this.sockets.set(server, new Set());
    server.addEventListener('message', (event) => {
      this.state.waitUntil(
        this.enqueue(async () => {
          try {
            if (typeof event.data === 'string' || event.data.byteLength > 2 * 1024 * 1024)
              throw new Error('Invalid message');
            await this.receive(server, new Uint8Array(event.data));
          } catch (error) {
            console.error('Canvas message rejected', error);
            server.close(1008, 'Invalid collaboration message');
            this.disconnect(server);
          }
        }),
      );
    });
    server.addEventListener('close', () => this.disconnect(server));
    server.addEventListener('error', () => this.disconnect(server));
    server.send(syncStep(this.doc));
    server.send(jsonMessage(AGENT_STATE, this.agent.state));
    const clients = [...this.awareness.getStates().keys()];
    if (clients.length) server.send(presenceUpdate(this.awareness, clients));
    return new Response(null, { status: 101, webSocket: client });
  }

  private enqueue(work: () => Promise<void>): Promise<void> {
    const next = this.queue.then(work);
    this.queue = next.catch((error) => console.error('Canvas operation failed', error));
    return next;
  }

  private async receive(socket: WebSocket, message: Uint8Array) {
    const decoder = decoding.createDecoder(message);
    const type = decoding.readVarUint(decoder);
    if (type === SYNC) {
      const before = Y.encodeStateVector(this.doc);
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, SYNC);
      sync.readSyncMessage(decoder, encoder, this.doc, socket);
      if (this.changed) {
        await this.persist();
        this.broadcast(documentUpdate(Y.encodeStateAsUpdate(this.doc, before)));
      }
      if (encoding.length(encoder) > 1) socket.send(encoding.toUint8Array(encoder));
      socket.send(new Uint8Array([SAVED]));
    } else if (type === AWARENESS) {
      const update = decoding.readVarUint8Array(decoder);
      if (update.byteLength > 16384) throw new Error('Awareness too large');
      const ids = awarenessClientIds(update);
      const owned = this.sockets.get(socket)!;
      for (const id of ids) {
        if (id === this.agent.doc.clientID) throw new Error('The agent identity is reserved');
        for (const [other, clients] of this.sockets)
          if (other !== socket && clients.has(id)) throw new Error('Awareness ID already owned');
        if (!owned.has(id) && owned.size >= 1) throw new Error('One awareness identity per socket');
        owned.add(id);
      }
      applyAwarenessUpdate(this.awareness, update, socket);
    } else if (type === AGENT_COMMAND) {
      const json = decoding.readVarString(decoder);
      if (json.length > 12000) throw new Error('Agent command is too large');
      await this.agent.command(JSON.parse(json));
    } else throw new Error('Unknown message');
  }

  private async persist() {
    this.revision++;
    await this.state.storage.put({
      document: Y.encodeStateAsUpdate(this.doc),
      room: this.room,
      revision: this.revision,
    });
    this.changed = false;
    if ((await this.state.storage.getAlarm()) === null)
      await this.state.storage.setAlarm(Date.now() + 1500);
  }

  async alarm() {
    await this.ready;
    await this.enqueue(async () => {
      const data = Y.encodeStateAsUpdate(this.doc);
      await this.env.DB.prepare(
        'INSERT INTO canvas_documents (id, state, revision, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET state = excluded.state, revision = excluded.revision, updated_at = excluded.updated_at',
      )
        .bind(this.room, data, this.revision, Date.now())
        .run();
    });
  }

  private broadcast(message: Uint8Array) {
    for (const socket of this.sockets.keys()) {
      try {
        socket.send(message);
      } catch {
        this.disconnect(socket);
      }
    }
  }

  private disconnect(socket: WebSocket) {
    const clients = this.sockets.get(socket);
    if (!clients) return;
    this.sockets.delete(socket);
    removeAwarenessStates(this.awareness, [...clients], 'disconnect');
  }
}
