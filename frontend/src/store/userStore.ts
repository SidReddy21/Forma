import { create } from 'zustand';

interface UserStore {
  username: string;
  setUsername: (name: string) => void;
}

export const useUserStore = create<UserStore>((set) => ({
  username: localStorage.getItem('username') || `User-${Math.random().toString(36).substr(2, 5)}`,
  setUsername: (name) => {
    localStorage.setItem('username', name);
    set({ username: name });
  },
}));
