import { create } from 'zustand';
import { AICompletion, CodeAnalysisReport } from '../../types';
import api from '../services/api';

interface AIStore {
  completions: AICompletion['suggestions'];
  analysis: CodeAnalysisReport | null;
  isLoading: boolean;
  error: string | null;
  requestCompletion: (context: string, language: string) => Promise<void>;
  analyzeCode: (code: string, language: string, sessionId: string) => Promise<void>;
  clearCompletions: () => void;
  clearError: () => void;
}

export const useAIStore = create<AIStore>((set) => ({
  completions: [],
  analysis: null,
  isLoading: false,
  error: null,

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

  analyzeCode: async (code, language, sessionId) => {
    set({ isLoading: true, error: null });
    try {
      console.log('Analyzing code:', { code: code.substring(0, 100), language, sessionId });
      const response = await api.post('/api/ai/analyze', { 
        code, 
        language, 
        sessionId 
      });
      console.log('Analysis response:', response.data);
      
      // Ensure response has proper structure
      const analysis: any = {
        sessionId: response.data.sessionId || sessionId,
        timestamp: response.data.timestamp || Date.now(),
        bugs: (response.data.bugs || []).map((bug: any) => ({
          line: bug.line || 1,
          severity: bug.severity || 'warning',
          message: bug.message || 'Unknown issue',
          suggestion: bug.suggestion || '',
        })),
        improvements: (response.data.improvements || []).map((imp: any) => 
          typeof imp === 'string' ? { category: 'General', suggestions: [imp] } : imp
        ),
        testCoverage: 0,
        complexity: 'medium',
      };
      if (response.data.execution) {
        analysis.execution = response.data.execution;
      }
      
      set({ analysis: analysis as CodeAnalysisReport, error: null });
    } catch (error: any) {
      console.error('Failed to analyze code:', error);
      const errorMessage = error.response?.data?.error || error.message || 'Failed to analyze code';
      set({
        error: errorMessage,
        analysis: {
          sessionId: sessionId,
          timestamp: Date.now(),
          bugs: [
            {
              line: 1,
              severity: 'warning' as const,
              message: 'Analysis service temporarily unavailable',
              suggestion: 'Please check your connection and try again',
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
  clearError: () => set({ error: null }),
}));
