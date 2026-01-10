import { create } from 'zustand';

interface UserStore {
  username: string;
  userId: string;
  setUsername: (name: string) => void;
}

// Generate persistent userId for this device/browser
function getPersistentUserId(): string {
  let userId = localStorage.getItem('userId');
  if (!userId) {
    userId = `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem('userId', userId);
  }
  return userId;
}

export const useUserStore = create<UserStore>((set) => ({
  username: localStorage.getItem('username') || `User-${Math.random().toString(36).substr(2, 5)}`,
  userId: getPersistentUserId(),
  setUsername: (name) => {
    localStorage.setItem('username', name);
    set({ username: name });
    
    // Trigger immediate sync when username changes so other users see the update
    if ((window as any).__yjsTriggerSync) {
      (window as any).__yjsTriggerSync().catch((err: Error) => {
        console.error('Failed to trigger immediate sync on username change:', err);
      });
    }
  },
}));
