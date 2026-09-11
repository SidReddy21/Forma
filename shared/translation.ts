import { parse } from '@babel/parser';
import * as Y from 'yjs';
import { treeNodes, type CanvasNode, type NodeKind } from './canvas';
import { codeOf, serializeCanvas, type NodeChange, type Translation } from './workspace';

// Babel produces these discriminated objects. Reading only static literals keeps
// workspace code inert: translation never evaluates user code or imports it.
interface AstNode {
  type: string;
  [key: string]: unknown;
}
const astNode = (value: unknown): value is AstNode =>
  !!value && typeof value === 'object' && typeof (value as AstNode).type === 'string';
function walk(
  node: unknown,
  visit: (node: AstNode, parent: AstNode | null) => void,
  parent: AstNode | null = null,
) {
  if (!astNode(node)) return;
  visit(node, parent);
  for (const [key, value] of Object.entries(node)) {
    if (['loc', 'comments', 'tokens', 'errors', 'extra'].includes(key)) continue;
    if (Array.isArray(value)) value.forEach((child) => walk(child, visit, node));
    else if (astNode(value)) walk(value, visit, node);
  }
}
export function parseCode(source: string) {
  if (source.length > 150000) throw new Error('Code exceeds the 150 KB translation limit.');
  return parse(source, {
    sourceType: 'unambiguous',
    plugins: ['typescript', 'jsx'],
    errorRecovery: false,
  });
}
function literal(value: unknown): unknown {
  if (!astNode(value)) return undefined;
  if (['StringLiteral', 'NumericLiteral', 'BooleanLiteral'].includes(value.type))
    return value.value;
  if (value.type === 'NullLiteral') return null;
  if (value.type === 'UnaryExpression' && value.operator === '-') {
    const number = literal(value.argument);
    return typeof number === 'number' ? -number : undefined;
  }
  if (value.type === 'JSXExpressionContainer') return literal(value.expression);
  if (value.type === 'ObjectExpression') {
    const result: Record<string, unknown> = {};
    for (const property of value.properties as AstNode[])
      if (property.type === 'ObjectProperty' && astNode(property.key)) {
        const key = property.key.name ?? property.key.value;
        if (typeof key === 'string' && !['__proto__', 'constructor', 'prototype'].includes(key))
          result[key] = literal(property.value);
      }
    return result;
  }
  return undefined;
}
function attributes(element: AstNode): Record<string, unknown> {
  const opening = element.openingElement as AstNode;
  const result: Record<string, unknown> = {};
  for (const attr of opening.attributes as AstNode[])
    if (attr.type === 'JSXAttribute' && astNode(attr.name)) {
      const name = String(attr.name.name);
      result[name] = attr.value === null ? true : literal(attr.value);
    }
  return result;
}
const finite = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.max(-100000, Math.min(100000, value))
    : fallback;
const textValue = (value: unknown, fallback: string) =>
  typeof value === 'string' ? value.slice(0, 10000) : fallback;
const quote = (value: unknown) => '{' + JSON.stringify(value) + '}';
const attr = (name: string, value: unknown) =>
  value === undefined ? '' : ` ${name}=${quote(value)}`;

export function canvasToCode(doc: Y.Doc, selection?: string[], preserveCode = true): Translation {
  const snapshot = serializeCanvas(doc, selection);
  const nodes = treeNodes(snapshot.nodes);
  if (nodes.length > 500) throw new Error('Select fewer than 500 layers for translation.');
  const elements = nodes.map((n) => {
    const pivotX = n.x + (n.type === 'ellipse' ? n.width / 2 : 0);
    const pivotY = n.y + (n.type === 'ellipse' ? n.height / 2 : 0);
    const common =
      attr('data-node-id', n.id) +
      attr('data-parent-id', n.parentId ?? '') +
      attr('data-kind', n.type) +
      attr('data-name', n.name) +
      attr('data-visible', n.visible) +
      attr('fill', n.fill) +
      attr('stroke', n.stroke) +
      attr('strokeWidth', n.strokeWidth) +
      attr('opacity', n.opacity) +
      attr('data-rotation', n.rotation) +
      attr('transform', n.rotation ? `rotate(${n.rotation} ${pivotX} ${pivotY})` : undefined) +
      attr('display', n.visible ? undefined : 'none');
    if (n.type === 'group')
      return `      <g${common}${attr('data-x', n.x)}${attr('data-y', n.y)}${attr('data-width', n.width)}${attr('data-height', n.height)} />`;
    if (n.type === 'ellipse')
      return `      <ellipse${common}${attr('cx', n.x + n.width / 2)}${attr('cy', n.y + n.height / 2)}${attr('rx', n.width / 2)}${attr('ry', n.height / 2)} />`;
    if (n.type === 'line')
      return `      <line${common}${attr('x1', n.x)}${attr('y1', n.y)}${attr('x2', n.x + n.width)}${attr('y2', n.y + n.height)}${attr('data-source-id', n.sourceId)}${attr('data-target-id', n.targetId)} />`;
    if (n.type === 'text')
      return `      <text${common}${attr('x', n.x)}${attr('y', n.y)}${attr('data-width', n.width)}${attr('data-height', n.height)}${attr('fontSize', n.fontSize)}${attr('fontWeight', n.bold ? 700 : 400)}>${quote(n.text)}</text>`;
    return `      <rect${common}${attr('x', n.x)}${attr('y', n.y)}${attr('width', n.width)}${attr('height', n.height)}${attr('rx', n.radius)} />`;
  });
  const width = Math.max(800, ...nodes.map((n) => n.x + n.width + 40));
  const height = Math.max(600, ...nodes.map((n) => n.y + n.height + 40));
  const svg = `<svg data-forma-root viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">\n${elements.join('\n')}\n    </svg>`;
  const source = preserveCode ? codeOf(doc).toString() : '';
  let code: string;
  if (!source.trim())
    code = `// Canvas.tsx\n// data-node-id links this structure to the shared canvas.\nexport default function CanvasDocument() {\n  return (\n    ${svg}\n  );\n}\n`;
  else {
    const ast = parseCode(source);
    const roots: AstNode[] = [];
    const names = new Set<string>();
    walk(ast, (node) => {
      if (node.type === 'Identifier') names.add(String(node.name));
      if (node.type === 'JSXElement' && attributes(node)['data-forma-root']) roots.push(node);
    });
    if (roots.length > 1)
      throw new Error('Keep one data-forma-root in the shared file before translating.');
    if (roots.length) {
      const root = roots[0];
      code = source.slice(0, root.start as number) + svg + source.slice(root.end as number);
    } else {
      let name = 'CanvasDocument';
      let suffix = 1;
      while (names.has(name)) name = 'CanvasDocument' + suffix++;
      code =
        source.trimEnd() + `\n\nexport function ${name}() {\n  return (\n    ${svg}\n  );\n}\n`;
    }
  }
  return { code, message: `Translated ${nodes.length} canvas layers into linked TSX.` };
}

export function codeToCanvas(source: string, existing: CanvasNode[]): Translation {
  const ast = parseCode(source);
  const byId = new Map(existing.map((n) => [n.id, n]));
  const changes: NodeChange[] = [];
  const used = new Set<string>();
  const elements: AstNode[] = [];
  const elementParent = new Map<AstNode, AstNode | null>();
  const jsxStack: AstNode[] = [];
  const collect = (value: unknown) => {
    if (!astNode(value)) return;
    if (value.type === 'JSXElement') {
      elements.push(value);
      elementParent.set(value, jsxStack.at(-1) ?? null);
      jsxStack.push(value);
    }
    for (const [key, child] of Object.entries(value)) {
      if (['loc', 'comments', 'tokens', 'extra'].includes(key)) continue;
      if (Array.isArray(child)) child.forEach(collect);
      else if (astNode(child)) collect(child);
    }
    if (value.type === 'JSXElement') jsxStack.pop();
  };
  collect(ast);
  const stageId = 'agent:code-structure';
  const baseX =
    byId.get(stageId)?.x ??
    Math.max(0, ...existing.filter((n) => n.managedBy !== 'agent').map((n) => n.x + n.width)) + 120;
  const identities = new Map<AstNode, string>();
  let generated = 0;
  const add = (id: string, values: NodeChange['values']) => {
    if (used.has(id)) throw new Error(`Duplicate structural node ID: ${id}`);
    used.add(id);
    changes.push({ id, values });
    if (changes.length > 500) throw new Error('Code produces more than 500 visual nodes.');
  };
  for (const element of elements) {
    const a = attributes(element);
    if (a['data-forma-root']) continue;
    const opening = element.openingElement as AstNode;
    const tag = astNode(opening.name) ? String(opening.name.name ?? 'component') : 'component';
    const id = textValue(a['data-node-id'], `agent:jsx:${generated++}:${tag}`);
    if (!id || id.length > 200) throw new Error('Invalid data-node-id.');
    identities.set(element, id);
    const old = byId.get(id);
    const style =
      a.style && typeof a.style === 'object' ? (a.style as Record<string, unknown>) : {};
    const children = element.children as AstNode[];
    const text = children
      .map((child) =>
        child.type === 'JSXText' ? String(child.value).trim() : textValue(literal(child), ''),
      )
      .filter(Boolean)
      .join(' ');
    const rawKind = a['data-kind'];
    const kinds: NodeKind[] = ['frame', 'group', 'rectangle', 'ellipse', 'text', 'line'];
    const type: NodeKind = kinds.includes(rawKind as NodeKind)
      ? (rawKind as NodeKind)
      : tag === 'ellipse' || tag === 'circle'
        ? 'ellipse'
        : tag === 'text'
          ? 'text'
          : tag === 'line'
            ? 'line'
            : tag === 'rect'
              ? 'rectangle'
              : tag === 'g'
                ? 'group'
                : 'frame';
    const parentElement = elementParent.get(element);
    const parentId =
      typeof a['data-parent-id'] === 'string'
        ? a['data-parent-id'] || null
        : parentElement && identities.has(parentElement)
          ? identities.get(parentElement)!
          : (old?.parentId ?? stageId);
    const width = Math.max(1, finite(a.width ?? a['data-width'] ?? style.width, old?.width ?? 220));
    const height = Math.max(
      1,
      finite(a.height ?? a['data-height'] ?? style.height, old?.height ?? 120),
    );
    const values: NodeChange['values'] = {
      type,
      parentId,
      name: textValue(a['data-name'] ?? a.id, old?.name ?? (text.slice(0, 40) || tag)),
      x: finite(a.x ?? a['data-x'] ?? style.left, old?.x ?? baseX + 32 + (generated % 3) * 250),
      y: finite(a.y ?? a['data-y'] ?? style.top, old?.y ?? 120 + Math.floor(generated / 3) * 170),
      width,
      height,
      fill: textValue(
        a.fill ?? style.backgroundColor ?? style.background ?? style.color,
        old?.fill ?? (type === 'text' ? '#254f3f' : '#e2f0e7'),
      ),
      stroke: textValue(a.stroke, old?.stroke ?? '#648572'),
      strokeWidth: finite(a.strokeWidth, old?.strokeWidth ?? (type === 'line' ? 2 : 0)),
      radius: Math.max(0, finite(a.rx ?? style.borderRadius, old?.radius ?? 4)),
      rotation: finite(a['data-rotation'], old?.rotation ?? 0),
      opacity: Math.max(0, Math.min(1, finite(a.opacity ?? style.opacity, old?.opacity ?? 1))),
      fontSize: finite(a.fontSize ?? style.fontSize, old?.fontSize ?? 20),
      bold: a.fontWeight === 700 || a.fontWeight === 'bold',
      visible: a['data-visible'] !== false,
      text: type === 'text' ? text : (old?.text ?? ''),
      ...(old ? {} : { managedBy: 'agent', sourceKey: id }),
    };
    if (type === 'ellipse') {
      const rx = Math.max(1, finite(a.rx ?? a.r, width / 2));
      const ry = Math.max(1, finite(a.ry ?? a.r, height / 2));
      values.x = finite(a.cx, (values.x ?? 0) + rx) - rx;
      values.y = finite(a.cy, (values.y ?? 0) + ry) - ry;
      values.width = rx * 2;
      values.height = ry * 2;
    }
    if (type === 'line') {
      values.x = finite(a.x1, old?.x ?? baseX);
      values.y = finite(a.y1, old?.y ?? 120);
      values.width = finite(a.x2, values.x + width) - values.x;
      values.height = finite(a.y2, values.y) - values.y;
      values.sourceId = typeof a['data-source-id'] === 'string' ? a['data-source-id'] : null;
      values.targetId = typeof a['data-target-id'] === 'string' ? a['data-target-id'] : null;
    }
    add(id, values);
    if (type === 'frame' && text)
      add(id + ':label', {
        type: 'text',
        parentId: id,
        name: text.slice(0, 40),
        text,
        x: values.x! + 16,
        y: values.y! + 20,
        width: Math.max(30, width - 32),
        height: 60,
        fill: '#254f3f',
        fontSize: values.fontSize,
        managedBy: 'agent',
        sourceKey: id + ':label',
      });
  }
  {
    const definitions: { id: string; name: string; kind: string; ast: AstNode }[] = [];
    walk(ast, (node) => {
      const named =
        (node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') &&
        astNode(node.id)
          ? String(node.id.name)
          : node.type === 'VariableDeclarator' &&
              astNode(node.id) &&
              astNode(node.init) &&
              ['ArrowFunctionExpression', 'FunctionExpression'].includes(node.init.type)
            ? String(node.id.name)
            : null;
      let hasJsx = false;
      if (named)
        walk(node, (child) => {
          if (child.type === 'JSXElement' || child.type === 'JSXFragment') hasJsx = true;
        });
      if (named && !hasJsx)
        definitions.push({
          id: 'agent:symbol:' + named,
          name: named,
          kind: node.type === 'ClassDeclaration' ? 'Class' : 'Function',
          ast: node,
        });
    });
    for (const [index, definition] of definitions.entries()) {
      if (used.has(definition.id)) continue;
      const old = byId.get(definition.id);
      const x = old?.x ?? baseX + 32 + (index % 3) * 250;
      const y = old?.y ?? 120 + Math.floor(index / 3) * 160;
      add(definition.id, {
        type: 'frame',
        name: definition.name,
        parentId: stageId,
        x,
        y,
        width: old?.width ?? 220,
        height: old?.height ?? 110,
        fill: '#e2f0e7',
        radius: 6,
        managedBy: 'agent',
        sourceKey: definition.id,
      });
      add(definition.id + ':label', {
        type: 'text',
        name: definition.name + ' label',
        text: definition.kind + '\n' + definition.name,
        parentId: definition.id,
        x: x + 16,
        y: y + 22,
        width: 190,
        height: 65,
        fontSize: 19,
        fill: '#254f3f',
        managedBy: 'agent',
        sourceKey: definition.id + ':label',
      });
      const called = new Set<string>();
      walk(definition.ast, (n) => {
        if (n.type === 'CallExpression' && astNode(n.callee) && n.callee.type === 'Identifier')
          called.add(String(n.callee.name));
      });
      for (const name of called)
        if (name !== definition.name && definitions.some((d) => d.name === name)) {
          const id = `agent:call:${definition.name}:${name}`;
          add(id, {
            type: 'line',
            name: `${definition.name} calls ${name}`,
            parentId: stageId,
            sourceId: definition.id,
            targetId: 'agent:symbol:' + name,
            x,
            y,
            width: 200,
            height: 0,
            stroke: '#638d79',
            strokeWidth: 2,
            managedBy: 'agent',
            sourceKey: id,
          });
        }
    }
  }
  if (!used.has(stageId) && changes.some((change) => change.values.parentId === stageId)) {
    const managed = changes.filter((n) => n.values.parentId === stageId);
    add(stageId, {
      type: 'frame',
      name: 'Code structure',
      x: baseX,
      y: 80,
      width: Math.max(
        760,
        ...managed.map((n) => (n.values.x ?? baseX) + (n.values.width ?? 0) - baseX + 32),
      ),
      height: Math.max(
        360,
        ...managed.map((n) => (n.values.y ?? 80) + (n.values.height ?? 0) - 80 + 32),
      ),
      fill: '#f8fbf9',
      managedBy: 'agent',
      sourceKey: stageId,
    });
  }
  const remove = existing
    .filter((n) => n.managedBy === 'agent' && !used.has(n.id))
    .map((n) => n.id);
  return {
    nodes: changes,
    remove,
    message: `Parsed ${changes.length} visual nodes from the code AST. Existing artwork is preserved.`,
  };
}
