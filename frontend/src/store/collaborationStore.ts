import { create } from 'zustand';
import { Collaborator } from '../../types';

interface CollaborationStore {
  collaborators: Collaborator[];
  stats: {
    changeCount: number;
    sessionTime: number;
  };
  addCollaborator: (collaborator: Collaborator) => void;
  removeCollaborator: (id: string) => void;
  updateCollaborator: (id: string, updates: Partial<Collaborator>) => void;
  recordChange: () => void;
}

export const useCollaborationStore = create<CollaborationStore>((set) => ({
  collaborators: [],
  stats: {
    changeCount: 0,
    sessionTime: 0,
  },

  addCollaborator: (collaborator) =>
    set((state) => ({
      collaborators: [...state.collaborators, collaborator],
    })),

  removeCollaborator: (id) =>
    set((state) => ({
      collaborators: state.collaborators.filter((c) => c.id !== id),
    })),

  updateCollaborator: (id, updates) =>
    set((state) => ({
      collaborators: state.collaborators.map((c) =>
        c.id === id ? { ...c, ...updates } : c
      ),
    })),

  recordChange: () =>
    set((state) => ({
      stats: {
        ...state.stats,
        changeCount: state.stats.changeCount + 1,
      },
    })),
}));
