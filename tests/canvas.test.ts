import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Y from 'yjs';
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from 'y-protocols/awareness';
import {
  LOCAL,
  addNode,
  deleteNodes,
  duplicateNodes,
  nodesOf,
  patchNode,
  readNode,
  readNodes,
  reparent,
  reorder,
  resolvedParents,
  siblings,
  treeNodes,
} from '../shared/canvas';
import { seedDocument } from '../shared/seed';
import { exportSVG } from '../frontend/src/canvas/export';

function fork(doc: Y.Doc) {
  const next = new Y.Doc();
  Y.applyUpdate(next, Y.encodeStateAsUpdate(doc));
  return next;
}
function merge(a: Y.Doc, b: Y.Doc) {
  const update = Y.encodeStateAsUpdate(a);
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
  Y.applyUpdate(b, update);
}

test('flat dictionary preserves independent concurrent field edits', () => {
  const a = new Y.Doc();
  const id = addNode(a, { type: 'rectangle' });
  const b = fork(a);
  patchNode(a, id, { x: 120 });
  patchNode(b, id, { fill: '#ff0000' });
  merge(a, b);
  assert.deepEqual(readNodes(a), readNodes(b));
  assert.equal(readNode(a, id)?.x, 120);
  assert.equal(readNode(a, id)?.fill, '#ff0000');
  assert.ok(nodesOf(a).get(id) instanceof Y.Map);
  assert.equal(nodesOf(a).size, 1);
  a.destroy();
  b.destroy();
});
test('concurrent reparenting keeps one child ID and converges', () => {
  const a = new Y.Doc();
  const p = addNode(a, { type: 'group' });
  const q = addNode(a, { type: 'group' });
  const id = addNode(a, { type: 'ellipse' });
  const b = fork(a);
  reparent(a, id, p);
  reparent(b, id, q);
  merge(a, b);
  assert.deepEqual(readNodes(a), readNodes(b));
  assert.equal(treeNodes(readNodes(a)).filter((n) => n.id === id).length, 1);
  assert.equal(nodesOf(a).size, 3);
  assert.ok([p, q].includes(readNode(a, id)!.parentId!));
  a.destroy();
  b.destroy();
});
test('concurrent cycles have a deterministic derived root without data repair', () => {
  const a = new Y.Doc();
  addNode(a, { id: 'a', type: 'group' });
  addNode(a, { id: 'b', type: 'group' });
  const b = fork(a);
  assert.ok(reparent(a, 'a', 'b'));
  assert.ok(reparent(b, 'b', 'a'));
  merge(a, b);
  const state = Y.encodeStateAsUpdate(a);
  assert.deepEqual(resolvedParents(readNodes(a)), resolvedParents(readNodes(b)));
  assert.equal(resolvedParents(readNodes(a)).get('a'), null);
  assert.equal(treeNodes(readNodes(a)).length, 2);
  assert.deepEqual(state, Y.encodeStateAsUpdate(a));
  assert.equal(reparent(a, 'a', 'b'), false);
  a.destroy();
  b.destroy();
});
test('orphaned children remain reachable after a concurrent parent deletion', () => {
  const a = new Y.Doc();
  const p = addNode(a, { type: 'group' });
  const b = fork(a);
  deleteNodes(a, [p]);
  const child = addNode(b, { type: 'rectangle', parentId: p });
  merge(a, b);
  assert.equal(resolvedParents(readNodes(a)).get(child), null);
  assert.equal(treeNodes(readNodes(a)).length, 1);
  a.destroy();
  b.destroy();
});
test('fractional ordering updates only the moved record and resolves ties by ID', () => {
  const a = new Y.Doc();
  const one = addNode(a, { type: 'rectangle', id: 'a' });
  const two = addNode(a, { type: 'rectangle', id: 'b' });
  const three = addNode(a, { type: 'rectangle', id: 'c' });
  const stable = readNode(a, two);
  const b = fork(a);
  reorder(a, one, 'front');
  reorder(b, three, 'back');
  merge(a, b);
  assert.deepEqual(
    siblings(a, null).map((n) => n.id),
    [three, two, one],
  );
  assert.deepEqual(readNode(a, two), stable);
  const c = fork(a);
  const d = fork(a);
  addNode(c, { type: 'ellipse', id: 'tie-a' });
  addNode(d, { type: 'ellipse', id: 'tie-b' });
  merge(c, d);
  assert.equal(readNode(c, 'tie-a')!.order, readNode(c, 'tie-b')!.order);
  assert.deepEqual(
    siblings(c, null).map((n) => n.id),
    siblings(d, null).map((n) => n.id),
  );
  reorder(c, 'tie-a', 'front');
  assert.equal(siblings(c, null).at(-1)!.id, 'tie-a');
  a.destroy();
  b.destroy();
  c.destroy();
  d.destroy();
});
test('local undo does not undo a remote edit', () => {
  const a = new Y.Doc();
  const id = addNode(a, { type: 'rectangle' });
  const b = fork(a);
  const undo = new Y.UndoManager(nodesOf(a), { trackedOrigins: new Set([LOCAL]) });
  patchNode(a, id, { x: 20 });
  patchNode(b, id, { fill: '#123456' });
  merge(a, b);
  undo.undo();
  assert.equal(readNode(a, id)?.x, 0);
  assert.equal(readNode(a, id)?.fill, '#123456');
  undo.destroy();
  a.destroy();
  b.destroy();
});
test('duplicating a subtree creates fresh IDs and remaps parents', () => {
  const doc = new Y.Doc();
  const p = addNode(doc, { type: 'group' });
  addNode(doc, { type: 'text', parentId: p });
  const [copy] = duplicateNodes(doc, [p]);
  assert.notEqual(copy, p);
  assert.equal(nodesOf(doc).size, 4);
  assert.equal(siblings(doc, copy).length, 1);
  deleteNodes(doc, [copy]);
  assert.equal(nodesOf(doc).size, 2);
  doc.destroy();
});
test('awareness cursor, selection, and bounds never change document state', () => {
  const a = new Y.Doc();
  seedDocument(a);
  const b = fork(a);
  const first = new Awareness(a);
  const second = new Awareness(b);
  const before = Y.encodeStateAsUpdate(a);
  let writes = 0;
  a.on('update', () => writes++);
  for (let i = 0; i < 100; i++) {
    first.setLocalState({
      user: { name: 'Ada' },
      cursor: { x: i, y: i },
      bounds: [{ x: i, y: i, width: 40, height: 50 }],
      selection: ['field-notes'],
    });
    applyAwarenessUpdate(second, encodeAwarenessUpdate(first, [a.clientID]), 'test');
  }
  assert.equal(writes, 0);
  assert.deepEqual(Y.encodeStateAsUpdate(a), before);
  assert.equal(second.getStates().get(a.clientID)?.cursor.x, 99);
  first.setLocalState(null);
  applyAwarenessUpdate(second, encodeAwarenessUpdate(first, [a.clientID]), 'test');
  assert.equal(second.getStates().has(a.clientID), false);
  first.destroy();
  second.destroy();
  a.destroy();
  b.destroy();
});
test('SVG export escapes text, respects hidden ancestry, and scopes selection', () => {
  const doc = new Y.Doc();
  const p = addNode(doc, { type: 'frame', visible: false });
  addNode(doc, { type: 'text', parentId: p, text: 'hidden' });
  const id = addNode(doc, { type: 'text', text: '<script>&"', rotation: 30 });
  const svg = exportSVG(doc);
  assert.ok(!svg.includes('hidden'));
  assert.ok(svg.includes('&lt;script&gt;&amp;&quot;'));
  assert.ok(svg.includes('rotate(30'));
  assert.ok(!exportSVG(doc, [id]).includes('<rect'));
  doc.destroy();
});
