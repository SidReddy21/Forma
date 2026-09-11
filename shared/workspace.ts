import * as Y from 'yjs';
import { compare, readNodes, connectionGeometry, type CanvasNode } from './canvas';

export const codeOf = (doc: Y.Doc) => doc.getText('code');
// Origins are process-local capabilities, never accepted from a client's payload.
export const AGENT_ORIGIN = Symbol('forma-agent');
export const REPLICA_ORIGIN = Symbol('agent-replica');
export const INITIALIZE_ORIGIN = Symbol('workspace-initialize');
export type AgentDirection = 'canvas-to-code' | 'code-to-canvas' | 'prompt';
export interface AgentPermissions {
  canvas: boolean;
  code: boolean;
}
export interface AgentSettings extends AgentPermissions {
  auto: boolean;
}
export interface AgentEvent {
  id: string;
  at: number;
  direction: AgentDirection;
  status: 'queued' | 'running' | 'applied' | 'discarded' | 'error' | 'cancelled';
  message: string;
}
export interface AgentState {
  engine: 'workers-ai' | 'structural';
  settings: AgentSettings;
  busy: boolean;
  events: AgentEvent[];
}
export type AgentCommand =
  | { action: 'settings'; settings: AgentSettings }
  | { action: 'run'; direction: AgentDirection; prompt?: string; selection?: string[] }
  | { action: 'cancel' };
export const initialAgentState = (): AgentState => ({
  engine: 'structural',
  settings: { auto: false, canvas: true, code: true },
  busy: false,
  events: [],
});

export function serializeCanvas(doc: Y.Doc, selected?: string[]) {
  const records = readNodes(doc);
  const byId = new Map(records.map((n) => [n.id, n]));
  const all = records
    .map((n) => connectionGeometry(n, (id) => byId.get(id)))
    .sort((a, b) => compare(a.id, b.id));
  const chosen = selected?.length ? new Set(selected) : null;
  // Include descendants in scoped prompts; edges retain endpoint IDs.
  if (chosen) {
    let changed = true;
    while (changed) {
      changed = false;
      for (const node of all)
        if (node.parentId && chosen.has(node.parentId) && !chosen.has(node.id)) {
          chosen.add(node.id);
          changed = true;
        }
    }
  }
  const nodes = all.filter((n) => !chosen || chosen.has(n.id));
  return {
    version: 1,
    coordinateSystem: 'world',
    nodes: nodes.map((n) => ({
      ...n,
      bounds: { x: n.x, y: n.y, width: n.width, height: n.height },
    })),
    connections: nodes
      .filter((n) => n.type === 'line' && (n.sourceId || n.targetId))
      .map((n) => ({ id: n.id, sourceId: n.sourceId ?? null, targetId: n.targetId ?? null })),
  };
}

export interface NodeChange {
  id: string;
  values: Partial<CanvasNode> & { type?: CanvasNode['type'] };
}
export interface Translation {
  code?: string;
  nodes?: NodeChange[];
  remove?: string[];
  message: string;
}

export function replaceCode(text: Y.Text, next: string) {
  const current = text.toString();
  if (current === next) return;
  let prefix = 0;
  while (prefix < current.length && prefix < next.length && current[prefix] === next[prefix])
    prefix++;
  let suffix = 0;
  while (
    suffix < current.length - prefix &&
    suffix < next.length - prefix &&
    current[current.length - 1 - suffix] === next[next.length - 1 - suffix]
  )
    suffix++;
  // Keep the unchanged prefix/suffix so remote Monaco selections retain anchors.
  text.delete(prefix, current.length - prefix - suffix);
  text.insert(prefix, next.slice(prefix, next.length - suffix));
}
