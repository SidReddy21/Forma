import React, { useState } from 'react';
import { useAIStore } from '../store/aiStore';
import { useSessionStore } from '../store/sessionStore';
import { Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';

export function AIAssistant() {
  const {
    completions,
    analysis,
    isLoading,
    requestCompletion,
    analyzeCode,
  } = useAIStore();
  const { session } = useSessionStore();
  const [userQuery, setUserQuery] = useState('');

  const handleAnalyze = async () => {
    if (!session) return;
    // Get current code from session
    await analyzeCode(session.content || 'No code', session.language);
  };

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Sparkles size={18} className="text-purple-400" />
        <h3 className="font-semibold">AI Assistant</h3>
      </div>

      {/* Analysis Results */}
      {analysis && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="bg-slate-700 p-3 rounded text-sm space-y-2 max-h-48 overflow-y-auto"
        >
          <div>
            <p className="text-yellow-400 font-semibold">Bugs Found: {analysis.bugs.length}</p>
            {analysis.bugs.map((bug, idx) => (
              <p key={idx} className="text-xs text-slate-300 mt-1">
                Line {bug.line}: {bug.message}
              </p>
            ))}
          </div>
          <div className="text-blue-400 font-semibold">
            Test Coverage: {(analysis.testCoverage * 100).toFixed(0)}%
          </div>
        </motion.div>
      )}

      {/* Completions */}
      {(completions || []).length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="bg-slate-700 p-3 rounded space-y-2 max-h-32 overflow-y-auto"
        >
          <p className="text-xs font-semibold text-slate-300">Suggestions:</p>
          {completions.map((completion, idx) => (
            <div
              key={idx}
              className="text-xs bg-slate-800 p-2 rounded cursor-pointer hover:bg-slate-600 transition"
            >
              {completion.text}
            </div>
          ))}
        </motion.div>
      )}

      {/* Input */}
      <div className="flex gap-2 mt-auto">
        <button
          onClick={handleAnalyze}
          disabled={isLoading}
          className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 rounded text-sm font-semibold transition-colors"
        >
          {isLoading ? 'Analyzing...' : 'Analyze'}
        </button>
      </div>
    </div>
  );
}
