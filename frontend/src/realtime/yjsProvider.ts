import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import * as monaco from 'monaco-editor';
import { useCollaborationStore } from '../store/collaborationStore';
import { useUserStore } from '../store/userStore';
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
  let lastSyncedUsername = username;
  let applyingRemote = false;
  
  // Initial sync to register user immediately
  (async () => {
    try {
      const yState = Y.encodeStateAsUpdate(doc);
      const currentUsername = useUserStore.getState().username;
      await api.post(`/api/realtime?sessionId=${sessionId}&userId=${userId}`, {
        type: 'sync',
        content: text.toString(),
        yState: Array.from(yState),
        awarenessState: [],
        timestamp: Date.now(),
        username: currentUsername,
      });
      lastSyncedUsername = currentUsername;
      console.log(`[Yjs] Initial sync completed for user "${currentUsername}"`);
    } catch (err) {
      console.error(`[Yjs] Initial sync error:`, err);
    }
  })();
  
  const httpSyncInterval = setInterval(async () => {
    try {
      const now = Date.now();
      const currentContent = doc.getText('monaco').toString();
      const currentUsername = useUserStore.getState().username; // Always get fresh username
      
      // Always sync awareness state for presence
      const awarenessUpdate = awareness ? Array.from(awareness.getLocalState() ? [awareness.getLocalState()] : []) : [];
      
      // Sync if content changed OR periodically for awareness OR username changed
      const shouldSync = currentContent !== lastSyncedContent || now - lastSyncTime > 10000 || currentUsername !== lastSyncedUsername;
      
      if (shouldSync) {
        const reason = currentContent !== lastSyncedContent ? 'content' : 
                       currentUsername !== lastSyncedUsername ? 'username' : 'periodic';
        console.log(`[Yjs] HTTP sync triggered - reason: ${reason}, username: "${currentUsername}"`);
        
        // Send to server with full CRDT state and awareness
        const yState = Y.encodeStateAsUpdate(doc);
        await api.post(`/api/realtime?sessionId=${sessionId}&userId=${userId}`, {
          type: 'sync',
          content: currentContent,
          yState: Array.from(yState),
          awarenessState: awarenessUpdate,
          timestamp: now,
          username: currentUsername,
        });
        
        lastSyncedContent = currentContent;
        lastSyncedUsername = currentUsername;
        lastSyncTime = now;
        console.log(`[Yjs] HTTP sync completed - sent ${currentContent.length} chars, username: "${currentUsername}"`);
      }
      
      // Also fetch remote updates and collaborator list
      try {
        const response = await api.get(
          `/api/realtime?sessionId=${sessionId}&userId=${userId}&lastSync=${lastSyncTime}`
        );
        
        if (response.data) {
          // Update collaborators from backend (this is the authoritative source)
          if (response.data.collaborators && Array.isArray(response.data.collaborators)) {
            const remoteCollabs = response.data.collaborators
              .filter((c: any) => c.id !== userId) // Exclude local user
              .map((c: any) => ({
                id: c.id,
                username: c.username || 'Unknown',
                color: c.color || '#8b5cf6',
                cursor: c.cursor || { line: 0, column: 0 },
                isActive: c.isActive,
                lastSeen: c.lastSeen || Date.now(),
              }));
            
            console.log(`[Yjs] Updating collaborators from backend: ${remoteCollabs.length} remote users`);
            useCollaborationStore.getState().setCollaborators(remoteCollabs);
          }
          
          // Apply Yjs updates if any
          if (response.data.updates && response.data.updates.length > 0) {
            console.log(`[Yjs] Received ${response.data.updates.length} remote updates`);
            response.data.updates.forEach((update: any) => {
              try {
                const yUpdate = new Uint8Array(update.yState);
                Y.applyUpdate(doc, yUpdate, 'remote');
                console.log(`[Yjs] Applied remote update from ${update.username}`);
              } catch (err) {
                console.error(`[Yjs] Error applying remote update:`, err);
              }
            });
          }
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

  // Update collaborator store - NOTE: this is now primarily done via backend sync
  // The awareness system is kept for potential future use with WebSocket sync
  const updateCollaborators = () => {
    // Collaborators are now updated directly from backend in the HTTP sync loop
    // This function is kept for potential local awareness updates
    console.log(`[Yjs] Local awareness update triggered (now using backend collaborator list)`);
  };

  // Listen for awareness updates (mostly for local state changes)
  if (awareness) {
    try {
      awareness.on('update', updateCollaborators);
      console.log(`[Yjs] Awareness listener attached for room "${roomId}"`);
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
