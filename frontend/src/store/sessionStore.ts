import { create } from 'zustand';
import { EditorSession } from '../../types';
import api from '../services/api';

interface SessionStore {
  session: EditorSession | null;
  loading: boolean;
  error: string | null;
  createSession: (data: Partial<EditorSession>) => Promise<void>;
  joinSession: (id: string) => Promise<void>;
  loadSession: (id: string) => Promise<void>;
  updateSessionContent: (content: string) => Promise<void>;
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  session: null,
  loading: false,
  error: null,

  createSession: async (data) => {
    set({ loading: true, error: null });
    try {
      console.log('Creating session with:', data);
      const response = await api.post('/api/sessions', data);
      console.log('Session created:', response.data);
      
      if (!response.data || !response.data.id) {
        throw new Error('Invalid session response from server');
      }
      
      set({ session: response.data, error: null });
    } catch (error: any) {
      console.error('Session creation error:', error);
      const errorMsg = error.response?.data?.error || error.message || 'Failed to create session';
      set({ error: errorMsg });
      throw error;
    } finally {
      set({ loading: false });
    }
  },

  joinSession: async (id) => {
    set({ loading: true, error: null });
    try {
      console.log('Joining session:', id);
      const response = await api.get(`/api/sessions/${id}`);
      console.log('Joined session:', response.data);
      
      if (!response.data || !response.data.id) {
        throw new Error('Session not found or invalid response');
      }
      
      set({ session: response.data, error: null });
    } catch (error: any) {
      console.error('Failed to join session:', error);
      const errorMsg = error.response?.status === 404 
        ? 'Session not found' 
        : error.response?.data?.error || error.message || 'Failed to join session';
      set({ error: errorMsg });
      throw error;
    } finally {
      set({ loading: false });
    }
  },

  loadSession: async (id) => {
    set({ loading: true });
    try {
      const response = await api.get(`/api/sessions/${id}`);
      set({ session: response.data });
    } catch (error) {
      set({ error: (error as Error).message });
    } finally {
      set({ loading: false });
    }
  },

  updateSessionContent: async (content) => {
    const session = get().session;
    if (!session) {
      console.warn('Cannot update content: no active session');
      return;
    }

    const updated = { ...session, content, updatedAt: Date.now() };
    set({ session: updated });

    // Sync to server (debounced in production)
    try {
      await api.put(`/api/sessions/${session.id}`, { 
        content,
        updatedAt: Date.now() 
      });
    } catch (error: any) {
      console.error('Failed to sync content:', error);
      // Don't block UI for sync failures, just log
    }
  },
}));
