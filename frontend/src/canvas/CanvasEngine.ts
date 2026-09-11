import Konva from 'konva';
import * as Y from 'yjs';
import {
  LOCAL,
  connectionGeometry,
  descendants,
  metadataOf,
  moveNodes,
  nodesOf,
  patchNode,
  readNode,
  resolvedParents,
  treeNodes,
  type CanvasNode,
} from '../../../shared/canvas';
import { Workspace, type Presence } from './Workspace';

type Point = { x: number; y: number };
export class CanvasEngine {
  readonly stage: Konva.Stage;
  private content = new Konva.Layer();
  private overlay = new Konva.Layer();
  private remote = new Konva.Group({ listening: false });
  private labels = new Konva.Group({ listening: false });
  private transformer = new Konva.Transformer({
    borderStroke: '#388b70',
    anchorStroke: '#388b70',
    anchorFill: '#fff',
    anchorSize: 7,
    padding: 1,
    rotateAnchorOffset: 22,
    flipEnabled: false,
    ignoreStroke: true,
    boundBoxFunc: (old, box) => (Math.abs(box.width) < 8 || Math.abs(box.height) < 8 ? old : box),
  });
  private shapes = new Map<string, Konva.Shape>();
  private resize: ResizeObserver;
  private unsubscribe: () => void;
  private fitted = false;
  private start: Point | null = null;
  private panning = false;
  private panStart: Point = { x: 0, y: 0 };
  private rubber = new Konva.Rect({
    stroke: '#388b70',
    fill: '#388b7015',
    strokeWidth: 1,
    listening: false,
    visible: false,
  });
  private space = false;
  private drawing = false;
  private dragOrigin: Point | null = null;
  private dragPositions = new Map<string, Point>();
  private awarenessTime = 0;
  private unsubscribeDoc: () => void;

  constructor(
    private container: HTMLDivElement,
    readonly workspace: Workspace,
  ) {
    this.stage = new Konva.Stage({
      container,
      width: container.clientWidth,
      height: container.clientHeight,
    });
    this.stage.add(this.content, this.overlay);
    this.overlay.add(this.labels, this.remote, this.rubber, this.transformer);
    this.resize = new ResizeObserver(() => {
      this.stage.size({ width: container.clientWidth, height: container.clientHeight });
      if (!this.fitted) this.fit();
      this.drawLabels();
    });
    this.resize.observe(container);
    this.unsubscribe = workspace.subscribe(() => this.updateSelection());
    const render = (events: Y.YEvent<Y.AbstractType<unknown>>[]) => {
      const structural = events.some(
        (event) =>
          event.path.length === 0 ||
          [...event.changes.keys.keys()].some((key) =>
            ['parentId', 'order', 'visible', 'locked'].includes(key),
          ),
      );
      if (structural) this.render();
      else {
        for (const id of new Set(events.map((event) => String(event.path[0])))) {
          const node = readNode(workspace.doc, id);
          const shape = this.shapes.get(id);
          if (node && shape && !this.dragPositions.has(id)) this.applyGeometry(shape, node);
        }
        this.updateConnections();
        this.updateSelection();
        this.drawLabels();
        this.content.batchDraw();
      }
    };
    const background = () => {
      this.container.style.backgroundColor =
        metadataOf(workspace.doc).get('background') ?? '#edeff1';
    };
    nodesOf(workspace.doc).observeDeep(render);
    metadataOf(workspace.doc).observe(background);
    this.unsubscribeDoc = () => {
      nodesOf(workspace.doc).unobserveDeep(render);
      metadataOf(workspace.doc).unobserve(background);
    };
    workspace.provider.awareness.on('change', this.drawPresence);
    this.stage.on('mousedown touchstart', this.pointerDown);
    this.stage.on('mousemove touchmove', this.pointerMove);
    this.stage.on('mouseup touchend', this.pointerUp);
    this.stage.on('mouseleave', () =>
      workspace.provider.awareness.setLocalStateField('cursor', null),
    );
    this.stage.on('wheel', this.wheel);
    this.transformer.on('transform', () => this.publishBounds());
    this.transformer.on('transformend', () => this.commitTransform());
    window.addEventListener('keydown', this.keyDown);
    window.addEventListener('keyup', this.keyUp);
    window.addEventListener('blur', this.blur);
    this.render();
  }
  private shapeFor(node: CanvasNode): Konva.Shape {
    const shape: Konva.Shape =
      node.type === 'text'
        ? new Konva.Text()
        : node.type === 'ellipse'
          ? new Konva.Ellipse()
          : node.type === 'line'
            ? new Konva.Line()
            : new Konva.Rect();
    shape.id(node.id);
    shape.on('dragstart', () => {
      if (!this.workspace.selected.includes(node.id)) this.workspace.select([node.id]);
      this.workspace.undo.stopCapturing();
      this.dragOrigin = { x: shape.x(), y: shape.y() };
      this.dragPositions.clear();
      for (const id of descendants(this.workspace.doc, this.workspace.selected)) {
        const item = this.shapes.get(id);
        if (item) this.dragPositions.set(id, item.position());
      }
    });
    shape.on('dragmove', () => {
      if (!this.dragOrigin) return;
      const dx = shape.x() - this.dragOrigin.x;
      const dy = shape.y() - this.dragOrigin.y;
      for (const [id, point] of this.dragPositions)
        if (id !== node.id) this.shapes.get(id)?.position({ x: point.x + dx, y: point.y + dy });
      this.updateConnections();
      this.transformer.forceUpdate();
      this.publishBounds();
    });
    shape.on('dragend', () => {
      if (!this.dragOrigin) return;
      const dx = shape.x() - this.dragOrigin.x;
      const dy = shape.y() - this.dragOrigin.y;
      this.dragOrigin = null;
      this.dragPositions.clear();
      moveNodes(this.workspace.doc, this.workspace.selected, dx, dy);
      this.publishBounds();
    });
    shape.on('dblclick dbltap', () => {
      if (node.type === 'text' && !readNode(this.workspace.doc, node.id)?.locked) {
        this.workspace.select([node.id]);
        document.querySelector<HTMLTextAreaElement>('[aria-label="Text content"]')?.focus();
      }
    });
    this.content.add(shape);
    return shape;
  }
  private applyGeometry(shape: Konva.Shape, node: CanvasNode) {
    node = connectionGeometry(node, (id) => {
      const record = readNode(this.workspace.doc, id);
      const visual = this.shapes.get(id);
      if (!record || !visual) return record;
      const width = record.width * visual.scaleX();
      const height = record.height * visual.scaleY();
      return {
        ...record,
        x: visual.x() - (record.type === 'ellipse' ? width / 2 : 0),
        y: visual.y() - (record.type === 'ellipse' ? height / 2 : 0),
        width,
        height,
        rotation: visual.rotation(),
      };
    });
    const isEllipse = node.type === 'ellipse';
    shape.setAttrs({
      x: node.x + (isEllipse ? node.width / 2 : 0),
      y: node.y + (isEllipse ? node.height / 2 : 0),
      width: node.width,
      height: node.height,
      rotation: node.rotation,
      fill: node.fill,
      stroke: node.stroke,
      strokeWidth: node.strokeWidth,
      opacity: node.opacity,
      scaleX: 1,
      scaleY: 1,
      perfectDrawEnabled: false,
    });
    if (shape instanceof Konva.Rect) shape.cornerRadius(node.radius);
    if (shape instanceof Konva.Ellipse) shape.radius({ x: node.width / 2, y: node.height / 2 });
    if (shape instanceof Konva.Text)
      shape.setAttrs({
        text: node.text,
        fontSize: node.fontSize,
        fontFamily: 'Arial, sans-serif',
        fontStyle: node.bold ? 'bold' : 'normal',
        lineHeight: 0.98,
        wrap: 'word',
      });
    if (shape instanceof Konva.Line) shape.points([0, 0, node.width, node.height]);
  }
  private render() {
    const nodes = treeNodes(this.workspace.nodes);
    const ids = new Set(nodes.map((n) => n.id));
    for (const [id, shape] of this.shapes)
      if (!ids.has(id)) {
        shape.destroy();
        this.shapes.delete(id);
      }
    const parents = resolvedParents(nodes);
    const hidden = new Set<string>();
    const locked = new Set<string>();
    nodes.forEach((node, index) => {
      const parent = parents.get(node.id) ?? '';
      if (!node.visible || hidden.has(parent)) hidden.add(node.id);
      if (node.locked || locked.has(parent)) locked.add(node.id);
      let shape = this.shapes.get(node.id);
      if (!shape) {
        shape = this.shapeFor(node);
        this.shapes.set(node.id, shape);
      }
      if (!this.dragPositions.has(node.id)) this.applyGeometry(shape, node);
      shape.setAttrs({
        visible: !hidden.has(node.id),
        listening: !locked.has(node.id),
        draggable: !locked.has(node.id) && this.workspace.tool === 'select' && !this.space,
      });
      if (shape.zIndex() !== index) shape.zIndex(index);
    });
    this.container.style.backgroundColor =
      metadataOf(this.workspace.doc).get('background') ?? '#edeff1';
    this.updateConnections();
    this.updateSelection();
    if (!this.fitted && nodes.length) this.fit();
    this.drawLabels();
    this.drawPresence();
    this.content.batchDraw();
  }
  private updateConnections() {
    for (const node of this.workspace.nodes)
      if (node.type === 'line' && (node.sourceId || node.targetId)) {
        const shape = this.shapes.get(node.id);
        if (shape) this.applyGeometry(shape, node);
      }
  }
  private updateSelection() {
    const { workspace } = this;
    const selected = workspace.selected
      .map((id) => this.shapes.get(id))
      .filter((shape): shape is Konva.Shape => !!shape && shape.visible() && shape.listening());
    this.transformer.nodes(selected);
    const containerSelected = workspace.selected.some((id) =>
      ['frame', 'group'].includes(readNode(workspace.doc, id)?.type ?? ''),
    );
    this.transformer.resizeEnabled(!containerSelected);
    this.transformer.rotateEnabled(!containerSelected);
    this.container.style.cursor =
      workspace.tool === 'hand' || this.space
        ? 'grab'
        : workspace.tool === 'select'
          ? 'default'
          : 'crosshair';
    this.container.classList.toggle('with-grid', workspace.grid);
    for (const shape of this.shapes.values())
      shape.draggable(shape.listening() && workspace.tool === 'select' && !this.space);
    this.publishBounds();
    this.overlay.batchDraw();
  }
  private world(): Point {
    const pointer = this.stage.getPointerPosition() ?? { x: 0, y: 0 };
    return {
      x: (pointer.x - this.stage.x()) / this.stage.scaleX(),
      y: (pointer.y - this.stage.y()) / this.stage.scaleY(),
    };
  }
  private pointerDown = (event: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    this.workspace.activeSurface = 'canvas';
    this.workspace.emit();
    if ('button' in event.evt && event.evt.button === 2) return;
    const pointer = this.stage.getPointerPosition();
    if (!pointer) return;
    if (
      this.workspace.tool === 'hand' ||
      this.space ||
      ('button' in event.evt && event.evt.button === 1)
    ) {
      event.evt.preventDefault();
      this.panning = true;
      this.start = pointer;
      this.panStart = this.stage.position();
      return;
    }
    if (event.target.getParent() === this.transformer) return;
    const id = event.target.id();
    if (this.workspace.tool === 'select' && id && this.shapes.has(id)) {
      const shift = 'shiftKey' in event.evt && event.evt.shiftKey;
      const ids = this.workspace.selected;
      this.workspace.select(
        shift
          ? ids.includes(id)
            ? ids.filter((value) => value !== id)
            : [...ids, id]
          : ids.includes(id)
            ? ids
            : [id],
      );
      this.publishBounds();
      return;
    }
    this.start = this.world();
    this.drawing = this.workspace.tool !== 'select';
    if (!this.drawing) this.workspace.select([]);
    this.rubber.setAttrs({
      x: this.start.x,
      y: this.start.y,
      width: 0,
      height: 0,
      visible: true,
      strokeWidth: 1 / this.stage.scaleX(),
    });
  };
  private pointerMove = () => {
    const point = this.world();
    if (performance.now() - this.awarenessTime > 40) {
      this.workspace.provider.awareness.setLocalStateField('cursor', point);
      this.awarenessTime = performance.now();
    }
    if (!this.start) return;
    if (this.panning) {
      const pointer = this.stage.getPointerPosition()!;
      this.stage.position({
        x: this.panStart.x + pointer.x - this.start.x,
        y: this.panStart.y + pointer.y - this.start.y,
      });
      this.stage.batchDraw();
      return;
    }
    this.rubber.setAttrs({
      x: Math.min(this.start.x, point.x),
      y: Math.min(this.start.y, point.y),
      width: Math.abs(point.x - this.start.x),
      height: Math.abs(point.y - this.start.y),
    });
    this.overlay.batchDraw();
  };
  private pointerUp = () => {
    if (!this.start) return;
    if (this.panning) {
      this.panning = false;
      this.start = null;
      return;
    }
    const bounds = {
      x: this.rubber.x(),
      y: this.rubber.y(),
      width: this.rubber.width(),
      height: this.rubber.height(),
    };
    if (this.drawing) {
      const tool = this.workspace.tool;
      if (tool === 'line') {
        const end = this.world();
        const dx = end.x - this.start.x;
        const dy = end.y - this.start.y;
        const length = Math.hypot(dx, dy);
        const id = this.workspace.create(
          'line',
          this.start.x,
          this.start.y,
          length > 5 ? length : 160,
          0,
        );
        patchNode(this.workspace.doc, id, {
          rotation: length > 5 ? (Math.atan2(dy, dx) * 180) / Math.PI : 0,
        });
      } else if (tool !== 'select' && tool !== 'hand')
        this.workspace.create(
          tool,
          bounds.x,
          bounds.y,
          bounds.width > 5 ? bounds.width : undefined,
          bounds.height > 5 ? bounds.height : undefined,
        );
    } else if (bounds.width > 3 && bounds.height > 3) {
      this.workspace.select(
        [...this.shapes]
          .filter(
            ([id, shape]) =>
              shape.visible() &&
              shape.listening() &&
              !['frame', 'group'].includes(readNode(this.workspace.doc, id)!.type) &&
              Konva.Util.haveIntersection(
                bounds,
                shape.getClientRect({ relativeTo: this.content }),
              ),
          )
          .map(([id]) => id),
      );
    }
    this.start = null;
    this.rubber.visible(false);
    this.publishBounds();
    this.overlay.batchDraw();
  };
  private commitTransform() {
    this.workspace.undo.stopCapturing();
    this.workspace.doc.transact(() => {
      for (const shape of this.transformer.nodes()) {
        const node = readNode(this.workspace.doc, shape.id());
        if (!node) continue;
        const width = Math.max(1, node.width * shape.scaleX());
        const height =
          node.type === 'line'
            ? node.height * shape.scaleY()
            : Math.max(1, node.height * shape.scaleY());
        patchNode(this.workspace.doc, node.id, {
          x: shape.x() - (node.type === 'ellipse' ? width / 2 : 0),
          y: shape.y() - (node.type === 'ellipse' ? height / 2 : 0),
          width,
          height,
          rotation: shape.rotation(),
          ...(node.type === 'text' ? { fontSize: node.fontSize * shape.scaleY() } : {}),
        });
      }
    }, LOCAL);
    this.publishBounds();
  }
  private publishBounds() {
    const bounds = this.workspace.selected
      .map((id) => this.shapes.get(id))
      .filter((shape): shape is Konva.Shape => !!shape)
      .map((shape) => shape.getClientRect({ relativeTo: this.content }));
    if (
      JSON.stringify(this.workspace.provider.awareness.getLocalState()?.bounds) !==
      JSON.stringify(bounds)
    )
      this.workspace.provider.awareness.setLocalStateField('bounds', bounds);
  }
  private drawPresence = () => {
    this.remote.destroyChildren();
    const scale = this.stage.scaleX();
    for (const [id, raw] of this.workspace.provider.awareness.getStates()) {
      if (id === this.workspace.doc.clientID) continue;
      const state = raw as Presence;
      if (!state.user || typeof state.user.color !== 'string') continue;
      for (const box of (Array.isArray(state.bounds) ? state.bounds : []).slice(0, 100)) {
        if (![box.x, box.y, box.width, box.height].every(Number.isFinite)) continue;
        this.remote.add(
          new Konva.Rect({
            ...box,
            stroke: state.user.color,
            strokeWidth: 1.5 / scale,
            dash: [5 / scale, 3 / scale],
          }),
        );
      }
      if (state.cursor && Number.isFinite(state.cursor.x) && Number.isFinite(state.cursor.y)) {
        const group = new Konva.Group({
          x: state.cursor.x,
          y: state.cursor.y,
          scaleX: 1 / scale,
          scaleY: 1 / scale,
        });
        group.add(
          new Konva.Line({
            points: [0, 0, 3, 17, 7, 12, 14, 11],
            closed: true,
            fill: state.user.color,
            stroke: 'white',
            strokeWidth: 1.5,
          }),
        );
        const name = String(state.user.name).slice(0, 32);
        const text = new Konva.Text({
          x: 15,
          y: 18,
          text: name,
          fontSize: 11,
          padding: 5,
          fill: 'white',
        });
        group.add(
          new Konva.Rect({
            x: 15,
            y: 18,
            width: text.width(),
            height: text.height(),
            fill: state.user.color,
            cornerRadius: 3,
          }),
          text,
        );
        this.remote.add(group);
      }
    }
    this.overlay.batchDraw();
  };
  private drawLabels() {
    this.labels.destroyChildren();
    const scale = this.stage.scaleX();
    for (const node of this.workspace.nodes.filter((n) => n.type === 'frame' && n.visible))
      this.labels.add(
        new Konva.Text({
          x: node.x,
          y: node.y - 23 / scale,
          text: node.name,
          fontSize: 11 / scale,
          fill: '#747d79',
        }),
      );
    this.overlay.batchDraw();
  }
  fit(selection = false) {
    this.stage.size({ width: this.container.clientWidth, height: this.container.clientHeight });
    const initialFrame =
      !this.fitted && this.stage.width() < 600
        ? this.workspace.nodes.find((n) => n.type === 'frame' && n.visible)
        : undefined;
    const focus = initialFrame
      ? new Set(descendants(this.workspace.doc, [initialFrame.id]))
      : undefined;
    const shapes = [...this.shapes]
      .filter(
        ([id, s]) =>
          s.visible() &&
          (!selection || this.workspace.selected.includes(id)) &&
          (!focus || focus.has(id)),
      )
      .map(([, s]) => s);
    if (!shapes.length) {
      this.stage.position({ x: 80, y: 80 });
      return;
    }
    const boxes = shapes.map((s) => s.getClientRect({ relativeTo: this.content }));
    const x = Math.min(...boxes.map((b) => b.x));
    const y = Math.min(...boxes.map((b) => b.y));
    const width = Math.max(...boxes.map((b) => b.x + b.width)) - x;
    const height = Math.max(...boxes.map((b) => b.y + b.height)) - y;
    const margin = this.stage.width() < 600 ? 56 : 100;
    const scale = Math.max(
      0.08,
      Math.min((this.stage.width() - margin) / width, (this.stage.height() - 140) / height, 1.5),
    );
    this.stage.scale({ x: scale, y: scale });
    this.stage.position({
      x: (this.stage.width() - width * scale) / 2 - x * scale,
      y: (this.stage.height() - height * scale) / 2 - y * scale,
    });
    this.fitted = true;
    this.zoomChanged();
  }
  zoomTo(scale: number, point = { x: this.stage.width() / 2, y: this.stage.height() / 2 }) {
    scale = Math.min(4, Math.max(0.08, scale));
    const old = this.stage.scaleX();
    const world = { x: (point.x - this.stage.x()) / old, y: (point.y - this.stage.y()) / old };
    this.stage.scale({ x: scale, y: scale });
    this.stage.position({ x: point.x - world.x * scale, y: point.y - world.y * scale });
    this.zoomChanged();
  }
  private zoomChanged() {
    this.workspace.zoom = this.stage.scaleX();
    this.workspace.emit();
    this.drawLabels();
    this.drawPresence();
    this.stage.batchDraw();
  }
  private wheel = (event: Konva.KonvaEventObject<WheelEvent>) => {
    event.evt.preventDefault();
    if (event.evt.ctrlKey || event.evt.metaKey)
      this.zoomTo(
        this.stage.scaleX() * Math.exp(-event.evt.deltaY * 0.01),
        this.stage.getPointerPosition()!,
      );
    else {
      this.stage.x(this.stage.x() - event.evt.deltaX);
      this.stage.y(this.stage.y() - event.evt.deltaY);
      this.stage.batchDraw();
    }
  };
  private keyDown = (event: KeyboardEvent) => {
    if (
      (event.target as HTMLElement).closest(
        'input, textarea, select, [contenteditable], .monaco-editor',
      )
    )
      return;
    const mod = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    if (key === ' ') {
      event.preventDefault();
      this.space = true;
      this.updateSelection();
      return;
    }
    if (mod && ['z', 'y', 'd', 'a', 'g', 's'].includes(key)) {
      event.preventDefault();
      if (key === 'z') event.shiftKey ? this.workspace.undo.redo() : this.workspace.undo.undo();
      if (key === 'y') this.workspace.undo.redo();
      if (key === 'd') this.workspace.duplicate();
      if (key === 'a')
        this.workspace.select(
          this.workspace.nodes
            .filter((n) => n.visible && !n.locked && n.parentId === null)
            .map((n) => n.id),
        );
      if (key === 'g') event.shiftKey ? this.workspace.ungroup() : this.workspace.group();
      if (key === 's')
        this.workspace.notify(
          this.workspace.provider.status === 'live'
            ? 'Changes sync automatically.'
            : 'Changes are saved on this device.',
        );
      return;
    }
    if (key === 'escape') {
      this.workspace.select([]);
      this.workspace.setTool('select');
      this.start = null;
      this.rubber.visible(false);
    }
    if (key === 'delete' || key === 'backspace') {
      event.preventDefault();
      this.workspace.remove();
    }
    if (key.startsWith('arrow')) {
      event.preventDefault();
      const step = event.shiftKey ? 10 : 1;
      this.workspace.move(
        key === 'arrowleft' ? -step : key === 'arrowright' ? step : 0,
        key === 'arrowup' ? -step : key === 'arrowdown' ? step : 0,
      );
    }
    if (key === ']') this.workspace.arrange('front');
    if (key === '[') this.workspace.arrange('back');
    if (key === '1' && event.shiftKey) this.fit();
    if (key === '2' && event.shiftKey) this.fit(true);
    if (!mod) {
      const tool = (
        {
          v: 'select',
          h: 'hand',
          f: 'frame',
          r: 'rectangle',
          o: 'ellipse',
          t: 'text',
          l: 'line',
        } as const
      )[key as 'v'];
      if (tool) this.workspace.setTool(tool);
    }
  };
  private keyUp = (event: KeyboardEvent) => {
    if (event.key === ' ') {
      this.space = false;
      this.updateSelection();
    }
  };
  private blur = () => {
    this.space = false;
    this.start = null;
    this.panning = false;
    this.rubber.visible(false);
    this.updateSelection();
  };
  exportPNG() {
    const selected = this.workspace.selected.length
      ? new Set(descendants(this.workspace.doc, this.workspace.selected))
      : null;
    const original = new Map([...this.shapes].map(([id, shape]) => [id, shape.visible()]));
    if (selected)
      for (const [id, shape] of this.shapes) shape.visible(original.get(id)! && selected.has(id));
    const visible = [...this.shapes.values()].filter((s) => s.visible());
    if (!visible.length) {
      this.workspace.notify('Add a shape before exporting.');
      return;
    }
    const boxes = visible.map((s) => s.getClientRect({ relativeTo: this.content }));
    const x = Math.min(...boxes.map((b) => b.x));
    const y = Math.min(...boxes.map((b) => b.y));
    const width = Math.max(...boxes.map((b) => b.x + b.width)) - x;
    const height = Math.max(...boxes.map((b) => b.y + b.height)) - y;
    const position = this.stage.position();
    const scale = this.stage.scaleX();
    try {
      this.stage.position({ x: 0, y: 0 });
      this.stage.scale({ x: 1, y: 1 });
      const url = this.content.toDataURL({
        x,
        y,
        width: Math.max(1, width),
        height: Math.max(1, height),
        pixelRatio: Math.min(2, 4096 / Math.max(width, height)),
      });
      const link = document.createElement('a');
      link.href = url;
      link.download = this.workspace.name + '.png';
      link.click();
      this.workspace.notify('PNG exported.');
    } finally {
      for (const [id, visibility] of original) this.shapes.get(id)?.visible(visibility);
      this.stage.position(position);
      this.stage.scale({ x: scale, y: scale });
      this.stage.batchDraw();
    }
  }
  destroy() {
    this.resize.disconnect();
    this.unsubscribe();
    this.unsubscribeDoc();
    this.workspace.provider.awareness.off('change', this.drawPresence);
    window.removeEventListener('keydown', this.keyDown);
    window.removeEventListener('keyup', this.keyUp);
    window.removeEventListener('blur', this.blur);
    this.stage.destroy();
  }
}
