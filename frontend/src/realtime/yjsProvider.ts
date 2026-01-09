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

export function initYjsMonaco(editor: any, sessionId: string, username: string, userId: string): YjsHandle {
  const doc = new Y.Doc();
  const roomId = `codemeld-${sessionId}`;
  
  console.log(`[Yjs] Initializing CRDT with sessionId: ${sessionId}, roomId: ${roomId}, userId: ${userId}, username: ${username}`);
  
  // Use IndexedDB for local persistence (enables sync across tabs in same browser)
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

  // Create awareness for collaborative state using doc.awareness
  const awareness = doc.awareness;
  if (awareness) {
    console.log(`[Yjs] Awareness initialized for room "${roomId}"`);
    awareness.setLocalState({
      user: {
        name: username,
        color: '#3b82f6',
      },
      cursor: { line: 0, column: 0 },
    });
    console.log(`[Yjs] Set local user state: "${username}"`);
  }
  
  // Aggressive polling: sync every 2 seconds for responsive collaboration
  let lastSyncTime = Date.now();
  let lastSyncedContent = text.toString();
  let applyingRemote = false;
  
  const httpSyncInterval = setInterval(async () => {
    try {
      const now = Date.now();
      const currentContent = doc.getText('monaco').toString();
      
      // Only sync if content has changed
      if (currentContent !== lastSyncedContent) {
        console.log(`[Yjs] HTTP sync triggered - content changed, size: ${currentContent.length}`);
        
        // Send to server with full CRDT state
        const yState = Y.encodeStateAsUpdate(doc);
        await api.post(`/api/realtime?sessionId=${sessionId}&userId=${userId}`, {
          type: 'sync',
          content: currentContent,
          yState: Array.from(yState),
          timestamp: now,
          username,
        });
        
        lastSyncedContent = currentContent;
        lastSyncTime = now;
        console.log(`[Yjs] HTTP sync completed - sent ${currentContent.length} chars`);
      }
      
      // Also fetch remote updates
      try {
        const response = await api.get(
          `/api/realtime?sessionId=${sessionId}&userId=${userId}&lastSync=${lastSyncTime}`
        );
        
        if (response.data && response.data.updates && response.data.updates.length > 0) {
          console.log(`[Yjs] Received ${response.data.updates.length} remote updates`);
          response.data.updates.forEach((update: any) => {
            try {
              const yUpdate = new Uint8Array(update.yState);
              Y.applyUpdate(doc, yUpdate, 'remote');
              console.log(`[Yjs] Applied remote update`);
            } catch (err) {
              console.error(`[Yjs] Error applying remote update:`, err);
            }
          });
        }
      } catch (err) {
        console.error(`[Yjs] Error fetching remote updates:`, err);
      }
    } catch (err) {
      console.error(`[Yjs] HTTP sync error for room "${roomId}":`, err);
    }
  }, 2000); // Every 2 seconds for responsiveness
  
  // On page unload, do one final sync
  const beforeUnloadHandler = async () => {
    clearInterval(httpSyncInterval);
    try {
      const currentContent = doc.getText('monaco').toString();
      const yState = Y.encodeStateAsUpdate(doc);
      await api.post(`/api/realtime?sessionId=${sessionId}&userId=${userId}`, {
        type: 'sync',
        content: currentContent,
        yState: Array.from(yState),
        timestamp: Date.now(),
        username,
      });
      console.log(`[Yjs] Final sync on unload for room "${roomId}"`);
    } catch (err) {
      console.error(`[Yjs] Final sync error on unload:`, err);
    }
  };
  window.addEventListener('beforeunload', beforeUnloadHandler);

  // Custom binding between Monaco and Yjs
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
    if (!awareness) return;
    const states = Array.from(awareness.getStates().values());
    console.log(`[Yjs] Awareness states:`, states.length, states);
    const collabs = states
      .map((s: any, idx: number) => ({
        id: `peer-${idx}`,
        username: s?.user?.name || 'Unknown',
        color: s?.user?.color || '#8b5cf6',
        cursor: s?.cursor || { line: 0, column: 0 },
        isActive: true,
        lastSeen: Date.now(),
      }));
    console.log(`[Yjs] Updating collaborators:`, collabs);
    try {
      useCollaborationStore.getState().setCollaborators(collabs);
    } catch (err) {
      console.error(`[Yjs] Error updating collaborators:`, err);
    }
  };

  // Listen for awareness updates
  if (awareness) {
    try {
      awareness.on('update', updateCollaborators);
      console.log(`[Yjs] Awareness listener attached for room "${roomId}"`);
      updateCollaborators(); // Initial call to populate current state
    } catch (err) {
      console.error(`[Yjs] Error attaching awareness listener:`, err);
    }
  } else {
    console.warn(`[Yjs] Awareness not available, skipping listener setup`);
  }

  const destroy = () => {
    clearInterval(httpSyncInterval);
    window.removeEventListener('beforeunload', beforeUnloadHandler);
    if (awareness) {
      awareness.off('update', updateCollaborators);
    }
    disposable.dispose();
    persistence?.destroy();
    doc.destroy();
  };

  return { doc, persistence, text, destroy };
}
