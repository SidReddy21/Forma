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
      
      // Ensure response has proper structure
      const analysis = {
        sessionId: 'current-session',
        timestamp: Date.now(),
        bugs: (response.data.bugs || []) as any[],
        improvements: (response.data.improvements || []) as any[],
        testCoverage: response.data.testCoverage ?? 0,
        complexity: (response.data.complexity || 'medium') as 'low' | 'medium' | 'high',
      };
      
      set({ analysis });
    } catch (error) {
      console.error('Failed to analyze code:', error);
      set({
        analysis: {
          sessionId: 'current-session',
          timestamp: Date.now(),
          bugs: [
            {
              line: 1,
              severity: 'warning' as const,
              message: 'Error: Could not analyze code',
              suggestion: 'Check your connection and try again',
            },
          ],
          improvements: [],
          testCoverage: 0,
          complexity: 'medium' as const,
        },
      });
    } finally {
      set({ isLoading: false });
    }
  },

  clearCompletions: () => set({ completions: [] }),
}));
