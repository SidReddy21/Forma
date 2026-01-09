import { useEffect, useRef } from 'react';
import { useSessionStore } from '../store/sessionStore';
import { useCollaborationStore } from '../store/collaborationStore';
import { useEditorStore } from '../store/editorStore';
import api from '../services/api';

interface SyncState {
  lastSync: number;
  pollInterval: NodeJS.Timeout | null;
  userId: string;
}

export function useRealtimeSync() {
  const { session, updateSessionContent } = useSessionStore();
  const { editorRef } = useEditorStore();
  const syncStateRef = useRef<SyncState>({
    lastSync: Date.now(),
    pollInterval: null,
    userId: `user-${Math.random().toString(36).substr(2, 9)}`,
  });

  useEffect(() => {
    if (!session) return;

    const userId = syncStateRef.current.userId;
    const sessionId = session.id;

    // Join the session as a collaborator
    const joinSession = async () => {
      try {
        console.log('Joining session:', sessionId, 'userId:', userId);
        await api.post('/api/realtime', {
          sessionId,
          userId,
          type: 'join',
          username: `User ${userId.substring(5, 14)}`,
          color: '#' + Math.floor(Math.random()*16777215).toString(16),
        }, {
          params: {
            sessionId,
            userId,
          },
        });
        console.log('Joined session successfully');
      } catch (error) {
        console.error('Failed to join session:', error);
      }
    };

    // Join immediately
    joinSession();

    // Poll for updates every 500ms
    const poll = async () => {
      try {
        const response = await api.get('/api/realtime', {
          params: {
            sessionId,
            userId,
            lastSync: syncStateRef.current.lastSync,
          },
        });

        const { content, collaborators, updates, timestamp } = response.data;
        
        console.log('Poll response:', { 
          hasUpdates: updates?.length > 0, 
          updateCount: updates?.length,
          timestamp,
          lastSync: syncStateRef.current.lastSync
        });

        // Update collaborators list using store method directly
        if (collaborators && Array.isArray(collaborators) && collaborators.length > 0) {
          collaborators.forEach((collab: any) => {
            useCollaborationStore.getState().addCollaborator({
              id: collab.id,
              username: collab.username,
              color: collab.color,
              cursor: collab.cursor || { line: 0, column: 0 },
              isActive: collab.isActive !== false,
              lastSeen: Date.now(),
            });
          });
        }

        // Apply remote updates
        if (updates && Array.isArray(updates) && updates.length > 0) {
          console.log('Processing updates:', updates);
          updates.forEach((update: any) => {
            console.log('Update:', update.type, 'from:', update.userId, 'me:', userId);
            if (update.type === 'edit' && update.userId !== userId) {
              // Update content if it changed and came from another user
              if (update.newContent) {
                console.log('Applying remote edit from', update.userId, 'content length:', update.newContent.length);
                updateSessionContent(update.newContent);
                // Update Monaco Editor directly
                if (editorRef) {
                  const currentPosition = editorRef.getPosition();
                  editorRef.setValue(update.newContent);
                  if (currentPosition) {
                    editorRef.setPosition(currentPosition);
                  }
                } else {
                  console.warn('No editor ref available');
                }
              }
              // Record the change in stats
              useCollaborationStore.getState().recordChange();
            }
          });
        }

        syncStateRef.current.lastSync = timestamp;
      } catch (error) {
        console.error('Realtime sync error:', error);
      }
    };

    // Start polling
    syncStateRef.current.pollInterval = setInterval(poll, 500);

    // Poll once immediately
    poll();

    return () => {
      if (syncStateRef.current.pollInterval) {
        clearInterval(syncStateRef.current.pollInterval);
      }
    };
  }, [session, updateSessionContent, editorRef]);

  // Send local edits to backend
  const sendEdit = async (newContent: string) => {
    if (!session) return;

    const userId = syncStateRef.current.userId;
    console.log('Sending edit:', { userId, contentLength: newContent.length });
    
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
      console.log('Edit sent successfully');
    } catch (error) {
      console.error('Failed to send edit:', error);
    }
  };

  return { sendEdit };
}
