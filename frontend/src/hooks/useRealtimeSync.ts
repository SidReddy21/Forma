import { useEffect, useRef } from 'react';
import { useSessionStore } from '../store/sessionStore';
import { useCollaborationStore } from '../store/collaborationStore';
import { useEditorStore } from '../store/editorStore';
import api from '../services/api';

interface SyncState {
  lastSync: number;
  pollInterval: NodeJS.Timeout | null;
  heartbeatInterval: NodeJS.Timeout | null;
  userId: string;
}

export function useRealtimeSync() {
  const { session, updateSessionContent } = useSessionStore();
  const { editorRef } = useEditorStore();
  const syncStateRef = useRef<SyncState>({
    lastSync: 0,
    pollInterval: null,
    heartbeatInterval: null,
    userId: `user-${Math.random().toString(36).substr(2, 9)}`,
  });

  useEffect(() => {
    if (!session) return;

    const userId = syncStateRef.current.userId;
    const sessionId = session.id;

    // Join the session and refresh heartbeat periodically
    const heartbeat = async () => {
      try {
        await api.post('/api/realtime', {
          sessionId,
          userId,
          type: 'join',
          username: `User ${userId.substring(5, 14)}`,
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

        const { content, collaborators, updates } = response.data;
        
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

        // Apply remote updates
        if (updates && Array.isArray(updates) && updates.length > 0) {
          let latestTs = syncStateRef.current.lastSync;
          updates.forEach((update: any) => {
            if (update.type === 'edit' && update.userId !== userId && update.newContent) {
              updateSessionContent(update.newContent);
              if (editorRef) {
                const currentPosition = editorRef.getPosition();
                editorRef.setValue(update.newContent);
                if (currentPosition) {
                  editorRef.setPosition(currentPosition);
                }
              }
              useCollaborationStore.getState().recordChange();
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
  }, [session, updateSessionContent, editorRef]);

  // Send local edits to backend
  const sendEdit = async (newContent: string) => {
    if (!session) return;

    const userId = syncStateRef.current.userId;
    
    try {
      await api.post('/api/realtime', {
        sessionId: session.id,
        userId,
        type: 'edit',
        newContent,
        timestamp: Date.now(),
      }, {
        params: {
          sessionId: session.id,
          userId,
        },
      });
      // Touch heartbeat on edit
      try { await api.post('/api/realtime', { sessionId: session.id, userId, type: 'join' }, { params: { sessionId: session.id, userId } }); } catch {}
    } catch (error) {
      console.error('Failed to send edit:', error);
    }
  };

  return { sendEdit };
}
