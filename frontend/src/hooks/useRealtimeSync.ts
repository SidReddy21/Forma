import { useEffect, useRef } from 'react';
import { useSessionStore } from '../store/sessionStore';
import { useUserStore } from '../store/userStore';
import api from '../services/api';

interface SyncState {
  userId: string;
}

/**
 * Legacy hook - polling disabled since Yjs now handles all realtime sync.
 * Kept only for optional session join notification to backend.
 */
export function useRealtimeSync() {
  const { session } = useSessionStore();
  const { username } = useUserStore();
  const syncStateRef = useRef<SyncState>({
    userId: `user-${Math.random().toString(36).substr(2, 9)}`,
  });

  useEffect(() => {
    if (!session) return;

    const userId = syncStateRef.current.userId;
    const sessionId = session.id;

    // Optional: Send a single join notification on mount (not polling)
    const notifyJoin = async () => {
      try {
        await api.post('/api/realtime', {
          sessionId,
          userId,
          type: 'join',
          username,
        }, { params: { sessionId, userId } });
      } catch (error) {
        console.error('Join notification failed:', error);
      }
    };

    notifyJoin();

    // No cleanup needed
  }, [session, username]);

  // No-op sendEdit for compatibility; Yjs handles all sync
  const sendEdit = async () => {};

  return { sendEdit };
}