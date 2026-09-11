import * as Y from 'yjs';
import { generateKeyBetween } from 'fractional-indexing';

export type NodeKind = 'frame' | 'group' | 'rectangle' | 'ellipse' | 'text' | 'line';
export interface CanvasNode {
  id: string;
  type: NodeKind;
  name: string;
  parentId: string | null;
  order: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  opacity: number;
  radius: number;
  text: string;
  fontSize: number;
  bold: boolean;
  visible: boolean;
  locked: boolean;
  sourceId?: string | null;
  targetId?: string | null;
  managedBy?: 'agent';
  sourceKey?: string;
}

export const LOCAL = 'canvas-local';
export const nodesOf = (doc: Y.Doc) => doc.getMap<Y.Map<unknown>>('nodes');
export const metadataOf = (doc: Y.Doc) => doc.getMap<string>('metadata');
export const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
export const sortNodes = (a: CanvasNode, b: CanvasNode) =>
  compare(a.order, b.order) || compare(a.id, b.id);
export function readNode(doc: Y.Doc, id: string): CanvasNode | undefined {
  return nodesOf(doc).get(id)?.toJSON() as CanvasNode | undefined;
}
export function readNodes(doc: Y.Doc): CanvasNode[] {
  return [...nodesOf(doc).values()].map((n) => n.toJSON() as CanvasNode);
}
export function connectionGeometry(
  node: CanvasNode,
  lookup: (id: string) => CanvasNode | undefined,
): CanvasNode {
  if (node.type !== 'line' || (!node.sourceId && !node.targetId)) return node;
  const anchor = (item: CanvasNode, end: boolean) => {
    const cx = item.type === 'ellipse' ? item.width / 2 : 0;
    const cy = item.type === 'ellipse' ? item.height / 2 : 0;
    const x = (end ? 0 : item.width) - cx;
    const y = item.height / 2 - cy;
    const angle = (item.rotation * Math.PI) / 180;
    return {
      x: item.x + cx + x * Math.cos(angle) - y * Math.sin(angle),
      y: item.y + cy + x * Math.sin(angle) + y * Math.cos(angle),
    };
  };
  const source = node.sourceId ? lookup(node.sourceId) : undefined;
  const target = node.targetId ? lookup(node.targetId) : undefined;
  const forward = !source || !target || target.x + target.width / 2 >= source.x + source.width / 2;
  const start = source ? anchor(source, !forward) : { x: node.x, y: node.y };
  const angle = (node.rotation * Math.PI) / 180;
  const end = target
    ? anchor(target, forward)
    : {
        x: node.x + node.width * Math.cos(angle) - node.height * Math.sin(angle),
        y: node.y + node.width * Math.sin(angle) + node.height * Math.cos(angle),
      };
  return {
    ...node,
    x: start.x,
    y: start.y,
    width: end.x - start.x,
    height: end.y - start.y,
    rotation: 0,
  };
}
export function siblings(doc: Y.Doc, parentId: string | null): CanvasNode[] {
  return readNodes(doc)
    .filter((n) => n.parentId === parentId)
    .sort(sortNodes);
}
export function addNode(doc: Y.Doc, props: Partial<CanvasNode> & { type: NodeKind }): string {
  const id = props.id ?? crypto.randomUUID();
  const parentId = props.parentId ?? null;
  const last = siblings(doc, parentId).at(-1)?.order ?? null;
  const node: CanvasNode = {
    name: props.type[0].toUpperCase() + props.type.slice(1),
    x: 0,
    y: 0,
    width: 160,
    height: 120,
    rotation: 0,
    fill: '#b9e8d3',
    stroke: '#202723',
    strokeWidth: 0,
    opacity: 1,
    radius: 0,
    text: 'Your words here',
    fontSize: 36,
    bold: false,
    visible: true,
    locked: false,
    ...props,
    id,
    parentId,
    order: props.order ?? generateKeyBetween(last, null),
  };
  doc.transact(() => {
    const record = new Y.Map<unknown>();
    for (const [key, value] of Object.entries(node)) record.set(key, value);
    nodesOf(doc).set(id, record);
  }, LOCAL);
  return id;
}
export function patchNode(doc: Y.Doc, id: string, patch: Partial<Omit<CanvasNode, 'id' | 'type'>>) {
  doc.transact(() => {
    const node = nodesOf(doc).get(id);
    if (node) for (const [key, value] of Object.entries(patch)) node.set(key, value);
  }, LOCAL);
}

// Concurrent moves can form cycles. Break each cycle at its smallest ID in the
// derived tree, without corrective transactions that fight other peers.
export function resolvedParents(nodes: CanvasNode[]): Map<string, string | null> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const parents = new Map<string, string | null>(
    nodes.map((n) => {
      const parent = n.parentId ? byId.get(n.parentId) : undefined;
      return [n.id, parent && ['frame', 'group'].includes(parent.type) ? parent.id : null];
    }),
  );
  const done = new Set<string>();
  for (const node of nodes) {
    const path: string[] = [];
    const indices = new Map<string, number>();
    let id: string | null = node.id;
    while (id && !done.has(id)) {
      const index = indices.get(id);
      if (index !== undefined) {
        parents.set(path.slice(index).sort(compare)[0], null);
        break;
      }
      indices.set(id, path.length);
      path.push(id);
      id = parents.get(id) ?? null;
    }
    path.forEach((value) => done.add(value));
  }
  return parents;
}
export function treeNodes(nodes: CanvasNode[]): Array<CanvasNode & { depth: number }> {
  const parents = resolvedParents(nodes);
  const children = new Map<string | null, CanvasNode[]>();
  for (const node of nodes) {
    const parent = parents.get(node.id) ?? null;
    const list = children.get(parent) ?? [];
    list.push(node);
    children.set(parent, list);
  }
  const result: Array<CanvasNode & { depth: number }> = [];
  const visit = (parent: string | null, depth: number) => {
    for (const node of (children.get(parent) ?? []).sort(sortNodes)) {
      result.push({ ...node, depth });
      visit(node.id, depth + 1);
    }
  };
  visit(null, 0);
  return result;
}
export function descendants(doc: Y.Doc, ids: string[]): string[] {
  const parents = resolvedParents(readNodes(doc));
  const result = new Set(ids);
  for (const node of treeNodes(readNodes(doc))) {
    if (result.has(parents.get(node.id) ?? '')) result.add(node.id);
  }
  return [...result];
}
export function reparent(doc: Y.Doc, id: string, parentId: string | null): boolean {
  if (!readNode(doc, id)) return false;
  if (
    parentId &&
    (!['frame', 'group'].includes(readNode(doc, parentId)?.type ?? '') ||
      descendants(doc, [id]).includes(parentId))
  )
    return false;
  const last =
    siblings(doc, parentId)
      .filter((n) => n.id !== id)
      .at(-1)?.order ?? null;
  patchNode(doc, id, { parentId, order: generateKeyBetween(last, null) });
  return true;
}
export function reorder(doc: Y.Doc, id: string, direction: 'front' | 'back') {
  const node = readNode(doc, id);
  if (!node) return;
  const others = siblings(doc, node.parentId).filter((n) => n.id !== id);
  patchNode(doc, id, {
    order:
      direction === 'front'
        ? generateKeyBetween(others.at(-1)?.order ?? null, null)
        : generateKeyBetween(null, others[0]?.order ?? null),
  });
}
export function deleteNodes(doc: Y.Doc, ids: string[]) {
  doc.transact(() => descendants(doc, ids).forEach((id) => nodesOf(doc).delete(id)), LOCAL);
}
export function moveNodes(doc: Y.Doc, ids: string[], dx: number, dy: number) {
  doc.transact(
    () =>
      descendants(doc, ids).forEach((id) => {
        const node = readNode(doc, id);
        if (node) patchNode(doc, id, { x: node.x + dx, y: node.y + dy });
      }),
    LOCAL,
  );
}
export function duplicateNodes(doc: Y.Doc, ids: string[]): string[] {
  const all = descendants(doc, ids);
  const mapping = new Map(all.map((id) => [id, crypto.randomUUID()]));
  doc.transact(() => {
    for (const id of all) {
      const node = readNode(doc, id);
      if (node)
        addNode(doc, {
          ...node,
          id: mapping.get(id),
          name: node.name + ' copy',
          parentId: mapping.get(node.parentId ?? '') ?? node.parentId,
          order: undefined,
          x: node.x + 24,
          y: node.y + 24,
        });
    }
  }, LOCAL);
  return ids.map((id) => mapping.get(id)!);
}
