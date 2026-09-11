import * as Y from 'yjs';
import { CanvasProvider } from '../realtime/yjsProvider';
import { codeOf } from '../../../shared/workspace';
import {
  LOCAL,
  addNode,
  deleteNodes,
  descendants,
  duplicateNodes,
  metadataOf,
  moveNodes,
  nodesOf,
  patchNode,
  readNode,
  readNodes,
  reparent,
  reorder,
  type CanvasNode,
  type NodeKind,
} from '../../../shared/canvas';

export type Tool = 'select' | 'hand' | 'frame' | 'rectangle' | 'ellipse' | 'text' | 'line';
export interface Presence {
  user: { name: string; color: string };
  cursor?: { x: number; y: number } | null;
  canvasSelection?: string[];
  bounds?: { x: number; y: number; width: number; height: number }[];
}
export class Workspace {
  readonly doc = new Y.Doc();
  readonly provider: CanvasProvider;
  readonly undo: Y.UndoManager;
  readonly codeUndo: Y.UndoManager;
  selected: string[] = [];
  tool: Tool = 'select';
  activeSurface: 'canvas' | 'code' = 'canvas';
  zoom = 1;
  grid = true;
  toast = '';
  private revision = 0;
  private listeners = new Set<() => void>();
  private toastTimer: ReturnType<typeof setTimeout> | undefined;
  private peopleSignature = '';
  constructor(readonly room: string) {
    this.provider = new CanvasProvider(this.doc, room);
    this.undo = new Y.UndoManager([nodesOf(this.doc), metadataOf(this.doc)], {
      trackedOrigins: new Set([LOCAL]),
      captureTimeout: 250,
    });
    this.codeUndo = new Y.UndoManager(codeOf(this.doc), {
      trackedOrigins: new Set(),
      captureTimeout: 500,
    });
    let name = localStorage.getItem('forma:name');
    if (!name) {
      name = 'Designer ' + Math.floor(100 + Math.random() * 900);
      localStorage.setItem('forma:name', name);
    }
    const colors = ['#398167', '#8d63b5', '#cc694c', '#397ca2'];
    this.provider.awareness.setLocalState({
      user: { name, color: colors[this.doc.clientID % colors.length] },
      cursor: null,
      canvasSelection: [],
      bounds: [],
    });
    this.doc.on('update', this.onUpdate);
    this.provider.subscribe(this.emit);
    this.provider.awareness.on('change', this.onPresence);
    this.undo.on('stack-item-added', this.emit);
    this.undo.on('stack-item-popped', this.emit);
    this.codeUndo.on('stack-item-added', this.emit);
    this.codeUndo.on('stack-item-popped', this.emit);
  }
  getSnapshot = () => this.revision;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  emit = () => {
    this.revision++;
    this.listeners.forEach((fn) => fn());
  };
  private onUpdate = () => {
    this.selected = this.selected.filter((id) => nodesOf(this.doc).has(id));
    this.emit();
  };
  private onPresence = () => {
    const signature = JSON.stringify(this.people);
    if (signature !== this.peopleSignature) {
      this.peopleSignature = signature;
      this.emit();
    }
  };
  get nodes() {
    return readNodes(this.doc);
  }
  get name() {
    return metadataOf(this.doc).get('name') ?? 'Opening canvas';
  }
  get people() {
    return [...this.provider.awareness.getStates()]
      .filter(([, state]) => state.user?.role !== 'agent')
      .map(([id, state]) => ({ id, ...(state.user as Presence['user']) }))
      .filter((p) => p.name);
  }
  rename(name: string) {
    if (name.trim()) this.doc.transact(() => metadataOf(this.doc).set('name', name.trim()), LOCAL);
  }
  select(ids: string[]) {
    this.activeSurface = 'canvas';
    this.selected = ids.filter((id) => !!readNode(this.doc, id));
    this.provider.awareness.setLocalStateField('canvasSelection', this.selected);
    this.provider.awareness.setLocalStateField('bounds', []);
    this.emit();
  }
  setTool(tool: Tool) {
    this.tool = tool;
    this.emit();
  }
  patch(patch: Partial<CanvasNode>) {
    this.doc.transact(() => this.selected.forEach((id) => patchNode(this.doc, id, patch)), LOCAL);
  }
  move(dx: number, dy: number) {
    moveNodes(this.doc, this.selected, dx, dy);
  }
  remove() {
    deleteNodes(this.doc, this.selected);
    this.select([]);
  }
  duplicate() {
    this.undo.stopCapturing();
    this.select(duplicateNodes(this.doc, this.selected));
  }
  arrange(direction: 'front' | 'back') {
    this.undo.stopCapturing();
    this.doc.transact(() => this.selected.forEach((id) => reorder(this.doc, id, direction)), LOCAL);
  }
  create(type: NodeKind, x: number, y: number, width?: number, height?: number) {
    const parent = this.nodes
      .filter(
        (n) =>
          n.type === 'frame' &&
          n.visible &&
          !n.locked &&
          x >= n.x &&
          y >= n.y &&
          x < n.x + n.width &&
          y < n.y + n.height,
      )
      .at(-1);
    this.undo.stopCapturing();
    const id = addNode(this.doc, {
      type,
      x,
      y,
      width: width ?? (type === 'text' ? 260 : 160),
      height: height ?? (type === 'text' ? 60 : 120),
      parentId: type === 'frame' ? null : (parent?.id ?? null),
      fill: type === 'text' ? '#254f3f' : type === 'frame' ? '#ffffff' : '#b9e8d3',
      strokeWidth: type === 'line' ? 3 : 0,
      text: 'New idea',
      name: type === 'text' ? 'New idea' : type[0].toUpperCase() + type.slice(1),
    });
    this.select([id]);
    this.setTool('select');
    return id;
  }
  group() {
    if (this.selected.length < 2) return;
    const nodes = this.selected.map((id) => readNode(this.doc, id)!);
    if (nodes.some((n) => n.parentId !== nodes[0].parentId)) {
      this.notify('Select layers in the same parent to group.');
      return;
    }
    const x = Math.min(...nodes.map((n) => n.x));
    const y = Math.min(...nodes.map((n) => n.y));
    this.undo.stopCapturing();
    this.doc.transact(() => {
      const id = addNode(this.doc, {
        type: 'group',
        name: 'Group',
        x,
        y,
        width: Math.max(...nodes.map((n) => n.x + n.width)) - x,
        height: Math.max(...nodes.map((n) => n.y + n.height)) - y,
        parentId: nodes[0].parentId,
        fill: 'transparent',
      });
      nodes.forEach((n) => reparent(this.doc, n.id, id));
      this.select([id]);
    }, LOCAL);
  }
  ungroup() {
    const node = readNode(this.doc, this.selected[0]);
    if (!node || node.type !== 'group') return;
    const children = this.nodes.filter((n) => n.parentId === node.id);
    this.doc.transact(() => {
      children.forEach((n) => reparent(this.doc, n.id, node.parentId));
      nodesOf(this.doc).delete(node.id);
    }, LOCAL);
    this.select(children.map((n) => n.id));
  }
  canParent(id: string) {
    return !descendants(this.doc, this.selected).includes(id);
  }
  notify(message: string) {
    this.toast = message;
    this.emit();
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.toast = '';
      this.emit();
    }, 3200);
  }
  destroy() {
    clearTimeout(this.toastTimer);
    this.provider.awareness.off('change', this.onPresence);
    this.doc.off('update', this.onUpdate);
    this.undo.destroy();
    this.codeUndo.destroy();
    this.provider.destroy();
    this.doc.destroy();
    this.listeners.clear();
  }
}
