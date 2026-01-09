import { create } from 'zustand';
import { AICompletion, CodeAnalysisReport } from '../../types';
import api from '../services/api';

interface AIStore {
  completions: AICompletion['suggestions'];
  analysis: CodeAnalysisReport | null;
  isLoading: boolean;
  requestCompletion: (context: string, language: string) => Promise<void>;
  analyzeCode: (code: string, language: string) => Promise<void>;
  clearCompletions: () => void;
}

export const useAIStore = create<AIStore>((set) => ({
  completions: [],
  analysis: null,
  isLoading: false,

  requestCompletion: async (context, language) => {
    set({ isLoading: true });
    try {
      const response = await api.post('/api/ai/complete', { context, language });
      set({ completions: response.data.suggestions });
    } catch (error) {
      console.error('Failed to get completions:', error);
    } finally {
      set({ isLoading: false });
    }
  },

  analyzeCode: async (code, language) => {
    set({ isLoading: true });
    try {
      console.log('Analyzing code:', { code, language });
      const response = await api.post('/api/ai/analyze', { code, language });
      console.log('Analysis response:', response.data);
      set({ analysis: response.data });
    } catch (error) {
      console.error('Failed to analyze code:', error);
      set({ analysis: {
        bugs: [{ line: 1, message: 'Error: Could not analyze code', severity: 'error' }],
        improvements: [],
        testCoverage: 0,
        complexity: 'unknown'
      }});
    } finally {
      set({ isLoading: false });
    }
  },

  clearCompletions: () => set({ completions: [] }),
}));
