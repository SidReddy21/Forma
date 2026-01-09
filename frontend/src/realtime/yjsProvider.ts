import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import * as monaco from 'monaco-editor';
import { useCollaborationStore } from '../store/collaborationStore';

export interface YjsHandle {
  doc: Y.Doc;
  provider: any;
  text: Y.Text;
  destroy: () => void;
}

export function initYjsMonaco(editor: any, sessionId: string, username: string): YjsHandle {
  const doc = new Y.Doc();
  const roomId = `codemeld-${sessionId}`;
  // Use public demo WebSocket server; replace with your own for production
  const provider = new WebsocketProvider('wss://demos.yjs.dev', roomId, doc);

  const text = doc.getText('monaco');
  const model: monaco.editor.ITextModel = editor.getModel();

  // Set initial content into CRDT if empty
  if (text.length === 0 && typeof model?.getValue === 'function') {
    text.insert(0, model.getValue());
  }

  const awareness = provider.awareness;
  awareness.setLocalStateField('user', {
    name: username,
    color: '#3b82f6',
  });

  // Custom binding between Monaco and Yjs
  let applyingRemote = false;
  const disposable = model.onDidChangeContent((e) => {
    if (applyingRemote) return;
    doc.transact(() => {
      // Apply changes from last to first to preserve indices
      for (let i = e.changes.length - 1; i >= 0; i--) {
        const change = e.changes[i];
        const start = { lineNumber: change.range.startLineNumber, column: change.range.startColumn };
        const index = model.getOffsetAt(start);
        const delLen = change.rangeLength || 0;
        if (delLen > 0) {
          text.delete(index, delLen);
        }
        if (change.text && change.text.length > 0) {
          text.insert(index, change.text);
        }
      }
    }, 'monaco');
  });

  text.observe((event) => {
    if (event.transaction && event.transaction.origin === 'monaco') return; // ignore local echoes
    applyingRemote = true;
    try {
      let index = 0;
      event.delta.forEach((d) => {
        if (d.retain) {
          index += d.retain;
        }
        if (d.delete) {
          const startPos = model.getPositionAt(index);
          const endPos = model.getPositionAt(index + d.delete);
          const range = new monaco.Range(
            startPos.lineNumber,
            startPos.column,
            endPos.lineNumber,
            endPos.column
          );
          editor.executeEdits('yjs', [{ range, text: '' }]);
        }
        if (d.insert) {
          const startPos = model.getPositionAt(index);
          const range = new monaco.Range(
            startPos.lineNumber,
            startPos.column,
            startPos.lineNumber,
            startPos.column
          );
          editor.executeEdits('yjs', [{ range, text: d.insert as string }]);
          index += (d.insert as string).length;
        }
      });
    } finally {
      applyingRemote = false;
    }
  });

  // Update collaborator store on awareness updates
  const updateCollaborators = () => {
    const states = Array.from(awareness.getStates().values());
    const collabs = states
      .map((s: any, idx: number) => ({
        id: `peer-${idx}`,
        username: s?.user?.name || 'Unknown',
        color: s?.user?.color || '#8b5cf6',
        cursor: { line: 0, column: 0 },
        isActive: true,
        lastSeen: Date.now(),
      }));
    // Replace current collaborators list for clarity
    try {
      useCollaborationStore.getState().setCollaborators(collabs);
    } catch {}
  };

  awareness.on('update', updateCollaborators);
  updateCollaborators();

  const destroy = () => {
    awareness.off('update', updateCollaborators);
    disposable.dispose();
    provider.destroy();
    doc.destroy();
  };

  return { doc, provider, text, destroy };
}
