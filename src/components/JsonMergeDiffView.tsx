import { useEffect, useRef } from 'react';
import { MergeView } from '@codemirror/merge';
import { json } from '@codemirror/lang-json';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { vscodeDark } from '@uiw/codemirror-theme-vscode';

type Props = {
  /** 左側: 過去版 / 編集中 */
  leftValue: string;
  leftLabel?: string;
  /** 右側: 最新（比較基準・読取専用） */
  rightValue: string;
  rightLabel?: string;
  onLeftChange: (value: string) => void;
  className?: string;
};

const sharedTheme = EditorView.theme({
  '&': {
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
  },
  '.cm-gutters': {
    backgroundColor: '#0c1118',
    color: 'var(--muted)',
    borderRight: '1px solid var(--line)',
  },
  /* Git 風: 左(過去)=削除寄り赤 / 右(最新)=追加寄り緑 */
  '.cm-deletedChunk': {
    backgroundColor: 'rgba(239, 68, 68, 0.16)',
  },
  '.cm-insertedChunk': {
    backgroundColor: 'rgba(34, 197, 94, 0.14)',
  },
  '& .cm-changedLine': {
    backgroundColor: 'rgba(250, 204, 21, 0.08)',
  },
  '.cm-deletedText': {
    backgroundColor: 'rgba(239, 68, 68, 0.35)',
  },
  '.cm-insertedText': {
    backgroundColor: 'rgba(34, 197, 94, 0.32)',
  },
});

/**
 * 過去版 JSON（左・編集可）と最新 JSON（右・読取専用）の左右差分。
 * Git と同様に「過去 → 最新」:
 * - 赤: 過去にあって最新で消えた箇所
 * - 緑: 最新で追加された箇所
 */
export function JsonMergeDiffView({
  leftValue,
  leftLabel = '過去版（編集中）',
  rightValue,
  rightLabel = '最新',
  onLeftChange,
  className = '',
}: Props) {
  const parentRef = useRef<HTMLDivElement>(null);
  const mergeRef = useRef<MergeView | null>(null);
  const onLeftChangeRef = useRef(onLeftChange);
  onLeftChangeRef.current = onLeftChange;
  const skipNotify = useRef(false);

  useEffect(() => {
    const parent = parentRef.current;
    if (!parent) return;

    mergeRef.current?.destroy();
    mergeRef.current = null;
    parent.replaceChildren();

    // a = 過去（編集）, b = 最新（読取）→ 色も Git の old→new と同じ向き
    const view = new MergeView({
      parent,
      orientation: 'a-b',
      gutter: true,
      highlightChanges: true,
      a: {
        doc: leftValue,
        extensions: [
          vscodeDark,
          json(),
          sharedTheme,
          EditorView.lineWrapping,
          EditorView.updateListener.of((update) => {
            if (!update.docChanged || skipNotify.current) return;
            onLeftChangeRef.current(update.state.doc.toString());
          }),
        ],
      },
      b: {
        doc: rightValue,
        extensions: [
          vscodeDark,
          json(),
          sharedTheme,
          EditorView.editable.of(false),
          EditorState.readOnly.of(true),
          EditorView.lineWrapping,
        ],
      },
    });
    mergeRef.current = view;

    return () => {
      view.destroy();
      mergeRef.current = null;
    };
    // 比較基準（最新）が変わったとき作り直す
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rightValue]);

  // 左ペイン（過去版）だけ親 state から同期
  useEffect(() => {
    const view = mergeRef.current;
    if (!view) return;
    const cur = view.a.state.doc.toString();
    if (cur === leftValue) return;
    skipNotify.current = true;
    view.a.dispatch({
      changes: { from: 0, to: view.a.state.doc.length, insert: leftValue },
    });
    skipNotify.current = false;
  }, [leftValue]);

  return (
    <div className={`min-h-0 flex-1 flex flex-col overflow-hidden ${className}`}>
      <div className="grid grid-cols-2 gap-0 border-b border-[var(--line)] shrink-0 text-[11px]">
        <div className="px-3 py-1.5 text-[var(--muted)] border-r border-[var(--line)]">
          {leftLabel}
          <span className="ml-2 text-[10px] text-red-400/90">削除 = 赤</span>
        </div>
        <div className="px-3 py-1.5 text-[var(--muted)]">
          {rightLabel}
          <span className="ml-2 text-[10px] text-emerald-400/90">追加 = 緑</span>
        </div>
      </div>
      <div className="relative min-h-0 flex-1">
        <div ref={parentRef} className="absolute inset-0 cm-merge-host" />
      </div>
      <style>{`
        .cm-merge-host {
          overflow: hidden;
        }
        /* MergeView 公式: 外側に height + overflow:auto でスクロールさせる */
        .cm-merge-host > .cm-mergeView {
          height: 100% !important;
          max-height: 100%;
          overflow-y: auto !important;
          overflow-x: auto;
          box-sizing: border-box;
        }
      `}</style>
    </div>
  );
}
