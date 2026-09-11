import * as Y from 'yjs';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import * as sync from 'y-protocols/sync';
import { Awareness, applyAwarenessUpdate, removeAwarenessStates } from 'y-protocols/awareness';
import { IndexeddbPersistence } from 'y-indexeddb';
import {
  SYNC,
  AWARENESS,
  syncStep,
  documentUpdate,
  presenceUpdate,
  AGENT_COMMAND,
  AGENT_STATE,
  jsonMessage,
} from '../../../shared/protocol';
import { initialAgentState, type AgentCommand, type AgentState } from '../../../shared/workspace';

export type ConnectionStatus = 'connecting' | 'live' | 'offline';
export class CanvasProvider {
  readonly awareness: Awareness;
  readonly persistence: IndexeddbPersistence;
  status: ConnectionStatus = 'connecting';
  agent: AgentState = initialAgentState();
  private socket: WebSocket | null = null;
  private destroyed = false;
  private retry: ReturnType<typeof setTimeout> | undefined;
  private attempts = 0;
  private listeners = new Set<() => void>();

  constructor(
    readonly doc: Y.Doc,
    readonly room: string,
  ) {
    this.awareness = new Awareness(doc);
    this.persistence = new IndexeddbPersistence('forma:' + room, doc);
    doc.on('update', this.onDocument);
    this.awareness.on('update', this.onAwareness);
    this.persistence.whenSynced.then(() => {
      if (!this.destroyed) this.connect();
    });
    window.addEventListener('online', this.reconnect);
    window.addEventListener('pagehide', this.onPageHide);
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private setStatus(status: ConnectionStatus) {
    this.status = status;
    this.listeners.forEach((fn) => fn());
  }
  private send(data: Uint8Array) {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(data);
  }
  command(command: AgentCommand) {
    if (this.status !== 'live') return false;
    if (command.action === 'settings') {
      this.agent = { ...this.agent, settings: command.settings };
      this.listeners.forEach((fn) => fn());
    }
    this.send(jsonMessage(AGENT_COMMAND, command));
    return true;
  }
  private onDocument = (update: Uint8Array, origin: unknown) => {
    if (origin !== this) this.send(documentUpdate(update));
  };
  private onAwareness = (
    { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ) => {
    if (origin === this || origin === 'disconnect') return;
    const local = [...added, ...updated, ...removed].filter((id) => id === this.doc.clientID);
    if (local.length) this.send(presenceUpdate(this.awareness, local));
  };
  private onPageHide = () => {
    this.awareness.setLocalState(null);
  };
  private reconnect = () => {
    if (this.socket && this.socket.readyState <= WebSocket.OPEN) return;
    clearTimeout(this.retry);
    this.connect();
  };
  private connect() {
    if (this.destroyed) return;
    this.setStatus('connecting');
    const base = new URL(import.meta.env.VITE_WS_URL || window.location.origin);
    base.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
    base.pathname = '/ws/' + this.room;
    if (new URLSearchParams(location.search).get('empty') === '1')
      base.searchParams.set('empty', '1');
    const socket = new WebSocket(base);
    socket.binaryType = 'arraybuffer';
    this.socket = socket;
    socket.onopen = () => {
      this.attempts = 0;
      this.send(syncStep(this.doc));
      this.send(presenceUpdate(this.awareness, [this.doc.clientID]));
    };
    socket.onmessage = (event) => {
      try {
        const decoder = decoding.createDecoder(new Uint8Array(event.data));
        const type = decoding.readVarUint(decoder);
        if (type === SYNC) {
          const encoder = encoding.createEncoder();
          encoding.writeVarUint(encoder, SYNC);
          const subtype = sync.readSyncMessage(decoder, encoder, this.doc, this);
          if (encoding.length(encoder) > 1) this.send(encoding.toUint8Array(encoder));
          if (subtype === sync.messageYjsSyncStep2) this.setStatus('live');
        } else if (type === AWARENESS) {
          applyAwarenessUpdate(this.awareness, decoding.readVarUint8Array(decoder), this);
        } else if (type === AGENT_STATE) {
          this.agent = JSON.parse(decoding.readVarString(decoder)) as AgentState;
          this.listeners.forEach((fn) => fn());
        }
      } catch (error) {
        console.error('Canvas sync failed', error);
        socket.close(1002, 'Invalid server message');
      }
    };
    socket.onclose = () => {
      if (this.destroyed) return;
      this.setStatus('offline');
      removeAwarenessStates(
        this.awareness,
        [...this.awareness.getStates().keys()].filter((id) => id !== this.doc.clientID),
        'disconnect',
      );
      this.retry = setTimeout(() => this.connect(), Math.min(1000 * 2 ** this.attempts++, 15000));
    };
    socket.onerror = () => socket.close();
  }
  destroy() {
    this.awareness.setLocalState(null);
    this.destroyed = true;
    clearTimeout(this.retry);
    this.socket?.close();
    window.removeEventListener('online', this.reconnect);
    window.removeEventListener('pagehide', this.onPageHide);
    this.doc.off('update', this.onDocument);
    this.awareness.off('update', this.onAwareness);
    this.awareness.destroy();
    void this.persistence.destroy();
    this.listeners.clear();
  }
}
