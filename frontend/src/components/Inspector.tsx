import {
  ArrowDownToLine,
  ArrowUpToLine,
  Bold,
  CheckCircle2,
  ChevronRight,
  Copy,
  Download,
  Group,
  Trash2,
  Ungroup,
  X,
  AlignLeft,
  AlignCenterHorizontal,
  AlignRight,
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
} from 'lucide-react';
import {
  LOCAL,
  metadataOf,
  moveNodes,
  readNode,
  reparent,
  resolvedParents,
  type CanvasNode,
} from '../../../shared/canvas';
import { Workspace } from '../canvas/Workspace';
import { IconButton, NumberField, Section, ColorField } from './Controls';

const palette = [
  '#254f3f',
  '#b9e8d3',
  '#f38f78',
  '#dad6ef',
  '#514366',
  '#ffffff',
  '#202723',
  '#7bb8d4',
];
export function Inspector({
  w,
  open,
  close,
  onExport,
}: {
  w: Workspace;
  open: boolean;
  close: () => void;
  onExport: () => void;
}) {
  const nodes = w.nodes;
  const selected = w.selected.map((id) => readNode(w.doc, id)).filter((n): n is CanvasNode => !!n);
  const node = selected.length === 1 ? selected[0] : undefined;
  const parents = resolvedParents(nodes);
  const align = (axis: 'x' | 'y', mode: 'start' | 'center' | 'end') => {
    if (selected.length < 2) return;
    const size = axis === 'x' ? 'width' : 'height';
    const start = Math.min(...selected.map((n) => n[axis]));
    const end = Math.max(...selected.map((n) => n[axis] + n[size]));
    w.undo.stopCapturing();
    w.doc.transact(
      () =>
        selected.forEach((n) => {
          const value =
            mode === 'start' ? start : mode === 'end' ? end - n[size] : (start + end - n[size]) / 2;
          moveNodes(w.doc, [n.id], axis === 'x' ? value - n.x : 0, axis === 'y' ? value - n.y : 0);
        }),
      LOCAL,
    );
  };
  return (
    <aside className={'inspector-panel ' + (open ? 'mobile-open' : '')}>
      <div className="inspector-tabs">
        <span className="active">Design</span>
        <span className="inspector-type">
          {node?.type ?? (selected.length ? 'Multiple' : 'Canvas')}
        </span>
        <IconButton label="Close properties" onClick={close} className="icon-button mobile-close">
          <X size={16} />
        </IconButton>
      </div>
      <div className="inspector-scroll">
        {selected.length ? (
          <>
            <Section
              title={node ? 'Layer' : selected.length + ' layers selected'}
              action={
                <IconButton label="Delete selection" onClick={() => w.remove()}>
                  <Trash2 size={14} />
                </IconButton>
              }
            >
              {node && (
                <input
                  className="layer-name-input"
                  aria-label="Layer name"
                  value={node.name}
                  onChange={(e) => w.patch({ name: e.target.value })}
                />
              )}
              <div className="alignment-tools">
                <IconButton
                  label="Align left"
                  disabled={selected.length < 2}
                  onClick={() => align('x', 'start')}
                >
                  <AlignLeft size={15} />
                </IconButton>
                <IconButton
                  label="Align horizontal centers"
                  disabled={selected.length < 2}
                  onClick={() => align('x', 'center')}
                >
                  <AlignCenterHorizontal size={15} />
                </IconButton>
                <IconButton
                  label="Align right"
                  disabled={selected.length < 2}
                  onClick={() => align('x', 'end')}
                >
                  <AlignRight size={15} />
                </IconButton>
                <IconButton
                  label="Align top"
                  disabled={selected.length < 2}
                  onClick={() => align('y', 'start')}
                >
                  <AlignStartVertical size={15} />
                </IconButton>
                <IconButton
                  label="Align vertical centers"
                  disabled={selected.length < 2}
                  onClick={() => align('y', 'center')}
                >
                  <AlignCenterVertical size={15} />
                </IconButton>
                <IconButton
                  label="Align bottom"
                  disabled={selected.length < 2}
                  onClick={() => align('y', 'end')}
                >
                  <AlignEndVertical size={15} />
                </IconButton>
              </div>
            </Section>
            {node && (
              <>
                <Section title="Position">
                  <div className="field-grid">
                    <NumberField
                      label="X"
                      value={node.x}
                      onChange={(value) => w.move(value - node.x, 0)}
                    />
                    <NumberField
                      label="Y"
                      value={node.y}
                      onChange={(value) => w.move(0, value - node.y)}
                    />
                    <NumberField
                      label="W"
                      value={node.width}
                      min={1}
                      onChange={(width) => w.patch({ width })}
                    />
                    <NumberField
                      label="H"
                      value={node.height}
                      min={node.type === 'line' ? 0 : 1}
                      onChange={(height) => w.patch({ height })}
                    />
                    <NumberField
                      label="Rotation"
                      value={node.rotation}
                      min={-360}
                      max={360}
                      onChange={(rotation) => w.patch({ rotation })}
                    />
                    <NumberField
                      label="Radius"
                      value={node.radius}
                      min={0}
                      onChange={(radius) => w.patch({ radius })}
                    />
                  </div>
                </Section>
                {node.type === 'text' && (
                  <Section title="Typography">
                    <div className="font-name">
                      Arial <span>{node.bold ? 'Bold' : 'Regular'}</span>
                    </div>
                    <div className="font-controls">
                      <NumberField
                        label="Size"
                        value={node.fontSize}
                        min={4}
                        max={512}
                        onChange={(fontSize) => w.patch({ fontSize })}
                      />
                      <IconButton
                        label="Bold"
                        active={node.bold}
                        onClick={() => w.patch({ bold: !node.bold })}
                      >
                        <Bold size={15} />
                      </IconButton>
                    </div>
                    <textarea
                      aria-label="Text content"
                      className="text-content"
                      value={node.text}
                      onChange={(e) =>
                        w.patch({
                          text: e.target.value,
                          name: e.target.value.split('\n')[0].slice(0, 40) || 'Text',
                        })
                      }
                    />
                  </Section>
                )}
                <Section title="Appearance">
                  <NumberField
                    label="Opacity %"
                    value={node.opacity * 100}
                    min={0}
                    max={100}
                    onChange={(value) => w.patch({ opacity: value / 100 })}
                  />
                </Section>
                <Section title="Fill">
                  <ColorField
                    label="Fill color"
                    value={node.fill}
                    onChange={(fill) => w.patch({ fill })}
                  />
                  <div className="swatches">
                    {palette.map((color) => (
                      <button
                        key={color}
                        aria-label={'Fill ' + color}
                        title={color}
                        style={{ backgroundColor: color }}
                        className={node.fill === color ? 'chosen' : ''}
                        onClick={() => w.patch({ fill: color })}
                      />
                    ))}
                  </div>
                </Section>
                <Section title="Stroke">
                  <ColorField
                    label="Stroke color"
                    value={node.stroke}
                    onChange={(stroke) => w.patch({ stroke })}
                  />
                  <div className="stroke-width">
                    <NumberField
                      label="Weight"
                      value={node.strokeWidth}
                      min={0}
                      max={100}
                      onChange={(strokeWidth) => w.patch({ strokeWidth })}
                    />
                  </div>
                </Section>
                {node.type === 'line' && (
                  <Section title="Connection">
                    <label className="connection-field">
                      From
                      <select
                        aria-label="Connection source"
                        className="select-input"
                        value={node.sourceId ?? ''}
                        onChange={(e) => w.patch({ sourceId: e.target.value || null })}
                      >
                        <option value="">Free endpoint</option>
                        {nodes
                          .filter((n) => n.id !== node.id && n.type !== 'line')
                          .map((n) => (
                            <option key={n.id} value={n.id}>
                              {n.name}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label className="connection-field">
                      To
                      <select
                        aria-label="Connection target"
                        className="select-input"
                        value={node.targetId ?? ''}
                        onChange={(e) => w.patch({ targetId: e.target.value || null })}
                      >
                        <option value="">Free endpoint</option>
                        {nodes
                          .filter((n) => n.id !== node.id && n.type !== 'line')
                          .map((n) => (
                            <option key={n.id} value={n.id}>
                              {n.name}
                            </option>
                          ))}
                      </select>
                    </label>
                  </Section>
                )}
                <Section title="Parent">
                  <select
                    className="select-input"
                    aria-label="Parent layer"
                    value={parents.get(node.id) ?? ''}
                    onChange={(e) => reparent(w.doc, node.id, e.target.value || null)}
                  >
                    <option value="">Page 1</option>
                    {nodes
                      .filter((n) => ['frame', 'group'].includes(n.type) && w.canParent(n.id))
                      .map((n) => (
                        <option value={n.id} key={n.id}>
                          {n.name}
                        </option>
                      ))}
                  </select>
                </Section>
              </>
            )}
            <Section title="Arrange">
              <div className="arrange-tools">
                <IconButton label="Send to back" onClick={() => w.arrange('back')}>
                  <ArrowDownToLine size={17} />
                </IconButton>
                <IconButton label="Bring to front" onClick={() => w.arrange('front')}>
                  <ArrowUpToLine size={17} />
                </IconButton>
                <IconButton label="Duplicate (Ctrl D)" onClick={() => w.duplicate()}>
                  <Copy size={16} />
                </IconButton>
                <IconButton
                  label={node?.type === 'group' ? 'Ungroup' : 'Group selection'}
                  disabled={selected.length < 2 && node?.type !== 'group'}
                  onClick={() => (node?.type === 'group' ? w.ungroup() : w.group())}
                >
                  {node?.type === 'group' ? <Ungroup size={17} /> : <Group size={17} />}
                </IconButton>
              </div>
            </Section>
          </>
        ) : (
          <>
            <Section title="Canvas">
              <ColorField
                label="Canvas background"
                value={metadataOf(w.doc).get('background') ?? '#edeff1'}
                onChange={(color) =>
                  w.doc.transact(() => metadataOf(w.doc).set('background', color), LOCAL)
                }
              />
              <label className="toggle-row">
                <span>Dot grid</span>
                <input
                  type="checkbox"
                  checked={w.grid}
                  onChange={(e) => {
                    w.grid = e.target.checked;
                    w.emit();
                  }}
                />
              </label>
            </Section>
            <Section title="Document">
              <div className="detail-row">
                <span>Frames</span>
                <span>{nodes.filter((n) => n.type === 'frame').length}</span>
              </div>
              <div className="detail-row">
                <span>Layers</span>
                <span>{nodes.length}</span>
              </div>
              <div className="detail-row">
                <span>Color profile</span>
                <span>sRGB</span>
              </div>
            </Section>
            <Section title="Document colors">
              <div className="document-swatches">
                {[...new Set(nodes.map((n) => n.fill))]
                  .filter((color) => color.startsWith('#'))
                  .slice(0, 12)
                  .map((color) => (
                    <button
                      key={color}
                      title={color}
                      aria-label={'Copy color ' + color}
                      style={{ backgroundColor: color }}
                      onClick={() =>
                        navigator.clipboard
                          .writeText(color)
                          .then(() => w.notify(color.toUpperCase() + ' copied.'))
                          .catch(() => w.notify(color))
                      }
                    />
                  ))}
              </div>
            </Section>
            <Section title="In this canvas">
              <div className="people-list">
                {w.people.map((person) => (
                  <div key={person.id}>
                    <span className="avatar small" style={{ backgroundColor: person.color }}>
                      {person.name[0]}
                    </span>
                    <span>{person.name}</span>
                    {person.id === w.doc.clientID && <small>You</small>}
                    <span className="online-dot" />
                  </div>
                ))}
              </div>
            </Section>
            <div className="inspector-note">
              <span className="note-line" />
              <span>Good things take shape.</span>
              <span className="note-line" />
            </div>
          </>
        )}
        <Section title="Export">
          <button className="button full-width" onClick={onExport}>
            <Download size={14} />
            Export {selected.length ? 'selection' : 'canvas'}
            <ChevronRight size={13} />
          </button>
        </Section>
      </div>
      <div className="inspector-bottom">
        <CheckCircle2 size={13} />
        <span>
          {w.provider.status === 'live' ? 'Connected to room' : 'Local editing available'}
        </span>
      </div>
    </aside>
  );
}
