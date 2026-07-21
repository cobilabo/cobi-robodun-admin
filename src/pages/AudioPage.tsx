import { useEffect, useMemo, useRef, useState } from 'react';
import { api, type Issue } from '../lib/api';
import { AudioPicker } from '../components/AudioPicker';
import { ensureAssetUrl } from '../lib/assetUrlCache';
import {
  activeFilesOf,
  isActiveFile,
  migrateCueCandidates,
  newCandidateId,
  sortCandidatesNewestFirst,
  suggestCandidatePaths,
  toggleActiveFile,
  withActiveFiles,
  type AudioCandidate,
  type AudioCandidateProvider,
  type AudioCueWithCandidates,
} from '../lib/audioCandidates';
import {
  buildDefaultPrompt,
  buildDefaultPromptJa,
  defaultDurationSeconds,
  resolveProvider,
} from '../lib/audioPrompt';

import { PageDesc, UiButton } from '../components/ui';

type Cue = AudioCueWithCandidates;
type AudioDoc = { version: number; cues: Cue[] };
type ProviderChoice = 'auto' | 'stable-audio' | 'elevenlabs';

const DEFAULT_CUES: Cue[] = [
  { id: 'aud_01', code: 'bgm_title', kind: 'bgm', loop: true, trigger: 'Title', noteJa: 'タイトル' },
  { id: 'aud_02', code: 'bgm_battle', kind: 'bgm', loop: true, trigger: 'Battle', noteJa: '戦闘' },
  { id: 'aud_03', code: 'bgm_boss', kind: 'bgm', loop: true, trigger: 'Boss', noteJa: 'ボス' },
  {
    id: 'aud_04',
    code: 'bgm_gameover',
    kind: 'bgm',
    loop: false,
    trigger: 'GameOver',
    noteJa: 'ゲームオーバー',
  },
  { id: 'aud_05', code: 'se_match', kind: 'se', trigger: 'MatchClear', noteJa: 'マッチ成立' },
  { id: 'aud_06', code: 'se_clear', kind: 'se', trigger: 'TileClear', noteJa: '消去' },
  { id: 'aud_07', code: 'se_hit', kind: 'se', trigger: 'Hit', noteJa: '着弾' },
  { id: 'aud_08', code: 'se_player_hit', kind: 'se', trigger: 'PlayerHit', noteJa: '被弾' },
  { id: 'aud_09', code: 'ui_ok', kind: 'ui', trigger: 'UiConfirm', noteJa: '決定' },
  { id: 'aud_10', code: 'ui_back', kind: 'ui', trigger: 'UiBack', noteJa: '戻る' },
];

function guessContentType(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith('.ogg')) return 'audio/ogg';
  if (lower.endsWith('.wav')) return 'audio/wav';
  if (lower.endsWith('.mp3')) return 'audio/mpeg';
  if (lower.endsWith('.m4a')) return 'audio/mp4';
  return 'application/octet-stream';
}

function extOf(name: string): string {
  const m = name.toLowerCase().match(/\.(ogg|wav|mp3|m4a)$/);
  return m ? m[1] : 'mp3';
}

function formatWhen(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('ja-JP', { hour12: false });
}

function CandidateRow({
  cand,
  active,
  busy,
  canDeactivate,
  onToggle,
  onDelete,
}: {
  cand: AudioCandidate;
  active: boolean;
  busy: boolean;
  canDeactivate: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let cancelled = false;
    ensureAssetUrl(cand.file, 'project').then((u) => {
      if (!cancelled) setUrl(u ?? '');
    });
    return () => {
      cancelled = true;
    };
  }, [cand.file]);

  return (
    <div
      className={`rounded border px-3 py-2 space-y-1.5 ${
        active
          ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
          : 'border-[var(--line)] bg-[var(--panel)]'
      }`}
    >
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="text-[11px] min-w-0">
          <div className="font-medium flex items-center gap-1.5 flex-wrap">
            {active && (
              <span className="rounded bg-[var(--accent)] text-[var(--bg)] px-1.5 py-0.5 text-[10px]">
                有効
              </span>
            )}
            <span>{cand.label || cand.id}</span>
          </div>
          <div className="text-[var(--muted)] font-mono break-all mt-0.5">{cand.file}</div>
          <div className="text-[var(--muted)] mt-0.5">
            {formatWhen(cand.createdAt)} · {cand.source}
            {cand.provider ? ` · ${cand.provider}` : ''}
            {cand.originalFile && cand.originalFile !== cand.file
              ? ` · 原盤 ${cand.originalFormat || extOf(cand.originalFile)}`
              : ''}
          </div>
        </div>
        <div className="flex gap-1 shrink-0">
          <UiButton
            disabled={busy || (active && !canDeactivate)}
            onClick={onToggle}
            title={
              active && !canDeactivate
                ? '有効音声は最低1本必要です'
                : active
                  ? '有効から外す'
                  : '有効に追加（複数可）'
            }
          >
            {active ? '有効解除' : '有効に追加'}
          </UiButton>
          <UiButton variant="danger" disabled={busy || active} onClick={onDelete}>
            削除
          </UiButton>
        </div>
      </div>
      {url ? (
        <audio controls className="w-full h-8" src={url} preload="metadata" />
      ) : (
        <p className="text-[10px] text-[var(--muted)]">読み込み中…</p>
      )}
    </div>
  );
}

export function AudioPage() {
  const [doc, setDoc] = useState<AudioDoc>({ version: 1, cues: DEFAULT_CUES });
  const [status, setStatus] = useState('');
  const [issues, setIssues] = useState<Issue[]>([]);
  const [selected, setSelected] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [provider, setProvider] = useState<ProviderChoice>('auto');
  const [promptJa, setPromptJa] = useState('');
  const [prompt, setPrompt] = useState('');
  const [translateStatus, setTranslateStatus] = useState<
    'idle' | 'translating' | 'ok' | 'error'
  >('idle');
  const [translateError, setTranslateError] = useState('');
  const [durationSeconds, setDurationSeconds] = useState(90);
  const cueUploadRef = useRef<HTMLInputElement>(null);
  const translateSeq = useRef(0);
  const docRef = useRef(doc);
  const selectedRef = useRef(selected);
  const promptJaRef = useRef(promptJa);
  const promptRef = useRef(prompt);
  docRef.current = doc;
  selectedRef.current = selected;
  promptJaRef.current = promptJa;
  promptRef.current = prompt;

  useEffect(() => {
    api
      .getCatalog('audio')
      .then((r) => {
        const data = r.data as AudioDoc;
        if (data?.cues?.length) {
          setDoc({
            version: data.version ?? 1,
            cues: data.cues.map((c) => migrateCueCandidates(c)),
          });
        } else {
          setDoc({ version: 1, cues: DEFAULT_CUES });
        }
      })
      .catch((e) => setStatus(String(e.message || e)));
  }, []);

  const cue = doc.cues[selected];
  const candidates = useMemo(
    () => sortCandidatesNewestFirst(cue?.candidates),
    [cue?.candidates],
  );

  const seedPrompts = (c: Cue, writeToCue = false) => {
    const ja = buildDefaultPromptJa({
      kind: c.kind,
      code: c.code,
      trigger: c.trigger,
      noteJa: c.noteJa,
      loop: c.loop,
    });
    const en = buildDefaultPrompt({
      kind: c.kind,
      code: c.code,
      trigger: c.trigger,
      noteJa: c.noteJa,
      loop: c.loop,
    });
    setPromptJa(ja);
    setPrompt(en);
    setTranslateStatus('idle');
    setTranslateError('');
    if (writeToCue) updateCue({ promptJa: ja, promptEn: en });
  };

  const runTranslate = () => {
    if (!cue) return;
    const text = promptJa.trim();
    if (!text) return;
    setTranslateStatus('translating');
    setTranslateError('');
    const seq = ++translateSeq.current;
    void api
      .translateAudioPrompt({
        japanese: text,
        kind: cue.kind,
        code: cue.code,
        trigger: cue.trigger,
        noteJa: cue.noteJa,
        loop: cue.loop,
      })
      .then((r) => {
        if (seq !== translateSeq.current) return;
        setPrompt(r.english);
        updateCue({ promptEn: r.english, promptJa: text });
        setTranslateStatus('ok');
      })
      .catch((e) => {
        if (seq !== translateSeq.current) return;
        setTranslateStatus('error');
        setTranslateError(String((e as Error).message || e));
      });
  };

  useEffect(() => {
    if (!cue) return;
    if (cue.promptJa?.trim() || cue.promptEn?.trim()) {
      setPromptJa(cue.promptJa ?? '');
      setPrompt(cue.promptEn ?? '');
      setTranslateStatus('idle');
      setTranslateError('');
    } else {
      seedPrompts(cue);
    }
    setDurationSeconds(defaultDurationSeconds(cue.kind, cue.code));
    setProvider('auto');
  }, [selected, cue?.id]);

  const resolvedProvider = useMemo(
    () => (cue ? resolveProvider(cue.kind, provider) : 'stable-audio'),
    [cue, provider],
  );

  const updateCue = (patch: Partial<Cue>) => {
    setDoc((prev) => {
      const cues = [...prev.cues];
      cues[selected] = { ...cues[selected], ...patch };
      return { ...prev, cues };
    });
  };

  /** Apply updater against latest doc ref, persist to Firestore, sync local state. */
  const commitCatalog = async (
    updater: (prev: AudioDoc) => AudioDoc,
    okMessage: string,
  ): Promise<AudioDoc> => {
    const sel = selectedRef.current;
    const draft = updater(docRef.current);
    const next: AudioDoc = {
      ...draft,
      cues: draft.cues.map((c, i) => {
        const base =
          i === sel
            ? { ...c, promptJa: promptJaRef.current, promptEn: promptRef.current }
            : c;
        return migrateCueCandidates(base);
      }),
    };
    docRef.current = next;
    setDoc(next);
    const r = await api.saveCatalog('audio', next);
    setIssues(r.issues.filter((i) => i.catalog === 'audio'));
    setStatus(okMessage);
    return next;
  };

  const save = async () => {
    try {
      await commitCatalog((prev) => prev, 'audio.json を保存しました（候補履歴・プロンプト含む）');
    } catch (e) {
      setStatus(String((e as Error).message || e));
    }
  };

  const toggleCandidateActive = async (cand: AudioCandidate) => {
    if (!cue) return;
    const before = activeFilesOf(cue);
    const preview = toggleActiveFile(cue, cand.file);
    const after = activeFilesOf(preview);
    if (before.length === after.length && before.every((f, i) => f === after[i])) {
      setStatus('有効音声は最低1本必要です');
      return;
    }
    const added = after.includes(cand.file) && !before.includes(cand.file);
    const msg = added
      ? `有効に追加しました（${after.length}本 · ゲームはランダム選曲）: ${cand.file}`
      : `有効から外しました（残り ${after.length}本）: ${cand.file}`;
    try {
      setBusy(true);
      const sel = selectedRef.current;
      await commitCatalog(
        (prev) => {
          const cues = [...prev.cues];
          const cur = cues[sel];
          if (!cur) return prev;
          cues[sel] = toggleActiveFile(cur, cand.file);
          return { ...prev, cues };
        },
        msg,
      );
    } catch (e) {
      setStatus(String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  };

  const deleteCandidate = async (cand: AudioCandidate) => {
    if (!cue) return;
    if (isActiveFile(cue, cand.file)) {
      setStatus('有効中の候補は削除できません。先に有効解除してください');
      return;
    }
    if (
      !confirm(
        `候補を削除しますか？\nogg: ${cand.file}\n原盤: ${cand.originalFile || '（なし）'}\nStorage からも削除されます。`,
      )
    ) {
      return;
    }
    setBusy(true);
    setStatus('候補を削除中…');
    try {
      const paths = new Set<string>([cand.file]);
      if (cand.originalFile) paths.add(cand.originalFile);
      for (const p of paths) {
        try {
          await api.deleteAsset(p, 'project');
        } catch {
          /* missing file ok */
        }
      }
      const sel = selectedRef.current;
      await commitCatalog(
        (prev) => {
          const cues = [...prev.cues];
          const cur = cues[sel];
          if (!cur) return prev;
          cues[sel] = {
            ...cur,
            candidates: (cur.candidates ?? []).filter((c) => c.id !== cand.id),
          };
          return { ...prev, cues };
        },
        '候補を削除してクラウドに保存しました',
      );
    } catch (e) {
      setStatus(String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  };

  const ingestNormalized = async (input: {
    oggPath: string;
    originalPath: string;
    originalFormat: string;
    source: AudioCandidate['source'];
    provider?: AudioCandidateProvider;
    promptEn?: string;
    label?: string;
  }) => {
    const cand: AudioCandidate = {
      id: newCandidateId(),
      file: input.oggPath,
      originalFile: input.originalPath,
      originalFormat: input.originalFormat,
      source: input.source,
      createdAt: new Date().toISOString(),
      ...(input.provider ? { provider: input.provider } : {}),
      ...(input.label ? { label: input.label } : {}),
      ...(input.promptEn ? { promptEn: input.promptEn } : {}),
    };
    const sel = selectedRef.current;
    await commitCatalog(
      (prev) => {
        const cues = [...prev.cues];
        const cur = cues[sel];
        if (!cur) return prev;
        const withCand: Cue = {
          ...cur,
          candidates: [...(cur.candidates ?? []), cand],
        };
        // 新規候補は有効一覧に追加（既存の有効は維持 → 複数選曲可能）
        cues[sel] = withActiveFiles(withCand, [...activeFilesOf(withCand), cand.file]);
        return { ...prev, cues };
      },
      `候補を追加してクラウドに保存しました: ${input.oggPath}` +
        (input.originalPath !== input.oggPath
          ? `（原盤 ${input.originalPath}）`
          : '') +
        ' · 有効に追加済み（複数時はランダム）· リロードしても残ります',
    );
  };

  const runCueUpload = async (files: FileList | null) => {
    if (!files?.length || !cue) return;
    const file = files[0];
    const ext = extOf(file.name);
    const paths = suggestCandidatePaths(cue.kind, cue.code, ext);
    if (
      !confirm(
        `「${cue.code || cue.id}」へ手動アップロードします。\n原盤: ${paths.originalPath}\nゲーム用: ${paths.oggPath}\n（ogg に正規化し、原盤も保管）`,
      )
    ) {
      return;
    }
    setBusy(true);
    setStatus('アップロード＆ogg 正規化中…');
    try {
      await api.uploadAsset(
        paths.originalPath,
        file,
        file.type || guessContentType(paths.originalPath),
      );
      const norm = await api.normalizeProjectAudio({
        srcPath: paths.originalPath,
        destOggPath: paths.oggPath,
      });
      await ingestNormalized({
        oggPath: norm.path,
        originalPath: norm.originalPath,
        originalFormat: norm.originalFormat,
        source: 'manual',
        provider: 'flow-music',
        label: file.name,
        promptEn: prompt.trim() || undefined,
      });
    } catch (e) {
      setStatus(String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  };

  const runGenerate = async () => {
    if (!cue) return;
    const paths = suggestCandidatePaths(cue.kind, cue.code, 'mp3');
    if (
      !confirm(
        `AI 生成します。\nprovider: ${resolvedProvider}\n原盤: ${paths.originalPath}\nゲーム用: ${paths.oggPath}\n履歴に追加（上書きしません）。`,
      )
    ) {
      return;
    }
    setBusy(true);
    setStatus(`AI 生成中（${resolvedProvider}）… ogg 化まで数十秒かかることがあります`);
    try {
      const r = await api.generateProjectAudio({
        kind: cue.kind,
        prompt: prompt.trim() || undefined,
        destPath: paths.oggPath,
        code: cue.code,
        trigger: cue.trigger,
        noteJa: cue.noteJa,
        loop: cue.loop,
        durationSeconds,
        provider,
      });
      await ingestNormalized({
        oggPath: r.path,
        originalPath: r.originalPath || r.path,
        originalFormat: r.originalFormat || 'mp3',
        source: 'ai',
        provider: r.provider,
        label: `${r.provider} ${new Date().toLocaleString('ja-JP', { hour12: false })}`,
        promptEn: r.prompt || prompt.trim() || undefined,
      });
    } catch (e) {
      setStatus(String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  };

  const runPickerIngest = async (picked: string) => {
    if (!cue) return;
    setPickerOpen(false);
    const ext = extOf(picked) || 'ogg';
    const paths = suggestCandidatePaths(cue.kind, cue.code, ext);
    setBusy(true);
    setStatus('ピッカー素材を候補化・ogg 正規化中…');
    try {
      // Copy picked file bytes via download URL is hard; use normalize from picked path.
      // If already under audio/, normalize in place stem; else copy by reading isn't available.
      // Strategy: normalize from picked path to new ogg path; keep picked as original if different.
      const norm = await api.normalizeProjectAudio({
        srcPath: picked,
        destOggPath: paths.oggPath,
      });
      // If original is outside versioned stem, also keep reference to picked as originalFile
      await ingestNormalized({
        oggPath: norm.path,
        originalPath: norm.originalPath,
        originalFormat: norm.originalFormat,
        source: 'picker',
        provider: 'other',
        label: `picker ${picked.split('/').pop()}`,
      });
    } catch (e) {
      setStatus(String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <header>
        <PageDesc>
          キューへ音声を割当。生成・手動UP・有効化は自動でクラウド保存（保存ボタン不要）。ogg
          正規化＋原盤保管。
          {status ? ` ${status}` : ''}
        </PageDesc>
        <input
          ref={cueUploadRef}
          type="file"
          accept="audio/*,.ogg,.wav,.mp3,.m4a"
          className="hidden"
          onChange={(e) => {
            void runCueUpload(e.target.files);
            e.target.value = '';
          }}
        />
      </header>

      <div className="grid grid-cols-[280px_1fr] gap-4 min-h-[60vh]">
        <aside className="rounded-lg border border-[var(--line)] bg-[var(--panel)] overflow-auto">
          {doc.cues.map((c, i) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setSelected(i)}
              className={`w-full text-left px-3 py-2 text-sm border-b border-[var(--line)] ${
                selected === i ? 'bg-[var(--accent-soft)]' : 'hover:bg-[var(--hover)]'
              }`}
            >
              <div className="font-medium">
                {c.id}
                {c.code ? (
                  <span className="ml-1 font-normal text-[var(--muted)]">({c.code})</span>
                ) : null}
              </div>
              <div className="text-[10px] text-[var(--muted)]">
                {c.kind} / {c.trigger ?? '—'}{' '}
                {c.file
                  ? `· 候補 ${(c.candidates ?? []).length || 1}`
                  : '・未割当'}
              </div>
            </button>
          ))}
        </aside>

        <section className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4 space-y-3 max-w-2xl">
          {cue && (
            <>
              <label className="block text-sm">
                <span className="text-[var(--muted)]">id（管理番号）</span>
                <input
                  className="mt-1 w-full rounded border border-[var(--line)] px-2 py-1.5 font-mono text-sm bg-[var(--input-bg)]"
                  value={cue.id}
                  onChange={(e) => updateCue({ id: e.target.value })}
                />
              </label>
              <label className="block text-sm">
                <span className="text-[var(--muted)]">code（通称）</span>
                <input
                  className="mt-1 w-full rounded border border-[var(--line)] px-2 py-1.5 font-mono text-sm bg-[var(--input-bg)]"
                  value={cue.code ?? ''}
                  onChange={(e) => updateCue({ code: e.target.value })}
                />
              </label>
              <label className="block text-sm">
                <span className="text-[var(--muted)]">kind</span>
                <select
                  className="mt-1 w-full rounded border border-[var(--line)] px-2 py-1.5 bg-[var(--input-bg)]"
                  value={cue.kind}
                  onChange={(e) =>
                    updateCue({ kind: e.target.value as Cue['kind'] })
                  }
                >
                  <option value="bgm">bgm</option>
                  <option value="se">se</option>
                  <option value="ui">ui</option>
                  <option value="ambience">ambience</option>
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-[var(--muted)]">
                  有効 files（複数可 · ゲームはランダム選曲 · ogg）
                </span>
                <div className="mt-1 flex gap-2 flex-wrap">
                  <div className="flex-1 min-w-[12rem] rounded border border-[var(--line)] px-2 py-1.5 font-mono text-xs bg-[var(--input-bg)] space-y-0.5">
                    {activeFilesOf(cue).length === 0 ? (
                      <span className="text-[var(--muted)]">（未割当）</span>
                    ) : (
                      activeFilesOf(cue).map((f) => (
                        <div key={f} className="break-all">
                          {f}
                        </div>
                      ))
                    )}
                  </div>
                  <button
                    type="button"
                    className="px-3 py-1.5 rounded border border-[var(--line)] text-sm bg-[var(--input-bg)] shrink-0"
                    onClick={() => setPickerOpen(true)}
                  >
                    ライブラリから追加
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    className="px-3 py-1.5 rounded border border-[var(--line)] text-sm bg-[var(--input-bg)] shrink-0 disabled:opacity-50"
                    onClick={() => cueUploadRef.current?.click()}
                  >
                    このキューへ手動UP
                  </button>
                </div>
              </label>

              <div className="rounded-md border border-[var(--line)] p-3 space-y-2">
                <div className="text-sm font-medium">候補履歴（聞き比べ）</div>
                <p className="text-[11px] text-[var(--muted)]">
                  新しい順。「有効に追加」で複数選べます（ゲーム側は再生時にランダム）。原盤（wav/mp3
                  等）も保管されます。有効は最低1本必要です。
                </p>
                {candidates.length === 0 ? (
                  <p className="text-xs text-[var(--muted)]">まだ候補がありません</p>
                ) : (
                  <div className="space-y-2 max-h-[28rem] overflow-auto">
                    {candidates.map((cand) => {
                      const active = isActiveFile(cue, cand.file);
                      return (
                        <CandidateRow
                          key={cand.id}
                          cand={cand}
                          active={active}
                          busy={busy}
                          canDeactivate={activeFilesOf(cue).length > 1}
                          onToggle={() => void toggleCandidateActive(cand)}
                          onDelete={() => void deleteCandidate(cand)}
                        />
                      );
                    })}
                  </div>
                )}
              </div>

              <label className="block text-sm">
                <span className="text-[var(--muted)]">trigger</span>
                <input
                  className="mt-1 w-full rounded border border-[var(--line)] px-2 py-1.5 bg-[var(--input-bg)]"
                  value={cue.trigger ?? ''}
                  onChange={(e) => updateCue({ trigger: e.target.value })}
                />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(cue.loop)}
                  onChange={(e) => updateCue({ loop: e.target.checked })}
                />
                loop
              </label>
              <label className="block text-sm">
                <span className="text-[var(--muted)]">noteJa</span>
                <input
                  className="mt-1 w-full rounded border border-[var(--line)] px-2 py-1.5 bg-[var(--input-bg)]"
                  value={cue.noteJa ?? ''}
                  onChange={(e) => updateCue({ noteJa: e.target.value })}
                />
              </label>

              <div className="rounded-md border border-[var(--line)] bg-[var(--input-bg)]/40 p-3 space-y-2">
                <div className="text-sm font-medium">AI 生成</div>
                <p className="text-[11px] text-[var(--muted)] leading-relaxed">
                  生成結果は履歴に追加されます（上書きしません）。mp3 原盤 + ogg を保存します。
                </p>
                <label className="block text-sm">
                  <span className="text-[var(--muted)]">provider</span>
                  <select
                    className="mt-1 w-full rounded border border-[var(--line)] px-2 py-1.5 bg-[var(--panel)]"
                    value={provider}
                    onChange={(e) => setProvider(e.target.value as ProviderChoice)}
                  >
                    <option value="auto">auto（→ {resolvedProvider}）</option>
                    <option value="stable-audio">stable-audio（BGM 向け）</option>
                    <option value="elevenlabs">elevenlabs（SE/UI 向け）</option>
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="text-[var(--muted)]">
                    duration（秒）
                    {resolvedProvider === 'elevenlabs'
                      ? ' · ElevenLabs は 0.5–30'
                      : ' · Stable は 1–190'}
                  </span>
                  <input
                    type="number"
                    min={resolvedProvider === 'elevenlabs' ? 0.5 : 1}
                    max={resolvedProvider === 'elevenlabs' ? 30 : 190}
                    step={resolvedProvider === 'elevenlabs' ? 0.1 : 1}
                    className="mt-1 w-full rounded border border-[var(--line)] px-2 py-1.5 bg-[var(--panel)]"
                    value={durationSeconds}
                    onChange={(e) => setDurationSeconds(Number(e.target.value))}
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-[var(--muted)]">prompt（日本語）</span>
                  <textarea
                    rows={5}
                    className="mt-1 w-full rounded border border-[var(--line)] px-2 py-1.5 text-sm bg-[var(--panel)]"
                    value={promptJa}
                    onChange={(e) => {
                      setPromptJa(e.target.value);
                      updateCue({ promptJa: e.target.value });
                    }}
                  />
                  <p className="mt-1 text-[11px] text-[var(--muted)]">
                    「英語プロンプトに変換」で OpenAI 英訳
                    {translateStatus === 'translating' && ' · 変換中…'}
                    {translateStatus === 'ok' && ' · 変換済み'}
                    {translateStatus === 'error' && ` · 失敗: ${translateError}`}
                  </p>
                </label>
                <label className="block text-sm">
                  <span className="text-[var(--muted)]">prompt（英語）</span>
                  <textarea
                    rows={5}
                    className="mt-1 w-full rounded border border-[var(--line)] px-2 py-1.5 text-xs bg-[var(--panel)] font-mono"
                    value={prompt}
                    onChange={(e) => {
                      setPrompt(e.target.value);
                      updateCue({ promptEn: e.target.value });
                    }}
                  />
                  {resolvedProvider === 'elevenlabs' && (
                    <p
                      className={`mt-1 text-[11px] ${
                        prompt.trim().length > 450
                          ? 'text-[var(--warn)]'
                          : 'text-[var(--muted)]'
                      }`}
                    >
                      ElevenLabs 上限 450 文字 · 現在 {prompt.trim().length}
                      {prompt.trim().length > 450
                        ? '（送信時に自動短縮します。短く直すと品質が安定します）'
                        : ''}
                    </p>
                  )}
                </label>
                <div className="flex gap-2 flex-wrap">
                  <UiButton disabled={busy} onClick={() => seedPrompts(cue, true)}>
                    プロンプト初期化
                  </UiButton>
                  <UiButton
                    disabled={busy || translateStatus === 'translating' || !promptJa.trim()}
                    onClick={runTranslate}
                  >
                    英語プロンプトに変換
                  </UiButton>
                  <UiButton
                    disabled={busy || !prompt.trim()}
                    onClick={() => {
                      void navigator.clipboard.writeText(prompt).then(
                        () => setStatus('英語プロンプトをコピーしました（Flow Music 用）'),
                        () => setStatus('クリップボードへコピーできませんでした'),
                      );
                    }}
                  >
                    英語をコピー
                  </UiButton>
                  <UiButton variant="accent" disabled={busy} onClick={() => void save()}>
                    手動保存
                  </UiButton>
                  <UiButton variant="accent" disabled={busy} onClick={() => void runGenerate()}>
                    AI で生成して割当
                  </UiButton>
                </div>
              </div>
            </>
          )}
          {issues.length > 0 && (
            <ul className="text-xs text-[var(--warn)] space-y-1">
              {issues.map((i, idx) => (
                <li key={idx}>{i.message}</li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {pickerOpen && (
        <AudioPicker
          value={cue?.file}
          onPick={(path) => {
            void runPickerIngest(path);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}
