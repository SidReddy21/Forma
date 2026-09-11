import { lazy, Suspense, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  ArrowDownToLine,
  ArrowUpToLine,
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  Copy,
  Download,
  Eye,
  EyeOff,
  Frame,
  Group,
  Hand,
  Layers,
  Link2,
  Lock,
  Maximize,
  Minus,
  MousePointer2,
  Plus,
  Redo2,
  Search,
  Settings2,
  Share2,
  Slash,
  Square,
  Trash2,
  Type,
  Undo2,
  Unlock,
  X,
  FilePlus2,
  FolderOpen,
  Code2,
  Columns2,
  Bot,
} from 'lucide-react';
import { CanvasEngine } from './canvas/CanvasEngine';
import { Workspace, type Tool } from './canvas/Workspace';
import { patchNode, reparent, resolvedParents, treeNodes } from '../../shared/canvas';
import { exportSVG } from './canvas/export';
import { IconButton, Modal } from './components/Controls';
import { Inspector } from './components/Inspector';
import { AgentPanel } from './components/AgentPanel';
const CodePanel = lazy(() => import('./components/CodePanel'));

const tools: Array<{ id: Tool; icon: typeof Square; label: string }> = [
  { id: 'select', icon: MousePointer2, label: 'Move (V)' },
  { id: 'hand', icon: Hand, label: 'Hand (H)' },
  { id: 'frame', icon: Frame, label: 'Frame (F)' },
  { id: 'rectangle', icon: Square, label: 'Rectangle (R)' },
  { id: 'ellipse', icon: Circle, label: 'Ellipse (O)' },
  { id: 'line', icon: Slash, label: 'Line (L)' },
  { id: 'text', icon: Type, label: 'Text (T)' },
];
const nodeIcons = {
  frame: Frame,
  group: Group,
  rectangle: Square,
  ellipse: Circle,
  text: Type,
  line: Slash,
};
function Editor({ workspace: w }: { workspace: Workspace }) {
  useSyncExternalStore(w.subscribe, w.getSnapshot);
  const host = useRef<HTMLDivElement>(null);
  const engine = useRef<CanvasEngine>();
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const [view, setView] = useState<'canvas' | 'split' | 'code'>('canvas');
  const [agentOpen, setAgentOpen] = useState(false);
  const [fitRequest, setFitRequest] = useState(0);
  const fitSelection = useRef(false);
  const [collapsed, setCollapsed] = useState(new Set<string>(['shape-study', 'color-study']));
  const [search, setSearch] = useState('');
  const [share, setShare] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState('png');
  const [menu, setMenu] = useState(false);
  const [copied, setCopied] = useState(false);
  const [context, setContext] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const canvas = new CanvasEngine(host.current!, w);
    engine.current = canvas;
    return () => {
      canvas.destroy();
      engine.current = undefined;
    };
  }, [w]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (view !== 'code') engine.current?.fit(fitSelection.current);
      fitSelection.current = false;
    });
    return () => cancelAnimationFrame(frame);
  }, [view, agentOpen, fitRequest]);
  const history =
    view === 'code' || (view === 'split' && w.activeSurface === 'code') ? w.codeUndo : w.undo;
  const nodes = w.nodes;
  const parents = resolvedParents(nodes);
  const visibleLayers = treeNodes(nodes).filter((n) => {
    if (search) return n.name.toLowerCase().includes(search.toLowerCase());
    let parent = parents.get(n.id);
    while (parent) {
      if (collapsed.has(parent)) return false;
      parent = parents.get(parent);
    }
    return true;
  });
  const toggleCollapse = (id: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2400);
    } catch {
      w.notify('Select the room link to copy it.');
    }
  };
  const doExport = () => {
    if (exportFormat === 'png') engine.current?.exportPNG();
    else {
      const blob = new Blob([exportSVG(w.doc, w.selected)], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = w.name + '.svg';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      w.notify('SVG exported.');
    }
    setExportOpen(false);
  };
  return (
    <div
      className="app-shell"
      onClick={() => {
        if (context) setContext(null);
      }}
    >
      <header className="topbar">
        <button
          className="brand"
          onClick={() => setMenu(!menu)}
          aria-label="Forma file menu"
          aria-expanded={menu}
        >
          <span className="brand-mark">
            <span />
            <span />
            <span />
          </span>
          <span>forma</span>
          <ChevronDown size={12} />
        </button>
        <div className="top-divider" />
        <span className="breadcrumb">Workspace</span>
        <ChevronRight className="breadcrumb" size={13} />
        <input
          className="document-name"
          aria-label="Document name"
          value={w.name}
          onChange={(e) => w.rename(e.target.value)}
        />
        <span
          className={'connection ' + w.provider.status}
          title={
            w.provider.status === 'live'
              ? 'Connected to the shared canvas'
              : 'Edits sync on reconnect'
          }
        >
          <span />
          {w.provider.status === 'live'
            ? 'Live'
            : w.provider.status === 'connecting'
              ? 'Connecting'
              : 'Offline'}
        </span>
        <div className="top-spacer" />
        <div className="avatars">
          {w.people.slice(0, 4).map((person) => (
            <span
              className="avatar"
              key={person.id}
              title={person.name + (person.id === w.doc.clientID ? ' (you)' : '')}
              style={{ backgroundColor: person.color }}
            >
              {person.name.slice(0, 1).toUpperCase()}
            </span>
          ))}
          {w.people.length > 4 && (
            <span className="avatar overflow-avatar">+{w.people.length - 4}</span>
          )}
        </div>
        <button className="button share-button" onClick={() => setShare(true)}>
          <Share2 size={14} />
          <span>Share</span>
        </button>
        <button className="button dark-button export-top" onClick={() => setExportOpen(true)}>
          <Download size={14} />
          <span>Export</span>
        </button>
        {menu && (
          <>
            <div className="menu-dismiss" onClick={() => setMenu(false)} />
            <div className="dropdown file-menu">
              <span className="menu-caption">FORMA WORKSPACE</span>
              <button
                onClick={() => {
                  location.href = '/?room=' + crypto.randomUUID() + '&empty=1';
                }}
              >
                <FilePlus2 size={15} />
                New canvas
              </button>
              <button
                onClick={() => {
                  setExportOpen(true);
                  setMenu(false);
                }}
              >
                <Download size={15} />
                Export artwork
              </button>
              <div className="menu-rule" />
              <button
                onClick={() => {
                  w.grid = !w.grid;
                  w.emit();
                  setMenu(false);
                }}
              >
                <Settings2 size={15} />
                {w.grid ? 'Hide' : 'Show'} dot grid
              </button>
            </div>
          </>
        )}
      </header>
      <div className="workspace-bar">
        <div className="workspace-label">
          <span className="project-dot" />
          <span>Design exploration</span>
        </div>
        <div className="canvas-tabs" role="tablist" aria-label="Workspace views">
          <button
            role="tab"
            aria-selected={view === 'canvas'}
            className={'canvas-tab ' + (view === 'canvas' ? 'active' : '')}
            onClick={() => setView('canvas')}
          >
            <Frame size={13} />
            Canvas
          </button>
          <button
            role="tab"
            aria-selected={view === 'split'}
            className={'canvas-tab ' + (view === 'split' ? 'active' : '')}
            onClick={() => setView('split')}
          >
            <Columns2 size={13} />
            Split
          </button>
          <button
            role="tab"
            aria-selected={view === 'code'}
            className={'canvas-tab ' + (view === 'code' ? 'active' : '')}
            onClick={() => setView('code')}
          >
            <Code2 size={13} />
            Code
          </button>
          <span className="tab-detail">
            {nodes.filter((n) => n.type === 'frame').length} frames
          </span>
        </div>
        <div className="history-buttons">
          <button
            className={'agent-toggle ' + (agentOpen ? 'active' : '')}
            aria-label="Toggle agent"
            aria-pressed={agentOpen}
            onClick={() => setAgentOpen(!agentOpen)}
          >
            <Bot size={15} />
            <span>Agent</span>
            {w.provider.agent.busy && <span className="agent-working-dot" />}
          </button>
          <IconButton
            label="Undo (Ctrl Z)"
            disabled={!history.canUndo()}
            onClick={() => history.undo()}
          >
            <Undo2 size={15} />
          </IconButton>
          <IconButton
            label="Redo (Ctrl Shift Z)"
            disabled={!history.canRedo()}
            onClick={() => history.redo()}
          >
            <Redo2 size={15} />
          </IconButton>
        </div>
      </div>
      <main className={'editor-layout ' + (agentOpen ? 'with-agent' : '')}>
        <aside className={'layers-panel ' + (leftOpen ? 'mobile-open' : '')}>
          <div className="panel-title">
            <h2>Layers</h2>
            <div>
              <IconButton
                label="New frame"
                onClick={() => {
                  const x = Math.max(0, ...nodes.map((n) => n.x + n.width)) + 80;
                  w.create('frame', x, 80, 560, 740);
                  engine.current?.fit();
                }}
              >
                <Plus size={16} />
              </IconButton>
              <IconButton
                label="Close layers"
                onClick={() => setLeftOpen(false)}
                className="icon-button mobile-close"
              >
                <X size={16} />
              </IconButton>
            </div>
          </div>
          <div className="page-row">
            <span>
              <FolderOpen size={14} />
              Page 1
            </span>
            <Check size={13} />
          </div>
          <label className="layer-search">
            <Search size={13} />
            <input
              aria-label="Search layers"
              placeholder="Find a layer..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <div
            className="layer-list"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              if (e.target === e.currentTarget)
                reparent(w.doc, e.dataTransfer.getData('text/plain'), null);
            }}
          >
            {visibleLayers.map((n) => {
              const Icon = nodeIcons[n.type];
              const children = nodes.some((child) => parents.get(child.id) === n.id);
              return (
                <div
                  key={n.id}
                  className={
                    'layer-row ' +
                    (w.selected.includes(n.id) ? 'selected' : '') +
                    (!n.visible ? ' hidden-layer' : '')
                  }
                  style={{ paddingLeft: 10 + n.depth * 14 }}
                  draggable={!n.locked}
                  onDragStart={(e) => e.dataTransfer.setData('text/plain', n.id)}
                  onDragOver={(e) => {
                    if (['frame', 'group'].includes(n.type)) e.preventDefault();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!reparent(w.doc, e.dataTransfer.getData('text/plain'), n.id))
                      w.notify('Choose a frame or group outside this layer.');
                  }}
                >
                  {children ? (
                    <button
                      className="collapse-button"
                      aria-label={(collapsed.has(n.id) ? 'Expand ' : 'Collapse ') + n.name}
                      onClick={() => toggleCollapse(n.id)}
                    >
                      {collapsed.has(n.id) ? <ChevronRight size={11} /> : <ChevronDown size={11} />}
                    </button>
                  ) : (
                    <span className="collapse-spacer" />
                  )}
                  <button
                    className="layer-select"
                    aria-label={'Select ' + n.name}
                    onClick={(e) =>
                      w.select(
                        e.shiftKey
                          ? w.selected.includes(n.id)
                            ? w.selected.filter((id) => id !== n.id)
                            : [...w.selected, n.id]
                          : [n.id],
                      )
                    }
                    onDoubleClick={() => engine.current?.fit(true)}
                  >
                    <Icon size={13} />
                    <span>{n.name}</span>
                  </button>
                  <button
                    className={'layer-action ' + (n.locked ? 'is-set' : '')}
                    aria-label={(n.locked ? 'Unlock ' : 'Lock ') + n.name}
                    onClick={() => patchNode(w.doc, n.id, { locked: !n.locked })}
                  >
                    {n.locked ? <Lock size={11} /> : <Unlock size={11} />}
                  </button>
                  <button
                    className={'layer-action ' + (!n.visible ? 'is-set' : '')}
                    aria-label={(n.visible ? 'Hide ' : 'Show ') + n.name}
                    onClick={() => patchNode(w.doc, n.id, { visible: !n.visible })}
                  >
                    {n.visible ? <Eye size={12} /> : <EyeOff size={12} />}
                  </button>
                </div>
              );
            })}
            {!visibleLayers.length && (
              <div className="empty-layers">{search ? 'No matching layers' : 'No layers yet'}</div>
            )}
          </div>
          <div className="layers-bottom">
            <span className="tiny-logo">f</span>
            <span>
              Room <span className="room-code">{w.room.slice(0, 8)}</span>
            </span>
            <span className="version">v1.0</span>
          </div>
        </aside>
        <div className={'work-surfaces view-' + view}>
          <div
            className="canvas-region"
            onContextMenu={(e) => {
              e.preventDefault();
              setContext({
                x: Math.min(e.clientX, innerWidth - 210),
                y: Math.min(e.clientY, innerHeight - 260),
              });
            }}
          >
            <div
              className="canvas-host"
              ref={host}
              data-testid="vector-canvas"
              aria-label="Vector canvas"
              role="application"
              tabIndex={0}
            />
            {!nodes.length && (
              <div className="canvas-empty">
                <Frame size={30} strokeWidth={1} />
                <h2>
                  {w.provider.status === 'connecting'
                    ? 'Opening your canvas'
                    : 'A little room to think.'}
                </h2>
                {w.provider.status !== 'connecting' && (
                  <button
                    className="button"
                    onClick={() => {
                      w.create('frame', 80, 80, 560, 740);
                      engine.current?.fit();
                    }}
                  >
                    <Plus size={14} />
                    Add a frame
                  </button>
                )}
              </div>
            )}
            <div className="canvas-corner-label">
              <span className="project-dot" />
              {w.name}
              <span>/</span>
              <span>Page 1</span>
            </div>
            <div className="mobile-panel-controls">
              <IconButton
                label="Open layers"
                onClick={() => {
                  setLeftOpen(!leftOpen);
                  setRightOpen(false);
                }}
              >
                <Layers size={18} />
              </IconButton>
              <IconButton
                label="Open properties"
                onClick={() => {
                  setRightOpen(!rightOpen);
                  setLeftOpen(false);
                }}
              >
                <Settings2 size={18} />
              </IconButton>
            </div>
            <div className="tool-dock" role="toolbar" aria-label="Canvas tools">
              {tools.map(({ id, icon: Icon, label }, i) => (
                <div key={id} className={i === 2 ? 'tool-separator' : ''}>
                  <IconButton
                    label={label}
                    active={w.tool === id}
                    aria-pressed={w.tool === id}
                    onClick={() => w.setTool(id)}
                  >
                    <Icon size={19} strokeWidth={1.65} />
                  </IconButton>
                </div>
              ))}
            </div>
            <div className="zoom-controls">
              <IconButton label="Zoom out" onClick={() => engine.current?.zoomTo(w.zoom / 1.2)}>
                <Minus size={14} />
              </IconButton>
              <button
                className="zoom-value"
                title="Reset zoom to 100%"
                onClick={() => engine.current?.zoomTo(1)}
              >
                {Math.round(w.zoom * 100)}%
              </button>
              <IconButton label="Zoom in" onClick={() => engine.current?.zoomTo(w.zoom * 1.2)}>
                <Plus size={14} />
              </IconButton>
              <span />
              <IconButton label="Fit canvas (Shift 1)" onClick={() => engine.current?.fit()}>
                <Maximize size={14} />
              </IconButton>
            </div>
          </div>
          {view !== 'canvas' && (
            <Suspense
              fallback={
                <div className="code-loading">
                  <Code2 size={20} />
                  <span>Opening editor</span>
                </div>
              }
            >
              <CodePanel w={w} />
            </Suspense>
          )}
        </div>
        {agentOpen ? (
          <AgentPanel
            w={w}
            close={() => setAgentOpen(false)}
            openCode={() => setView((current) => (current === 'canvas' ? 'split' : current))}
            openCanvas={() => {
              if (nodes.some((n) => n.id === 'agent:code-structure')) {
                w.select(['agent:code-structure']);
                fitSelection.current = true;
              }
              setView((current) => (current === 'code' ? 'split' : current));
              setFitRequest((value) => value + 1);
            }}
          />
        ) : (
          <Inspector
            w={w}
            open={rightOpen}
            close={() => setRightOpen(false)}
            onExport={() => setExportOpen(true)}
          />
        )}
      </main>
      <footer className="statusbar">
        <div>
          <span className={'status-dot ' + w.provider.status} />
          {w.provider.status === 'live'
            ? 'All together, in real time'
            : w.provider.status === 'connecting'
              ? 'Connecting to workspace'
              : 'Offline / saved on this device'}
        </div>
        <span className="selection-status">
          {w.selected.length ? w.selected.length + ' selected' : 'Nothing selected'}
        </span>
        <div className="status-end">
          <span>{nodes.length} layers</span>
          <span className="status-divider" />
          <span>Forma workspace</span>
        </div>
      </footer>
      {w.toast && (
        <div className="toast" role="status">
          <Check size={15} />
          {w.toast}
        </div>
      )}
      {context && (
        <div className="dropdown context-menu" style={{ left: context.x, top: context.y }}>
          <button disabled={!w.selected.length} onClick={() => w.duplicate()}>
            <Copy size={14} />
            Duplicate<span>Ctrl D</span>
          </button>
          <button disabled={!w.selected.length} onClick={() => w.arrange('front')}>
            <ArrowUpToLine size={14} />
            Bring to front<span>]</span>
          </button>
          <button disabled={!w.selected.length} onClick={() => w.arrange('back')}>
            <ArrowDownToLine size={14} />
            Send to back<span>[</span>
          </button>
          <button disabled={w.selected.length < 2} onClick={() => w.group()}>
            <Group size={14} />
            Group<span>Ctrl G</span>
          </button>
          <div className="menu-rule" />
          <button onClick={() => engine.current?.fit()}>
            <Maximize size={14} />
            Fit canvas
          </button>
          <button disabled={!w.selected.length} onClick={() => w.remove()}>
            <Trash2 size={14} />
            Delete
          </button>
        </div>
      )}
      {share && (
        <Modal title="Share this canvas" onClose={() => setShare(false)}>
          <label className="form-label">
            Your name
            <input
              className="dialog-input"
              aria-label="Your name"
              maxLength={32}
              value={w.provider.awareness.getLocalState()?.user.name ?? ''}
              onChange={(e) => {
                const name = e.target.value;
                localStorage.setItem('forma:name', name);
                w.provider.awareness.setLocalStateField('user', {
                  ...w.provider.awareness.getLocalState()?.user,
                  name,
                });
                w.emit();
              }}
            />
          </label>
          <div className="share-access">
            <Link2 size={18} />
            <div>
              <strong>Anyone with the link</strong>
              <span>Can edit this canvas</span>
            </div>
            <span className="access-badge">Editor</span>
          </div>
          <div className="share-link">
            <input
              aria-label="Canvas link"
              readOnly
              value={location.href}
              onFocus={(e) => e.target.select()}
            />
            <IconButton label="Copy canvas link" onClick={copyLink}>
              {copied ? <Check size={16} /> : <Copy size={16} />}
            </IconButton>
          </div>
          <button className="button dark-button full-width" onClick={copyLink}>
            {copied ? <Check size={15} /> : <Link2 size={15} />}
            {copied ? 'Link copied' : 'Copy link'}
          </button>
        </Modal>
      )}
      {exportOpen && (
        <Modal title="Export artwork" onClose={() => setExportOpen(false)}>
          <div className="export-summary">
            <span className="export-icon">
              <Frame size={25} strokeWidth={1.2} />
            </span>
            <div>
              <strong>{w.name}</strong>
              <span>
                {w.selected.length ? w.selected.length + ' selected layers' : 'All visible layers'}
              </span>
            </div>
          </div>
          <label className="form-label">
            Format
            <select
              className="dialog-input"
              aria-label="Export format"
              value={exportFormat}
              onChange={(e) => setExportFormat(e.target.value)}
            >
              <option value="png">PNG image / 2x</option>
              <option value="svg">SVG vector</option>
            </select>
          </label>
          <button
            className="button dark-button full-width"
            disabled={!nodes.length}
            onClick={doExport}
          >
            <Download size={15} />
            Export {exportFormat.toUpperCase()}
          </button>
        </Modal>
      )}
    </div>
  );
}

export default function App() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  useEffect(() => {
    const url = new URL(location.href);
    let room = url.searchParams.get('room');
    if (!room || !/^[a-zA-Z0-9_-]{1,80}$/.test(room)) {
      room = localStorage.getItem('forma:last-room') || crypto.randomUUID();
      url.searchParams.set('room', room);
      history.replaceState(null, '', url);
    }
    localStorage.setItem('forma:last-room', room);
    const current = new Workspace(room);
    setWorkspace(current);
    return () => current.destroy();
  }, []);
  return workspace ? <Editor workspace={workspace} /> : <div className="boot">forma</div>;
}
