import { useEffect, useRef } from 'react';
import { useSessionStore } from '../store/sessionStore';
import { useCollaborationStore } from '../store/collaborationStore';
import { useEditorStore } from '../store/editorStore';
import { useUserStore } from '../store/userStore';
import api from '../services/api';

interface SyncState {
  lastSync: number;
  pollInterval: NodeJS.Timeout | null;
  heartbeatInterval: NodeJS.Timeout | null;
  userId: string;
  lastRemoteContent: string;
  version: number;
}

export function useRealtimeSync() {
  const { session, updateSessionContent } = useSessionStore();
  const { editorRef } = useEditorStore();
  const { username } = useUserStore();
  const syncStateRef = useRef<SyncState>({
    lastSync: 0,
    pollInterval: null,
    heartbeatInterval: null,
    userId: `user-${Math.random().toString(36).substr(2, 9)}`,
    lastRemoteContent: '',
    version: 0,
  });

  useEffect(() => {
    if (!session) return;

    const userId = syncStateRef.current.userId;
    const sessionId = session.id;

    // Store current username in ref so heartbeat always uses latest
    const usernameRef = { current: username };

    // Join the session and refresh heartbeat periodically
    const heartbeat = async () => {
      try {
        await api.post('/api/realtime', {
          sessionId,
          userId,
          type: 'join',
          username: usernameRef.current,
        }, { params: { sessionId, userId } });
      } catch (error) {
        console.error('Heartbeat failed:', error);
      }
    };

    // Poll for updates every 1 second
    const poll = async () => {
      try {
        const response = await api.get('/api/realtime', {
          params: {
            sessionId,
            userId,
            lastSync: syncStateRef.current.lastSync,
          },
        });

        const { content, collaborators, updates, version } = response.data;
        // Track authoritative version and content from server
        if (typeof version === 'number') {
          syncStateRef.current.version = version;
        }
        if (typeof content === 'string') {
          // Initialize lastRemoteContent from server if empty
          if (syncStateRef.current.lastRemoteContent === '') {
            syncStateRef.current.lastRemoteContent = content;
          }
        }
        
        // Update collaborators
        if (collaborators && Array.isArray(collaborators)) {
          useCollaborationStore.getState().clearCollaborators();
          collaborators.forEach((collab: any) => {
            if (collab.id !== userId) { // Don't show self
              useCollaborationStore.getState().addCollaborator({
                id: collab.id,
                username: collab.username || `User ${collab.id.substring(5, 14)}`,
                color: collab.color || '#' + Math.floor(Math.random()*16777215).toString(16),
                cursor: { line: 0, column: 0 },
                isActive: true,
                lastSeen: Date.now(),
              });
            }
          });
        }

        // Apply remote operations instead of full-content replacement
        if (updates && Array.isArray(updates) && updates.length > 0) {
          let latestTs = syncStateRef.current.lastSync;
          updates.forEach((update: any) => {
            if (update.type === 'operation' && update.userId !== userId && update.operation) {
              // Apply operation to current content
              const newContent = applyOperation(syncStateRef.current.lastRemoteContent, update.operation);
              if (newContent !== syncStateRef.current.lastRemoteContent) {
                syncStateRef.current.lastRemoteContent = newContent;
                updateSessionContent(newContent);
                if (editorRef) {
                  const currentPosition = editorRef.getPosition();
                  editorRef.setValue(newContent);
                  if (currentPosition) {
                    editorRef.setPosition(currentPosition);
                  }
                }
                useCollaborationStore.getState().recordChange();
              }
            }
            if (typeof update.timestamp === 'number') {
              latestTs = Math.max(latestTs, update.timestamp);
            }
          });
          syncStateRef.current.lastSync = latestTs;
        }
      } catch (error) {
        console.error('Realtime sync error:', error);
      }
    };

    // Start polling
    syncStateRef.current.pollInterval = setInterval(poll, 1000);
    syncStateRef.current.heartbeatInterval = setInterval(heartbeat, 5000);
    // Immediate kick-off
    heartbeat();
    poll();

    return () => {
      if (syncStateRef.current.pollInterval) {
        clearInterval(syncStateRef.current.pollInterval);
      }
      if (syncStateRef.current.heartbeatInterval) {
        clearInterval(syncStateRef.current.heartbeatInterval);
      }
    };
  }, [session, updateSessionContent, editorRef, username]);

// Send local edits to backend as operations
  const sendEdit = async (newContent: string) => {
    if (!session || !editorRef) return;

    const userId = syncStateRef.current.userId;
    const oldContent = syncStateRef.current.lastRemoteContent;
    
    // Compute the diff to create an operation
    const operation = computeOperation(oldContent, newContent);
    if (!operation) return; // No change
    operation.baseVersion = syncStateRef.current.version;
    
    try {
      // Send operation instead of full content
      await api.post('/api/realtime', {
        sessionId: session.id,
        userId,
        type: 'operation',
        operation,
        timestamp: Date.now(),
      }, {
        params: {
          sessionId: session.id,
          userId,
        },
      });
      // Update local tracking
      syncStateRef.current.lastRemoteContent = newContent;
      syncStateRef.current.version = (syncStateRef.current.version || 0) + 1;
      // Touch heartbeat on edit
      try { await api.post('/api/realtime', { sessionId: session.id, userId, type: 'join', username }, { params: { sessionId: session.id, userId } }); } catch {}
    } catch (error: unknown) {
      // Handle version conflicts from server (Axios error shape)
      const axiosError = error as { response?: { status?: number; data?: any } };
      if (axiosError?.response?.status === 409) {
        const data = axiosError.response?.data;
        if (data && typeof data.content === 'string' && typeof data.version === 'number') {
          // Update to latest server state, recompute op against it on next change
          syncStateRef.current.lastRemoteContent = data.content;
          syncStateRef.current.version = data.version;
          if (editorRef) {
            const currentPosition = editorRef.getPosition();
            editorRef.setValue(data.content);
            if (currentPosition) editorRef.setPosition(currentPosition);
          }
        }
      } else {
        console.error('Failed to send edit:', error);
      }
    }
  };

  return { sendEdit };
}

// Compute minimal operation (insert or delete) from old to new content
function computeOperation(oldContent: string, newContent: string): any {
  if (oldContent === newContent) return null;

  // Find first difference
  let startPos = 0;
  while (startPos < oldContent.length && startPos < newContent.length && oldContent[startPos] === newContent[startPos]) {
    startPos++;
  }

  // Find last difference
  let oldEndPos = oldContent.length;
  let newEndPos = newContent.length;
  while (oldEndPos > startPos && newEndPos > startPos && oldContent[oldEndPos - 1] === newContent[newEndPos - 1]) {
    oldEndPos--;
    newEndPos--;
  }

  const deletedLength = oldEndPos - startPos;
  const insertedText = newContent.slice(startPos, newEndPos);

  // Convert absolute position to line/column
  const lines = oldContent.slice(0, startPos).split('\n');
  const line = lines.length - 1;
  const column = lines[lines.length - 1].length;

  if (deletedLength === 0 && insertedText.length > 0) {
    // Insert only
    return { type: 'insert', position: { line, column }, content: insertedText };
  } else if (insertedText.length === 0 && deletedLength > 0) {
    // Delete only
    return { type: 'delete', position: { line, column }, length: deletedLength };
  } else if (deletedLength > 0 && insertedText.length > 0) {
    // Replace
    return { type: 'replace', position: { line, column }, oldLength: deletedLength, content: insertedText };
  }
  return null;
}
// Apply an operation to content
function applyOperation(content: string, operation: any): string {
  const { type, position, content: opContent, length, oldLength } = operation;
  
  // Convert line/column to absolute position
  const lines = content.split('\n');
  let absolutePos = 0;
  for (let i = 0; i < position.line; i++) {
    absolutePos += (lines[i]?.length || 0) + 1; // +1 for newline
  }
  absolutePos += position.column;

  if (type === 'insert') {
    return content.slice(0, absolutePos) + opContent + content.slice(absolutePos);
  } else if (type === 'delete') {
    return content.slice(0, absolutePos) + content.slice(absolutePos + length);
  } else if (type === 'replace') {
    return content.slice(0, absolutePos) + opContent + content.slice(absolutePos + oldLength);
  }
  return content;
}