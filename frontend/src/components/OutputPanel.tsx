import React, { useState } from 'react';
import api from '../services/api';
import { useSessionStore } from '../store/sessionStore';

export function OutputPanel() {
  const { session } = useSessionStore();
  const [output, setOutput] = useState<string>('');
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string>('');

  const handleRun = async () => {
    if (!session) return;
    
    setIsRunning(true);
    setError('');
    setOutput('Running...');

    try {
      const response = await api.post('/api/execute', {
        code: session.content,
        language: session.language,
        sessionId: session.id,
      });

      if (response.data.error) {
        setError(response.data.error);
        setOutput('');
      } else {
        setOutput(response.data.output || 'Program executed successfully (no output)');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Execution failed');
      setOutput('');
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 border-t border-slate-700">
      {/* Header with Run Button */}
      <div className="flex items-center justify-between p-3 border-b border-slate-700 bg-slate-800">
        <div className="text-sm font-semibold text-slate-200">Output</div>
        <button
          onClick={handleRun}
          disabled={!session || isRunning}
          className="px-4 py-1.5 bg-green-600 hover:bg-green-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white text-sm font-medium rounded transition"
        >
          {isRunning ? '⏳ Running...' : '▶ Run Code'}
        </button>
      </div>

      {/* Output Display */}
      <div className="flex-1 overflow-auto p-4 font-mono text-xs text-slate-300 bg-slate-950">
        {error ? (
          <div className="text-red-400">
            <span className="font-semibold">❌ Error:</span>
            <pre className="mt-2 whitespace-pre-wrap">{error}</pre>
          </div>
        ) : output ? (
          <pre className="whitespace-pre-wrap">{output}</pre>
        ) : (
          <span className="text-slate-500">Click "Run Code" to execute</span>
        )}
      </div>
    </div>
  );
}
