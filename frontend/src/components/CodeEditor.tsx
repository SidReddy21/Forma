import React, { useCallback, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import { useSessionStore } from '../store/sessionStore';
import { useEditorStore } from '../store/editorStore';
import { initYjsMonaco } from '../realtime/yjsProvider';
import { useUserStore } from '../store/userStore';

export function CodeEditor() {
  const { session, updateSessionContent } = useSessionStore();
  const { editorRef } = useEditorStore();
  const { username } = useUserStore();
  const yjsHandleRef = React.useRef<any>(null);

  const handleEditorChange = useCallback(
    (value: string | undefined) => {
      if (value && session) {
        updateSessionContent(value);
        // With Yjs, remote sync is handled by CRDT binding; no manual send
      }
    },
    [session, updateSessionContent]
  );

  const handleEditorMount = (editor: any) => {
    useEditorStore.setState({ editorRef: editor });
    if (session) {
      // Initialize Yjs Monaco binding for robust realtime sync
      console.log(`[CodeEditor] Mounting Yjs with session.id: "${session.id}", username: "${username}"`);
      yjsHandleRef.current = initYjsMonaco(editor, session.id, username);
    }
  };

  // Keep collaborator awareness in sync when username changes
  useEffect(() => {
    const handle = yjsHandleRef.current;
    if (handle?.provider?.awareness && username) {
      handle.provider.awareness.setLocalStateField('user', {
        name: username,
        color: '#3b82f6',
      });
    }
  }, [username]);

  // Cleanup Yjs binding on unmount or session change
  useEffect(() => {
    return () => {
      try {
        yjsHandleRef.current?.destroy?.();
        yjsHandleRef.current = null;
      } catch {}
    };
  }, [session?.id]);

  if (!session) return null;

  return (
    <Editor
      height="100%"
      defaultLanguage={session.language}
      defaultValue={session.content}
      onChange={handleEditorChange}
      onMount={handleEditorMount}
      theme="vs-dark"
      options={{
        minimap: { enabled: false },
        fontFamily: 'Monaco, Menlo, monospace',
        fontSize: 14,
        lineHeight: 1.6,
        wordWrap: 'on',
        autoClosingBrackets: 'always',
        autoClosingQuotes: 'always',
        formatOnPaste: false,
        formatOnType: false,
        scrollBeyondLastLine: false,
        quickSuggestions: false,
        parameterHints: { enabled: false },
        folding: true,
        colorDecorators: false,
      }}
    />
  );}