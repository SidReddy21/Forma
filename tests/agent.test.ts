import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Y from 'yjs';
import { WorkspaceAgent } from '../backend/src/WorkspaceAgent';
import { createGenerator, type Generate } from '../backend/src/AgentModel';
import { canvasToCode, codeToCanvas } from '../shared/translation';
import { addNode, nodesOf, patchNode, readNode, readNodes } from '../shared/canvas';
import { seedDocument } from '../shared/seed';
import {
  AGENT_ORIGIN,
  codeOf,
  replaceCode,
  type AgentSettings,
  type Translation,
} from '../shared/workspace';

const delay = (ms = 60) => new Promise((resolve) => setTimeout(resolve, ms));
function harness(generate: Generate = createGenerator(), settings?: AgentSettings) {
  const source = new Y.Doc();
  seedDocument(source);
  const tasks: Promise<void>[] = [];
  let commits = 0;
  const agent = new WorkspaceAgent(
    source,
    {
      engine: 'structural',
      generate,
      debounceMs: 15,
      commit: async (work) => {
        work();
        commits++;
      },
      publish: () => {},
      retain: (promise) => tasks.push(promise),
      saveSettings: async () => {},
    },
    settings,
  );
  return {
    source,
    agent,
    get commits() {
      return commits;
    },
    async flush() {
      await delay();
      await Promise.all(tasks);
    },
    destroy() {
      agent.destroy();
      source.destroy();
    },
  };
}
test('canvas round-trip retains IDs, geometry, parent links, and explicit connections', () => {
  const doc = new Y.Doc();
  seedDocument(doc);
  addNode(doc, {
    id: 'connection',
    type: 'line',
    sourceId: 'field-notes',
    targetId: 'shape-study',
  });
  const translation = codeToCanvas(canvasToCode(doc).code!, readNodes(doc));
  assert.equal(translation.nodes!.length, nodesOf(doc).size);
  const actual = translation.nodes!.find((n) => n.id === 'field-notes')!;
  assert.equal(actual.values.width, 560);
  assert.equal(actual.values.parentId, null);
  assert.equal(
    translation.nodes!.find((n) => n.id === 'connection')!.values.sourceId,
    'field-notes',
  );
  assert.deepEqual(translation.remove, []);
  doc.destroy();
});
test('AST parses JSX literals without evaluating user code', () => {
  const code =
    'export default function Card(){ return <div data-node-id="agent:card" style={{left: 110, top: 90, width: 280, height: 150, backgroundColor: "#abcabc"}}>Hello</div>; }';
  const result = codeToCanvas(code, []);
  assert.equal(result.nodes!.find((n) => n.id === 'agent:card')!.values.x, 110);
  assert.equal(result.nodes!.find((n) => n.id === 'agent:card:label')!.values.text, 'Hello');
  assert.throws(() => codeToCanvas('function broken(', []));
});

test('canvas translation preserves unrelated code and refreshes only its linked root', () => {
  const doc = new Y.Doc();
  seedDocument(doc);
  const original = 'export function api(){ return 42; }';
  replaceCode(codeOf(doc), original);
  const first = canvasToCode(doc).code!;
  assert.ok(first.startsWith(original));
  replaceCode(codeOf(doc), first);
  const second = canvasToCode(doc).code!;
  assert.equal(second, first);
  const translated = codeToCanvas(second, readNodes(doc));
  assert.ok(translated.nodes!.some((n) => n.id === 'agent:symbol:api'));
  doc.destroy();
});
test('function structure creates stable nodes and call connections without removing artwork', () => {
  const doc = new Y.Doc();
  seedDocument(doc);
  const code = 'function storage(){ return 1; } export function api(){ return storage(); }';
  const first = codeToCanvas(code, readNodes(doc));
  const second = codeToCanvas('\n\n' + code, readNodes(doc));
  assert.deepEqual(
    first.nodes!.map((n) => n.id),
    second.nodes!.map((n) => n.id),
  );
  assert.equal(
    first.nodes!.find((n) => n.id === 'agent:call:api:storage')!.values.targetId,
    'agent:symbol:storage',
  );
  assert.deepEqual(first.remove, []);
  doc.destroy();
});
test('the agent has its own Yjs identity and can write both shared surfaces', async () => {
  const h = harness(async () => ({
    code: 'export const answer = 42;',
    nodes: [{ id: 'agent:new', values: { type: 'rectangle', name: 'Answer', x: 1200, y: 80 } }],
    message: 'Updated both.',
  }));
  assert.notEqual(h.source.clientID, h.agent.doc.clientID);
  const origins: unknown[] = [];
  h.source.on('update', (_update, origin) => origins.push(origin));
  await h.agent.command({ action: 'run', direction: 'prompt', prompt: 'Add a result' });
  await h.flush();
  assert.equal(codeOf(h.source).toString(), 'export const answer = 42;');
  assert.equal(readNode(h.source, 'agent:new')!.name, 'Answer');
  assert.ok(origins.includes(AGENT_ORIGIN));
  assert.equal(h.agent.state.events[0].status, 'applied');
  h.destroy();
});
test('strict trailing debounce coalesces edits and ignores agent echoes', async () => {
  let calls = 0;
  const h = harness(
    async (request) => {
      calls++;
      return canvasToCode(request.doc);
    },
    { auto: true, canvas: true, code: true },
  );
  for (let i = 0; i < 10; i++) {
    patchNode(h.source, 'field-notes', { x: i });
    await delay(2);
  }
  await h.flush();
  assert.equal(calls, 1);
  assert.equal(h.commits, 1);
  const echo = new Y.Doc();
  Y.applyUpdate(echo, Y.encodeStateAsUpdate(h.source));
  Y.applyUpdate(h.source, Y.encodeStateAsUpdate(echo), 'socket-reconnect');
  await h.flush();
  assert.equal(calls, 1);
  echo.destroy();
  h.destroy();
});
test('code edits trigger AST translation once without a canvas-to-code loop', async () => {
  let calls = 0;
  const generator = createGenerator();
  const h = harness(
    async (request) => {
      calls++;
      return generator(request);
    },
    { auto: true, canvas: true, code: true },
  );
  h.source.transact(
    () => replaceCode(codeOf(h.source), 'export function greet(){ return "hello"; }'),
    'human',
  );
  await h.flush();
  await delay();
  assert.equal(calls, 1);
  assert.ok(readNode(h.source, 'agent:symbol:greet'));
  assert.ok(readNode(h.source, 'field-notes'));
  h.destroy();
});
test('a human edit to either surface invalidates an in-flight result', async () => {
  let resolve!: (value: Translation) => void;
  const h = harness(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  await h.agent.command({ action: 'run', direction: 'canvas-to-code' });
  await delay(25);
  codeOf(h.source).insert(0, '// human edit');
  resolve({ code: 'export const stale = true;', message: 'stale' });
  await h.flush();
  assert.equal(codeOf(h.source).toString(), '// human edit');
  assert.equal(h.agent.state.events[0].status, 'discarded');
  h.destroy();
});

test('a generated call graph round-trips without duplicate symbol or stage IDs', async () => {
  const h = harness();
  replaceCode(
    codeOf(h.source),
    'export function storage(){ return 1; } export function api(){ return storage(); }',
  );
  for (const direction of ['code-to-canvas', 'canvas-to-code', 'code-to-canvas'] as const) {
    await h.agent.command({ action: 'run', direction });
    await h.flush();
    assert.equal(h.agent.state.events[0].status, 'applied', h.agent.state.events[0].message);
  }
  assert.ok(readNode(h.source, 'agent:call:api:storage'));
  assert.ok(readNode(h.source, 'field-notes'));
  h.destroy();
});
test('revoking permission cancels in-flight work and blocks later writes', async () => {
  let resolve!: (value: Translation) => void;
  const h = harness(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  await h.agent.command({ action: 'run', direction: 'canvas-to-code' });
  await delay(25);
  await h.agent.command({
    action: 'settings',
    settings: { auto: false, canvas: true, code: false },
  });
  resolve({ code: 'export const blocked = true;', message: 'blocked' });
  await h.flush();
  assert.equal(codeOf(h.source).length, 0);
  await h.agent.command({ action: 'run', direction: 'canvas-to-code' });
  await h.flush();
  assert.equal(h.agent.state.events[0].status, 'error');
  h.destroy();
});
test('invalid AI output fails atomically and cannot delete original artwork', async () => {
  const h = harness(async () => ({
    code: 'export const valid = 1;',
    remove: ['field-notes'],
    message: 'invalid',
  }));
  await h.agent.command({ action: 'run', direction: 'prompt', prompt: 'Edit' });
  await h.flush();
  assert.equal(codeOf(h.source).length, 0);
  assert.ok(readNode(h.source, 'field-notes'));
  assert.equal(h.agent.state.events[0].status, 'error');
  h.destroy();
});
test('Workers AI receives structured canvas data and its code is parsed before applying', async () => {
  const doc = new Y.Doc();
  seedDocument(doc);
  let input: Record<string, unknown> = {};
  const generate = createGenerator({
    async run(_model, request) {
      input = request;
      return {
        response: JSON.stringify({ code: 'export const generated = 1;', message: 'Generated' }),
      };
    },
  });
  const result = await generate({ doc, direction: 'canvas-to-code' });
  assert.ok(JSON.stringify(input.messages).includes('coordinateSystem'));
  assert.equal(result.code, 'export const generated = 1;');
  const bad = createGenerator({
    async run() {
      return { response: '{"code":"function {","message":"bad"}' };
    },
  });
  await assert.rejects(() => bad({ doc, direction: 'canvas-to-code' }));
  doc.destroy();
});
