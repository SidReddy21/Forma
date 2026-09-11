import type * as Y from 'yjs';
import {
  connectionGeometry,
  descendants,
  readNode,
  readNodes,
  resolvedParents,
  treeNodes,
} from '../../../shared/canvas';

const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]!,
  );
export function exportSVG(doc: Y.Doc, selected: string[] = []): string {
  const all = treeNodes(readNodes(doc)).map((n) =>
    connectionGeometry(n, (id) => readNode(doc, id)),
  );
  const parents = resolvedParents(all);
  const hidden = new Set<string>();
  for (const node of all)
    if (!node.visible || hidden.has(parents.get(node.id) ?? '')) hidden.add(node.id);
  const ids = selected.length ? new Set(descendants(doc, selected)) : null;
  const nodes = all.filter(
    (n) => !hidden.has(n.id) && (!ids || ids.has(n.id)) && n.type !== 'group',
  );
  if (!nodes.length) return '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>';
  const corners = nodes.flatMap((n) => {
    const angle = (n.rotation * Math.PI) / 180;
    const cx = n.type === 'ellipse' ? n.width / 2 : 0;
    const cy = n.type === 'ellipse' ? n.height / 2 : 0;
    return [
      [0, 0],
      [n.width, 0],
      [0, n.height],
      [n.width, n.height],
    ].map(([x, y]) => ({
      x: n.x + cx + (x - cx) * Math.cos(angle) - (y - cy) * Math.sin(angle),
      y: n.y + cy + (x - cx) * Math.sin(angle) + (y - cy) * Math.cos(angle),
    }));
  });
  const padding = Math.max(...nodes.map((n) => n.strokeWidth)) / 2;
  const x = Math.min(...corners.map((p) => p.x)) - padding;
  const y = Math.min(...corners.map((p) => p.y)) - padding;
  const width = Math.max(...corners.map((p) => p.x)) - x + padding;
  const height = Math.max(...corners.map((p) => p.y)) - y + padding;
  const shapes = nodes
    .map((n) => {
      const transform = `translate(${n.x} ${n.y}) rotate(${n.rotation} ${n.type === 'ellipse' ? n.width / 2 : 0} ${n.type === 'ellipse' ? n.height / 2 : 0})`;
      const attributes = `transform="${transform}" fill="${escape(n.fill)}" stroke="${escape(n.stroke)}" stroke-width="${n.strokeWidth}" opacity="${n.opacity}"`;
      if (n.type === 'ellipse')
        return `<ellipse ${attributes} cx="${n.width / 2}" cy="${n.height / 2}" rx="${n.width / 2}" ry="${n.height / 2}"/>`;
      if (n.type === 'line')
        return `<line ${attributes} x1="0" y1="0" x2="${n.width}" y2="${n.height}"/>`;
      if (n.type === 'text')
        return `<text ${attributes} font-family="Arial, sans-serif" font-size="${n.fontSize}" font-weight="${n.bold ? 700 : 400}">${n.text
          .split('\n')
          .map(
            (line, index) =>
              `<tspan x="0" y="${n.fontSize * (0.8 + index * 0.98)}">${escape(line)}</tspan>`,
          )
          .join('')}</text>`;
      return `<rect ${attributes} width="${n.width}" height="${n.height}" rx="${n.radius}"/>`;
    })
    .join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.max(1, width)}" height="${Math.max(1, height)}" viewBox="${x} ${y} ${Math.max(1, width)} ${Math.max(1, height)}">\n${shapes}\n</svg>`;
}
