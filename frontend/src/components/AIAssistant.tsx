import React, { useState } from 'react';
import { useAIStore } from '../store/aiStore';
import { useSessionStore } from '../store/sessionStore';
import { Sparkles, AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';

export function AIAssistant() {
  const {
    completions,
    analysis,
    isLoading,
    error,
    requestCompletion,
    analyzeCode,
  } = useAIStore();
  const { session } = useSessionStore();
  const [userQuery, setUserQuery] = useState('');

  const handleAnalyze = async () => {
    if (!session) {
      console.error('No active session');
      return;
    }
    if (!session.content || session.content.trim() === '') {
      console.warn('No code to analyze');
      return;
    }
    // Pass sessionId along with code and language
    await analyzeCode(session.content, session.language, session.id);
  };

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Sparkles size={18} className="text-purple-400" />
        <h3 className="font-semibold">AI Assistant</h3>
      </div>

      {/* Error Display */}
      {error && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="bg-red-900/50 border border-red-500 p-3 rounded text-sm flex items-start gap-2"
        >
          <AlertCircle size={16} className="text-red-400 mt-0.5 flex-shrink-0" />
          <p className="text-red-200">{error}</p>
        </motion.div>
      )}

      {/* Execution Block */}
      {analysis && (analysis as any).execution && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="bg-slate-700 p-3 rounded text-sm space-y-2"
        >
          <p className="text-blue-300 font-semibold">Execution</p>
          {(() => {
            const exec = (analysis as any).execution as {
              failed: boolean;
              exitCode: number | null;
              output: string | null;
              error: string | null;
              language: string;
              version: string;
              timestamp: number;
            };
            const status = exec.failed ? 'Failed' : 'Succeeded';
            return (
              <div className="space-y-2">
                <div className="flex gap-3 text-xs text-slate-300">
                  <span><span className="text-slate-400">Status:</span> {status}</span>
                  <span><span className="text-slate-400">Exit:</span> {exec.exitCode ?? 'n/a'}</span>
                  <span><span className="text-slate-400">Runtime:</span> {exec.language}@{exec.version}</span>
                  <span><span className="text-slate-400">At:</span> {new Date(exec.timestamp).toLocaleTimeString()}</span>
                </div>
                {exec.output && (
                  <details className="bg-slate-800/70 rounded p-2">
                    <summary className="text-slate-200 cursor-pointer select-none">Stdout</summary>
                    <pre className="mt-2 text-xs whitespace-pre-wrap text-slate-300">{exec.output}</pre>
                  </details>
                )}
                {exec.error && (
                  <details className="bg-slate-800/70 rounded p-2">
                    <summary className="text-red-300 cursor-pointer select-none">Stderr</summary>
                    <pre className="mt-2 text-xs whitespace-pre-wrap text-red-200">{exec.error}</pre>
                  </details>
                )}
              </div>
            );
          })()}
        </motion.div>
      )}

      {/* Analysis Results */}
      {analysis && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="bg-slate-700 p-3 rounded text-sm space-y-3 max-h-64 overflow-y-auto"
        >
          {/* Goal Analysis Section */}
          {(analysis as any).inferredGoal && (
            <div className="bg-blue-900/30 border border-blue-500/50 p-3 rounded space-y-2">
              <p className="text-blue-300 font-semibold flex items-center gap-2">
                🎯 Code Goal Analysis
              </p>
              <div className="text-xs space-y-2">
                <div>
                  <span className="text-slate-400">Detected Goal:</span>
                  <p className="text-slate-200 mt-1">{(analysis as any).inferredGoal}</p>
                </div>
                {(analysis as any).goalAnalysis && (
                  <div>
                    <span className="text-slate-400">Fulfillment:</span>
                    <p className={`mt-1 ${(analysis as any).fulfillsGoal ? 'text-green-300' : 'text-red-300'}`}>
                      {(analysis as any).fulfillsGoal ? '✓ Goal Achieved' : '✗ Goal Not Met'}
                    </p>
                    <p className="text-slate-300 mt-1">{(analysis as any).goalAnalysis}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          <div>
            <p className="text-yellow-400 font-semibold mb-2">Bugs Found: {analysis.bugs?.length || 0}</p>
            {(analysis.bugs || []).map((bug, idx) => (
              <div key={idx} className="text-xs bg-slate-800 p-2 rounded mb-2">
                <p className="text-slate-300">
                  <span className="text-yellow-400 font-mono">Line {bug.line}:</span> {bug.message}
                </p>
                {bug.suggestion && (
                  <p className="text-slate-400 mt-1 italic">💡 {bug.suggestion}</p>
                )}
              </div>
            ))}
          </div>
          {(analysis.improvements || []).length > 0 && (
            <div>
              <p className="text-green-400 font-semibold mb-2">Improvements:</p>
              {analysis.improvements.map((imp, idx) => (
                <p key={idx} className="text-xs text-slate-300 mb-1">• {typeof imp === 'string' ? imp : imp.category}</p>
              ))}
            </div>
          )}
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
