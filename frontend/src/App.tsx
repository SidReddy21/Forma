import React, { useState, useCallback, useEffect } from 'react';
import { CodeEditor } from './components/CodeEditor';
import { CollaborativePanel } from './components/CollaborativePanel';
import { AIAssistant } from './components/AIAssistant';
import { useSessionStore } from './store/sessionStore';
import { useUserStore } from './store/userStore';
import { motion } from 'framer-motion';
import { Copy, Check } from 'lucide-react';

export default function App() {
  const { session, createSession, joinSession, loading, error } = useSessionStore();
  const { username, setUsername } = useUserStore();
  const [usernameInput, setUsernameInput] = useState(username);
  const [showAI, setShowAI] = useState(true);
  const [copied, setCopied] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState<'cpp' | 'python' | 'javascript'>('javascript');

  // Handle URL params to join existing session on load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('sessionId');
    if (sessionId && !session && !loading) {
      console.log('Auto-joining session from URL:', sessionId);
      joinSession(sessionId).catch(err => {
        console.error('Failed to join session from URL:', err);
      });
    }
  }, [session, loading, joinSession]);

  const handleNewSession = useCallback(async () => {
    setIsCreating(true);
    try {
      const templates: Record<string, string> = {
        cpp: '#include <iostream>\nint main() {\n  // Start coding here...\n  return 0;\n}',
        python: '# Start coding here...\nprint("Hello, World!")',
        javascript: '// Start coding here...\nconsole.log("Hello, World!");',
      };

      await createSession({
        name: `Session-${Date.now()}`,
        language: selectedLanguage,
        content: templates[selectedLanguage],
      });
      const newSession = useSessionStore.getState().session;
      if (newSession) {
        const newUrl = `${window.location.origin}${window.location.pathname}?sessionId=${newSession.id}`;
        window.history.replaceState({}, '', newUrl);
      }
    } catch (err) {
      console.error('Failed to create new session:', err);
      alert('Failed to create new session. Please try again.');
    } finally {
      setIsCreating(false);
    }
  }, [createSession, selectedLanguage]);

  const handleCopyShareLink = useCallback(() => {
    if (!session || !session.id) {
      alert('No active session to share');
      return;
    }
    try {
      const shareUrl = `${window.location.origin}?sessionId=${session.id}`;
      navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      console.log('Share link copied:', shareUrl);
    } catch (err) {
      console.error('Failed to copy share link:', err);
      alert('Failed to copy share link');
    }
  }, [session]);

  if (!session) {
    return (
      <div className="flex items-center justify-center w-full h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-8 max-w-lg px-4"
        >
          <div>
            <h1 className="text-6xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent mb-4">
              CodeMeld
            </h1>
            <p className="text-xl text-slate-400">
              Share a session link or create a new one to start
            </p>
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="bg-red-900/50 border border-red-500 p-4 rounded-lg text-red-200"
            >
              {error}
            </motion.div>
          )}

          {loading || isCreating ? (
            <div className="flex flex-col items-center gap-4">
              <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-slate-400">{isCreating ? 'Creating session...' : 'Loading session...'}</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex gap-2">
                {(['cpp', 'python', 'javascript'] as const).map((lang) => (
                  <button
                    key={lang}
                    onClick={() => setSelectedLanguage(lang)}
                    className={`flex-1 px-3 py-2 rounded transition-colors ${
                      selectedLanguage === lang
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    {lang === 'cpp' ? 'C++' : lang === 'python' ? 'Python' : 'JavaScript'}
                  </button>
                ))}
              </div>
              <button
                onClick={handleNewSession}
                className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 rounded transition-colors"
              >
                Start Coding (Create New Session)
              </button>
              <p className="text-sm text-slate-500 text-center">Or open a shared link with a session ID</p>
            </div>
          )}
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full h-screen bg-slate-900 text-slate-100">
      {/* Header */}
      <header className="bg-slate-800 border-b border-slate-700 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => window.history.pushState({}, '', window.location.pathname)}
            className="px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded transition-colors text-sm font-semibold"
          >
            Home
          </button>
          <div>
            <h1 className="text-2xl font-bold text-blue-400">{session.name}</h1>
            <p className="text-sm text-slate-400">ID: {session.id.substring(0, 12)}...</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-400">Your Name:</label>
            <input
              type="text"
              value={usernameInput}
              onChange={(e) => setUsernameInput(e.target.value)}
              onBlur={() => {
                if (usernameInput.trim()) {
                  setUsername(usernameInput.trim());
                }
              }}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && usernameInput.trim()) {
                  setUsername(usernameInput.trim());
                }
              }}
              maxLength={20}
              className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 w-32"
              placeholder="Your name"
            />
          </div>
          <button
            onClick={handleCopyShareLink}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 rounded transition-colors"
          >
            {copied ? (
              <>
                <Check size={18} />
                Copied!
              </>
            ) : (
              <>
                <Copy size={18} />
                Share Link
              </>
            )}
          </button>
          <button
            onClick={() => setShowAI(!showAI)}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded transition-colors"
          >
            {showAI ? '✓' : ''} AI Assistant
          </button>
          {/* New Session removed per request */}
        </div>
      </header>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden gap-4 p-4">
        {/* Editor */}
        <div className="flex-1 bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
          <CodeEditor />
        </div>

        {/* Right Panel */}
        <div className="w-80 flex flex-col gap-4">
          {/* Collaboration Panel */}
          <div className="bg-slate-800 rounded-lg border border-slate-700 p-4 overflow-hidden">
            <CollaborativePanel />
          </div>

          {/* AI Assistant */}
          {showAI && (
            <div className="flex-1 bg-slate-800 rounded-lg border border-slate-700 p-4 overflow-hidden">
              <AIAssistant />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
