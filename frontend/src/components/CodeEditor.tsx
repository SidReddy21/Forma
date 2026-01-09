import React, { useCallback, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import { useSessionStore } from '../store/sessionStore';
import { useEditorStore } from '../store/editorStore';
import { useRealtimeSync } from '../hooks/useRealtimeSync';

export function CodeEditor() {
  const { session, updateSessionContent } = useSessionStore();
  const { editorRef } = useEditorStore();
  const { sendEdit } = useRealtimeSync();

  const handleEditorChange = useCallback(
    (value: string | undefined) => {
      if (value && session) {
        updateSessionContent(value);
        // Send to other collaborators
        sendEdit(value);
      }
    },
    [session, updateSessionContent, sendEdit]
  );

  const handleEditorMount = (editor: any) => {
    useEditorStore.setState({ editorRef: editor });
  };

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
  );
}
