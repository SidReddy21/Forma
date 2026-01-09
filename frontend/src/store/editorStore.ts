import { create } from 'zustand';

interface EditorStore {
  editorRef: any | null;
}

export const useEditorStore = create<EditorStore>(() => ({
  editorRef: null,
}));
