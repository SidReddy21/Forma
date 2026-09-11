import * as Y from 'yjs';
import {
  addNode,
  nodesOf,
  patchNode,
  readNode,
  readNodes,
  resolvedParents,
  type CanvasNode,
} from '../../shared/canvas';
import {
  AGENT_ORIGIN,
  REPLICA_ORIGIN,
  INITIALIZE_ORIGIN,
  codeOf,
  replaceCode,
  initialAgentState,
  type AgentCommand,
  type AgentDirection,
  type AgentEvent,
  type AgentSettings,
  type AgentState,
  type Translation,
} from '../../shared/workspace';
import { parseCode } from '../../shared/translation';
import type { Generate } from './AgentModel';

interface AgentHost {
  generate: Generate;
  engine: AgentState['engine'];
  commit: (work: () => void) => Promise<void>;
  publish: (state: AgentState, clientID: number) => void;
  retain: (promise: Promise<void>) => void;
  saveSettings: (settings: AgentSettings) => Promise<void>;
  debounceMs?: number;
}
const fields = new Set([
  'name',
  'parentId',
  'x',
  'y',
  'width',
  'height',
  'rotation',
  'fill',
  'stroke',
  'strokeWidth',
  'opacity',
  'radius',
  'text',
  'fontSize',
  'bold',
  'visible',
  'sourceId',
  'targetId',
]);
const numeric = new Set([
  'x',
  'y',
  'width',
  'height',
  'rotation',
  'strokeWidth',
  'opacity',
  'radius',
  'fontSize',
]);
const kinds = new Set(['frame', 'group', 'rectangle', 'ellipse', 'text', 'line']);

export class WorkspaceAgent {
  readonly doc = new Y.Doc();
  state: AgentState;
  private epoch = 0;
  private generation = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private pending: { direction: AgentDirection; prompt?: string; selection?: string[] } | null =
    null;
  private active: AgentEvent | null = null;
  private destroyed = false;
  constructor(
    private source: Y.Doc,
    private host: AgentHost,
    settings?: AgentSettings,
  ) {
    this.state = { ...initialAgentState(), engine: host.engine, ...(settings ? { settings } : {}) };
    Y.applyUpdate(this.doc, Y.encodeStateAsUpdate(source), REPLICA_ORIGIN);
    source.on('update', this.onUpdate);
    source.on('afterTransaction', this.onTransaction);
  }
  private onUpdate = (update: Uint8Array) => {
    Y.applyUpdate(this.doc, update, REPLICA_ORIGIN);
  };
  private onTransaction = (transaction: Y.Transaction) => {
    if ([AGENT_ORIGIN, INITIALIZE_ORIGIN, 'seed'].includes(transaction.origin)) return;
    const parents: ReadonlyMap<unknown, unknown> = transaction.changedParentTypes;
    const direct: ReadonlyMap<unknown, unknown> = transaction.changed;
    const canvas = parents.has(nodesOf(this.source));
    const code = direct.has(codeOf(this.source));
    if (!canvas && !code) return;
    this.epoch++;
    if (!this.state.settings.auto) return;
    const direction = code ? 'code-to-canvas' : 'canvas-to-code';
    if (this.authorized(direction)) this.schedule({ direction });
  };
  private authorized(direction: AgentDirection) {
    return direction === 'canvas-to-code'
      ? this.state.settings.code
      : direction === 'code-to-canvas'
        ? this.state.settings.canvas
        : this.state.settings.canvas || this.state.settings.code;
  }
  async command(value: unknown) {
    if (!value || typeof value !== 'object') throw new Error('Invalid agent command');
    const command = value as AgentCommand;
    if (command.action === 'settings') {
      const settings = command.settings;
      if (
        !settings ||
        ['auto', 'canvas', 'code'].some(
          (key) => typeof settings[key as keyof AgentSettings] !== 'boolean',
        )
      )
        throw new Error('Invalid agent settings');
      this.state.settings = { auto: settings.auto, canvas: settings.canvas, code: settings.code };
      this.cancel();
      await this.host.saveSettings(this.state.settings);
      this.publish();
    } else if (command.action === 'cancel') this.cancel();
    else if (command.action === 'run') {
      if (!['canvas-to-code', 'code-to-canvas', 'prompt'].includes(command.direction))
        throw new Error('Invalid translation direction');
      if (
        command.prompt !== undefined &&
        (typeof command.prompt !== 'string' || command.prompt.length > 4000)
      )
        throw new Error('Prompt must be under 4,000 characters.');
      if (
        command.selection !== undefined &&
        (!Array.isArray(command.selection) ||
          command.selection.length > 500 ||
          command.selection.some((id) => typeof id !== 'string'))
      )
        throw new Error('Invalid selection');
      if (!this.authorized(command.direction)) {
        this.record(
          command.direction,
          'error',
          'Agent write permission is disabled for this direction.',
        );
        return;
      }
      if (this.state.busy) {
        this.record(
          command.direction,
          'error',
          'The agent is already working. Cancel it or wait for completion.',
        );
        return;
      }
      this.schedule({
        direction: command.direction,
        prompt: command.prompt,
        selection: command.selection,
      });
    } else throw new Error('Unknown agent command');
  }
  private schedule(request: NonNullable<WorkspaceAgent['pending']>) {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.pending = request;
    // One trailing timer and one in-flight invocation per room.
    this.timer = setTimeout(() => {
      this.timer = undefined;
      if (!this.state.busy) this.host.retain(this.runPending());
    }, this.host.debounceMs ?? 1200);
    const previous = this.state.events[0];
    if (previous?.status === 'queued') {
      previous.direction = request.direction;
      previous.at = Date.now();
    } else this.record(request.direction, 'queued', 'Waiting for edits to settle.');
    this.publish();
  }
  private async runPending() {
    if (this.destroyed || !this.pending || this.state.busy) return;
    const request = this.pending;
    this.pending = null;
    if (!this.authorized(request.direction)) return;
    const epoch = this.epoch;
    const generation = this.generation;
    this.state.busy = true;
    this.active = this.record(
      request.direction,
      'running',
      request.direction === 'prompt'
        ? request.prompt || 'Working on the workspace.'
        : request.direction === 'canvas-to-code'
          ? 'Reading canvas geometry and connections.'
          : 'Parsing the code structure.',
    );
    const active = this.active;
    const snapshot = new Y.Doc();
    Y.applyUpdate(snapshot, Y.encodeStateAsUpdate(this.doc));
    try {
      const translation = await this.host.generate({ ...request, doc: snapshot });
      if (this.destroyed || generation !== this.generation) return;
      await this.host.commit(() => {
        if (
          generation !== this.generation ||
          epoch !== this.epoch ||
          !this.authorized(request.direction)
        ) {
          active.status = 'discarded';
          active.message = 'The workspace changed during generation. This result was not applied.';
          return;
        }
        this.validate(translation);
        const before = Y.encodeStateVector(this.doc);
        this.doc.transact(() => this.apply(translation), AGENT_ORIGIN);
        Y.applyUpdate(this.source, Y.encodeStateAsUpdate(this.doc, before), AGENT_ORIGIN);
        active.status = 'applied';
        active.message = translation.message.slice(0, 1000);
      });
    } catch (error) {
      if (generation === this.generation) {
        active.status = 'error';
        active.message =
          error instanceof Error ? error.message : 'Generation failed. No changes were applied.';
      }
    } finally {
      snapshot.destroy();
      this.state.busy = false;
      this.active = null;
      this.publish();
      if (this.pending && !this.timer && !this.destroyed) this.schedule(this.pending);
    }
  }
  private validate(result: Translation) {
    if (!result || typeof result !== 'object') throw new Error('Invalid translation.');
    if (result.code !== undefined) {
      if (!this.state.settings.code) throw new Error('The agent is not authorized to edit code.');
      if (typeof result.code !== 'string') throw new Error('Invalid code output.');
      parseCode(result.code);
    }
    if (result.nodes !== undefined || result.remove !== undefined) {
      if (!this.state.settings.canvas)
        throw new Error('The agent is not authorized to edit canvas.');
      if (
        !Array.isArray(result.nodes ?? []) ||
        !Array.isArray(result.remove ?? []) ||
        (result.nodes?.length ?? 0) > 500 ||
        (result.remove?.length ?? 0) > 500
      )
        throw new Error('Invalid canvas patch.');
      const ids = new Set<string>();
      for (const change of result.nodes ?? []) {
        if (
          !change ||
          typeof change.id !== 'string' ||
          change.id.length > 200 ||
          ids.has(change.id) ||
          !change.values ||
          typeof change.values !== 'object'
        )
          throw new Error('Invalid or duplicate node ID.');
        ids.add(change.id);
        const old = readNode(this.doc, change.id);
        if (old?.locked) throw new Error('A target layer is locked.');
        if (!old && (!change.id.startsWith('agent:') || !kinds.has(change.values.type ?? '')))
          throw new Error('New nodes need an agent ID and valid type.');
        if (old && change.values.type && old.type !== change.values.type)
          throw new Error('Changing an existing node type is not supported.');
        for (const [key, value] of Object.entries(change.values)) {
          if (
            numeric.has(key) &&
            (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 100000)
          )
            throw new Error('Invalid geometry.');
          if (['name', 'fill', 'stroke', 'text'].includes(key) && typeof value !== 'string')
            throw new Error('Invalid node text or color.');
          if (['bold', 'visible'].includes(key) && typeof value !== 'boolean')
            throw new Error('Invalid node visibility or typography.');
          if (typeof value === 'string' && value.length > 10000)
            throw new Error('Node text is too large.');
          if (
            ['parentId', 'sourceId', 'targetId'].includes(key) &&
            value !== null &&
            typeof value !== 'string'
          )
            throw new Error('Invalid node relationship.');
        }
        if (
          (change.values.type ?? old?.type) !== 'line' &&
          [change.values.width, change.values.height].some((n) => n !== undefined && n <= 0)
        )
          throw new Error('Shape dimensions must be positive.');
        if (
          change.values.opacity !== undefined &&
          (change.values.opacity < 0 || change.values.opacity > 1)
        )
          throw new Error('Invalid opacity.');
        if (
          change.values.fontSize !== undefined &&
          (change.values.fontSize < 1 || change.values.fontSize > 512)
        )
          throw new Error('Invalid font size.');
      }
      for (const id of result.remove ?? [])
        if (
          typeof id !== 'string' ||
          readNode(this.doc, id)?.managedBy !== 'agent' ||
          readNode(this.doc, id)?.locked
        )
          throw new Error('Only unlocked agent-created nodes can be removed.');
      const planned = new Map(readNodes(this.doc).map((node) => [node.id, node]));
      for (const change of result.nodes ?? [])
        planned.set(change.id, {
          ...planned.get(change.id),
          ...change.values,
          id: change.id,
        } as CanvasNode);
      for (const id of result.remove ?? []) planned.delete(id);
      const parents = resolvedParents([...planned.values()]);
      for (const change of result.nodes ?? []) {
        const node = planned.get(change.id)!;
        if (node.parentId && parents.get(node.id) !== node.parentId)
          throw new Error('The proposed hierarchy contains an invalid parent or cycle.');
        if ([node.sourceId, node.targetId].some((id) => id && (!planned.has(id) || id === node.id)))
          throw new Error('A connection endpoint is missing.');
      }
    }
    if (typeof result.message !== 'string') throw new Error('Invalid agent message.');
  }
  private apply(result: Translation) {
    if (result.code !== undefined) replaceCode(codeOf(this.doc), result.code);
    // New parent records can follow children in the patch; relationships are IDs.
    for (const change of result.nodes ?? []) {
      const values = Object.fromEntries(
        Object.entries(change.values).filter(([key]) => fields.has(key)),
      ) as Partial<CanvasNode>;
      if (nodesOf(this.doc).has(change.id)) patchNode(this.doc, change.id, values);
      else
        addNode(this.doc, {
          ...values,
          id: change.id,
          type: change.values.type!,
          managedBy: 'agent',
          sourceKey: change.id,
        });
    }
    for (const id of result.remove ?? []) nodesOf(this.doc).delete(id);
  }
  private record(direction: AgentDirection, status: AgentEvent['status'], message: string) {
    const event = { id: crypto.randomUUID(), at: Date.now(), direction, status, message };
    this.state.events = [event, ...this.state.events.filter((e) => e.status !== 'queued')].slice(
      0,
      20,
    );
    this.publish();
    return event;
  }
  private publish() {
    if (!this.destroyed) this.host.publish(this.state, this.doc.clientID);
  }
  cancel() {
    this.generation++;
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    this.pending = null;
    if (this.active) {
      this.active.status = 'cancelled';
      this.active.message = 'Cancelled. No pending result will be applied.';
    }
    this.state.events = this.state.events.filter((e) => e.status !== 'queued');
    this.publish();
  }
  destroy() {
    this.destroyed = true;
    this.cancel();
    this.source.off('update', this.onUpdate);
    this.source.off('afterTransaction', this.onTransaction);
    this.doc.destroy();
  }
}
