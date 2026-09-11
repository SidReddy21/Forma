import { useEffect, useRef, useState } from 'react';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import 'monaco-editor/esm/vs/editor/editor.all';
import 'monaco-editor/esm/vs/language/typescript/monaco.contribution';
import 'monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import TypeScriptWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';
import { MonacoBinding } from 'y-monaco';
import { Code2, Download, WrapText } from 'lucide-react';
import { codeOf } from '../../../shared/workspace';
import type { Workspace } from '../canvas/Workspace';
import { IconButton } from './Controls';

(
  self as typeof self & { MonacoEnvironment: { getWorker: (id: string, label: string) => Worker } }
).MonacoEnvironment = {
  getWorker: (_id: string, label: string) =>
    label === 'typescript' || label === 'javascript' ? new TypeScriptWorker() : new EditorWorker(),
};
monaco.editor.defineTheme('forma', {
  base: 'vs',
  inherit: true,
  rules: [
    { token: 'comment', foreground: '8D9B93' },
    { token: 'keyword', foreground: '846AA2' },
    { token: 'string', foreground: '3D836A' },
    { token: 'number', foreground: 'B5754D' },
  ],
  colors: {
    'editor.background': '#FBFCFB',
    'editor.foreground': '#354C40',
    'editorLineNumber.foreground': '#B2BCB5',
    'editorLineNumber.activeForeground': '#637F6D',
    'editor.lineHighlightBackground': '#F0F5F1',
    'editor.selectionBackground': '#D7E9DF',
    'editorCursor.foreground': '#3D7E60',
    'editorIndentGuide.background1': '#E8EDE9',
  },
});
monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
  jsx: monaco.languages.typescript.JsxEmit.Preserve,
  target: monaco.languages.typescript.ScriptTarget.ESNext,
  allowNonTsExtensions: true,
});
monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
  noSemanticValidation: true,
  noSyntaxValidation: false,
});

export default function CodePanel({ w }: { w: Workspace }) {
  const host = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor>();
  const [position, setPosition] = useState({ lineNumber: 1, column: 1 });
  const [wrap, setWrap] = useState(true);
  useEffect(() => {
    const model = monaco.editor.createModel(
      '',
      'typescript',
      monaco.Uri.parse(`file:///workspace/${w.room}/Canvas.tsx`),
    );
    const editor = monaco.editor.create(host.current!, {
      model,
      theme: 'forma',
      automaticLayout: true,
      editContext: false,
      minimap: { enabled: false },
      fontSize: 12,
      lineHeight: 21,
      fontFamily: 'Consolas, monospace',
      lineNumbersMinChars: 3,
      padding: { top: 18, bottom: 18 },
      scrollBeyondLastLine: false,
      wordWrap: 'on',
      folding: true,
      glyphMargin: false,
      renderLineHighlight: 'line',
      ariaLabel: 'Shared code editor',
      tabSize: 2,
      fixedOverflowWidgets: true,
    });
    editorRef.current = editor;
    const binding = new MonacoBinding(
      codeOf(w.doc),
      model,
      new Set([editor]),
      w.provider.awareness,
    );
    w.codeUndo.trackedOrigins.add(binding);
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyZ, () => w.codeUndo.undo());
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyZ, () =>
      w.codeUndo.redo(),
    );
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyY, () => w.codeUndo.redo());
    const selection = editor.onDidChangeCursorPosition((e) => setPosition(e.position));
    const focus = editor.onDidFocusEditorText(() => {
      w.activeSurface = 'code';
      w.emit();
      w.provider.awareness.setLocalStateField('cursor', null);
      w.provider.awareness.setLocalStateField('surface', 'code');
    });
    const style = document.createElement('style');
    document.head.appendChild(style);
    const decorate = () => {
      style.textContent = [...w.provider.awareness.getStates()]
        .map(([id, state]) => {
          const color = /^#[\da-f]{6}$/i.test(state.user?.color) ? state.user.color : '#638f75';
          return `.yRemoteSelection-${id}{background:${color}25}.yRemoteSelectionHead-${id}{border-left:2px solid ${color}}`;
        })
        .join('\n');
    };
    w.provider.awareness.on('change', decorate);
    decorate();
    return () => {
      w.provider.awareness.off('change', decorate);
      style.remove();
      selection.dispose();
      focus.dispose();
      w.codeUndo.trackedOrigins.delete(binding);
      binding.destroy();
      editor.dispose();
      model.dispose();
      editorRef.current = undefined;
      w.provider.awareness.setLocalStateField('selection', null);
    };
  }, [w]);
  const download = () => {
    const url = URL.createObjectURL(new Blob([codeOf(w.doc).toString()], { type: 'text/plain' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'Canvas.tsx';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <section className="code-panel" aria-label="Code panel">
      <div className="code-filebar">
        <span className="code-file">
          <Code2 size={14} />
          Canvas.tsx<span className="file-language">TSX</span>
        </span>
        <div>
          <IconButton
            label="Toggle word wrap"
            active={wrap}
            onClick={() => {
              editorRef.current?.updateOptions({ wordWrap: wrap ? 'off' : 'on' });
              setWrap(!wrap);
            }}
          >
            <WrapText size={15} />
          </IconButton>
          <IconButton label="Download code" onClick={download}>
            <Download size={14} />
          </IconButton>
        </div>
      </div>
      <div className="monaco-host" ref={host} data-testid="code-editor" />
      <div className="code-status">
        <span>
          Ln {position.lineNumber}, Col {position.column}
        </span>
        <span>TypeScript JSX</span>
        <span>UTF-8</span>
      </div>
    </section>
  );
}
