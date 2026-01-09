import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import * as monaco from 'monaco-editor';
import { useCollaborationStore } from '../store/collaborationStore';
import api from '../services/api';

export interface YjsHandle {
  doc: Y.Doc;
  persistence: IndexeddbPersistence | null;
  text: Y.Text;
  destroy: () => void;
}

export function initYjsMonaco(editor: any, sessionId: string, username: string): YjsHandle {
  const doc = new Y.Doc();
  const roomId = `codemeld-${sessionId}`;
  
  console.log(`[Yjs] Initializing CRDT with sessionId: ${sessionId}, roomId: ${roomId}`);
  
  // Use IndexedDB for local persistence (enables sync across tabs in same browser)
  // Store key uses sessionId to isolate sessions
  const persistence = new IndexeddbPersistence(roomId, doc);
  
  persistence.whenSynced.then(() => {
    console.log(`[Yjs] IndexedDB persistence ready for room "${roomId}"`);
  }).catch((err) => {
    console.error(`[Yjs] IndexedDB persistence error for room "${roomId}":`, err);
  });

  const text = doc.getText('monaco');
  const model: monaco.editor.ITextModel = editor.getModel();

  // Set initial content into CRDT if empty
  if (text.length === 0 && typeof model?.getValue === 'function') {
    const content = model.getValue();
    if (content.length > 0) {
      text.insert(0, content);
    }
  }

  // Create awareness for collaborative state (provided by IndexeddbPersistence)
  const awareness = persistence.awareness;
  awareness.setLocalStateField('user', {
    name: username,
    color: '#3b82f6',
  });
  
  // HTTP-based sync: every 30 seconds, sync local CRDT state to server
  let lastSyncTime = Date.now();
  const httpSyncInterval = setInterval(async () => {
    try {
      const now = Date.now();
      console.log(`[Yjs] HTTP sync triggered for room "${roomId}" (last sync: ${(now - lastSyncTime) / 1000}s ago)`);
      
      // Get current content from CRDT
      const currentContent = doc.getText('monaco').toString();
      
      // Send to server
      await api.put(`/api/sessions/${sessionId}`, {
        content: currentContent,
        updatedAt: now,
      });
      
      lastSyncTime = now;
      console.log(`[Yjs] HTTP sync completed for room "${roomId}"`);
    } catch (err) {
      console.error(`[Yjs] HTTP sync error for room "${roomId}":`, err);
    }
  }, 30000); // Every 30 seconds
  
  // On page unload, do one final sync
  const beforeUnloadHandler = async () => {
    clearInterval(httpSyncInterval);
    try {
      const currentContent = doc.getText('monaco').toString();
      await api.put(`/api/sessions/${sessionId}`, {
        content: currentContent,
        updatedAt: Date.now(),
      });
      console.log(`[Yjs] Final sync on unload for room "${roomId}"`);
    } catch (err) {
      console.error(`[Yjs] Final sync error on unload:`, err);
    }
  };
  window.addEventListener('beforeunload', beforeUnloadHandler);

  // Custom binding between Monaco and Yjs
  let applyingRemote = false;
  const disposable = model.onDidChangeContent((e) => {
    if (applyingRemote) return;
    try {
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
    } catch (err) {
      console.error('Error applying local change:', err);
    }
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
          try {
            const startPos = model.getPositionAt(index);
            const endPos = model.getPositionAt(Math.min(index + d.delete, model.getLineCount() * 1000));
            const range = new monaco.Range(
              startPos.lineNumber,
              startPos.column,
              endPos.lineNumber,
              endPos.column
            );
            editor.executeEdits('yjs', [{ range, text: '' }]);
          } catch (err) {
            console.error('Error applying delete:', err);
          }
        }
        if (d.insert) {
          try {
            const startPos = model.getPositionAt(index);
            const range = new monaco.Range(
              startPos.lineNumber,
              startPos.column,
              startPos.lineNumber,
              startPos.column
            );
            editor.executeEdits('yjs', [{ range, text: d.insert as string }]);
            index += (d.insert as string).length;
          } catch (err) {
            console.error('Error applying insert:', err);
          }
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
    clearInterval(httpSyncInterval);
    window.removeEventListener('beforeunload', beforeUnloadHandler);
    awareness.off('update', updateCollaborators);
    disposable.dispose();
    persistence?.destroy();
    doc.destroy();
  };

  return { doc, persistence, text, destroy };
}
