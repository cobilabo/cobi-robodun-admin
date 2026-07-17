import CodeMirror from '@uiw/react-codemirror';
import { json, jsonParseLinter } from '@codemirror/lang-json';
import { linter, lintGutter } from '@codemirror/lint';
import { EditorView } from '@codemirror/view';
import { vscodeDark } from '@uiw/codemirror-theme-vscode';

type Props = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
};

const editorTheme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '12.5px',
    backgroundColor: 'var(--input-bg)',
  },
  '.cm-scroller': {
    fontFamily:
      'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
    lineHeight: '1.55',
  },
  '.cm-content': {
    paddingTop: '10px',
    paddingBottom: '24px',
    caretColor: 'var(--accent)',
  },
  '.cm-gutters': {
    backgroundColor: '#0c1118',
    color: 'var(--muted)',
    borderRight: '1px solid var(--line)',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'var(--accent-soft)',
    color: 'var(--accent)',
  },
  '.cm-activeLine': {
    backgroundColor: 'rgba(61, 186, 140, 0.08)',
  },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
    backgroundColor: 'rgba(61, 186, 140, 0.28) !important',
  },
  '.cm-cursor': {
    borderLeftColor: 'var(--accent)',
  },
  '.cm-matchingBracket': {
    backgroundColor: 'rgba(61, 186, 140, 0.22)',
    outline: '1px solid var(--accent)',
  },
  '.cm-lintRange-error': {
    backgroundImage: 'none',
    backgroundColor: 'rgba(239, 107, 92, 0.18)',
  },
  '.cm-diagnostic-error': {
    borderLeftColor: 'var(--danger)',
  },
});

/** JSON editor with line numbers, syntax highlight, and parse lint. */
export function JsonCodeEditor({ value, onChange, className = '' }: Props) {
  return (
    <div className={`min-h-0 flex-1 overflow-hidden ${className}`}>
      <CodeMirror
        value={value}
        height="100%"
        theme={vscodeDark}
        extensions={[
          json(),
          lintGutter(),
          linter(jsonParseLinter()),
          editorTheme,
          EditorView.lineWrapping,
        ]}
        basicSetup={{
          lineNumbers: true,
          foldGutter: true,
          highlightActiveLine: true,
          highlightActiveLineGutter: true,
          bracketMatching: true,
          autocompletion: true,
          indentOnInput: true,
          syntaxHighlighting: true,
        }}
        onChange={onChange}
        className="h-full text-left"
      />
    </div>
  );
}
