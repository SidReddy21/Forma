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
  const roomId = `vortex-code-${sessionId}`;
  
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

  // Do NOT seed Yjs from the editor model at init.
  // Always fetch authoritative server content to avoid duplication.

  // Awareness (presence) is handled via backend polling; skip y-protocol awareness here
  
  // Aggressive polling: sync every 2 seconds for responsive collaboration
  let lastSyncTime = Date.now();
  let lastSyncedContent = text.toString();
  let lastSyncedUsername = username;
  let applyingRemote = false;
  let initialSyncDone = false;
  
  // Fetch initial server state to get authoritative content and collaborators
  const fetchInitialState = async () => {
    try {
      console.log(`[Yjs] Fetching initial server state for session "${sessionId}"`);
      const response = await api.get(
        `/api/realtime?sessionId=${sessionId}&userId=${userId}&lastSync=0`
      );
      
      if (response.data) {
        // Apply authoritative content from server to Yjs doc
        if (response.data.content && typeof response.data.content === 'string') {
          // Clear local doc and insert server content
          if (text.length > 0) {
            text.delete(0, text.length);
          }
          if (response.data.content.length > 0) {
            text.insert(0, response.data.content);
            console.log(`[Yjs] Applied initial server content: ${response.data.content.length} chars`);
            lastSyncedContent = response.data.content;
            
            // Do NOT set editor value directly here.
            // Let Yjs -> Monaco binding update the editor to avoid duplication.
          }
        }
        
        // Update collaborators from initial server response
        if (response.data.collaborators && Array.isArray(response.data.collaborators)) {
          const remoteCollabs = response.data.collaborators
            .filter((c: any) => c.id !== userId)
            .map((c: any) => ({
              id: c.id,
              username: c.username || 'Unknown',
              color: c.color || '#8b5cf6',
              cursor: c.cursor || { line: 0, column: 0 },
              isActive: c.isActive,
              lastSeen: c.lastSeen || Date.now(),
            }));
          console.log(`[Yjs] Initial collaborators: ${remoteCollabs.length} remote users`);
          useCollaborationStore.getState().setCollaborators(remoteCollabs);
        }
      }
      
      initialSyncDone = true;
    } catch (err) {
      console.error(`[Yjs] Initial state fetch error:`, err);
      initialSyncDone = true; // Continue anyway
    }
  };
  
  // Fetch initial state immediately
  fetchInitialState();

  // Explicitly join the session to register presence before syncing
  const joinSession = async () => {
    // Wait for initial state to be fetched to avoid race conditions
    let waitCount = 0;
    while (!initialSyncDone && waitCount < 50) {
      await new Promise(resolve => setTimeout(resolve, 100));
      waitCount++;
    }
    try {
      const currentUsername = useUserStore.getState().username;
      console.log(`[Yjs] Joining session on server as "${currentUsername}"`);
      const joinResp = await api.post(`/api/realtime?sessionId=${sessionId}&userId=${userId}`, {
        type: 'join',
        userId,
        username: currentUsername,
        color: '#3b82f6',
      });
      // If server returned collaborators, update local store (authoritative list)
      const collabs = joinResp?.data?.collaborators;
      if (Array.isArray(collabs)) {
        const remoteCollabs = collabs
          .filter((c: any) => c && c.id !== userId)
          .map((c: any) => ({
            id: c.id,
            username: c.username || 'Unknown',
            color: c.color || '#8b5cf6',
            cursor: c.cursor || { line: 0, column: 0 },
            isActive: c.isActive,
            lastSeen: c.lastSeen || Date.now(),
          }));
        console.log(`[Yjs] Join updated collaborators: ${remoteCollabs.length} remote users`);
        useCollaborationStore.getState().setCollaborators(remoteCollabs);
      }
    } catch (err) {
      console.error('[Yjs] Join session error:', err);
    }
  };
  
  // Then register user with initial sync after state is loaded
  const registerUser = async () => {
    // Wait for initial state to be fetched
    let waitCount = 0;
    while (!initialSyncDone && waitCount < 50) {
      await new Promise(resolve => setTimeout(resolve, 100));
      waitCount++;
    }
    
    try {
      const yState = Y.encodeStateAsUpdate(doc);
      const currentUsername = useUserStore.getState().username;
      console.log(`[Yjs] Registering user "${currentUsername}" with server`);
      await api.post(`/api/realtime?sessionId=${sessionId}&userId=${userId}`, {
        type: 'sync',
        content: text.toString(),
        yState: Array.from(yState),
        awarenessState: [],
        timestamp: Date.now(),
        username: currentUsername,
      });
      lastSyncedUsername = currentUsername;
      console.log(`[Yjs] User registration completed`);
    } catch (err) {
      console.error(`[Yjs] User registration error:`, err);
    }
  };
  
  // Ensure presence is registered early so others can see this user
  joinSession();
  registerUser();
  
  // Function to trigger immediate sync (used when username changes)
  const triggerImmediateSync = async () => {
    try {
      const now = Date.now();
      const currentContent = doc.getText('monaco').toString();
      const currentUsername = useUserStore.getState().username;
      
      console.log(`[Yjs] Immediate sync triggered - username: "${currentUsername}"`);
      
      const yState = Y.encodeStateAsUpdate(doc);
      await api.post(`/api/realtime?sessionId=${sessionId}&userId=${userId}`, {
        type: 'sync',
        content: currentContent,
        yState: Array.from(yState),
        awarenessState: [],
        timestamp: now,
        username: currentUsername,
      });
      
      lastSyncedContent = currentContent;
      lastSyncedUsername = currentUsername;
      lastSyncTime = now;
      console.log(`[Yjs] Immediate sync completed - username: "${currentUsername}"`);
    } catch (err) {
      console.error('[Yjs] Immediate sync error:', err);
    }
  };

  // Store the triggerImmediateSync function globally for access from other modules
  (window as any).__yjsTriggerSync = triggerImmediateSync;
  
  const httpSyncInterval = setInterval(async () => {
    try {
      const now = Date.now();
      const currentContent = doc.getText('monaco').toString();
      const currentUsername = useUserStore.getState().username; // Always get fresh username
      
      // Always sync awareness state for presence
      const awarenessUpdate: any[] = [];
      
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
            console.log(`[Yjs] Backend returned ${response.data.collaborators.length} total collaborators, local userId: "${userId}"`);
            // Backend now returns ALL users including current user
            // Frontend filters out self to show only remote collaborators
            const remoteCollabs = response.data.collaborators
              .filter((c: any) => {
                const isLocal = c.id === userId;
                if (isLocal) {
                  console.log(`[Yjs] Filtering out local user: ${c.username} (${c.id})`);
                }
                return !isLocal; // Exclude local user from collaborators list
              })
              .map((c: any) => ({
                id: c.id,
                username: c.username || 'Unknown',
                color: c.color || '#8b5cf6',
                cursor: c.cursor || { line: 0, column: 0 },
                isActive: c.isActive,
                lastSeen: c.lastSeen || Date.now(),
              }));
            
            console.log(`[Yjs] Updating collaborators store with ${remoteCollabs.length} remote users`);
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

  // Presence updates handled via backend sync loop; no local awareness listeners

  const destroy = () => {
    clearInterval(httpSyncInterval);
    window.removeEventListener('beforeunload', beforeUnloadHandler);
    // No awareness listeners to clean up
    disposable.dispose();
    persistence?.destroy();
    doc.destroy();
  };

  return { doc, persistence, text, destroy };
}
