import { useEffect, useRef, useState } from 'react';
import { api, type Issue } from '../lib/api';
import { AudioPicker } from '../components/AudioPicker';
import { ensureAssetUrl, peekAssetUrl } from '../lib/assetUrlCache';
import { collectAudioUploads } from '../lib/audioUpload';

type Cue = {
  id: string;
  code?: string;
  kind: 'bgm' | 'se' | 'ui' | 'ambience';
  file?: string;
  loop?: boolean;
  trigger?: string;
  noteJa?: string;
};

type AudioDoc = { version: number; cues: Cue[] };

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

const UPLOAD_CONCURRENCY = 4;

export function AudioPage() {
  const [doc, setDoc] = useState<AudioDoc>({ version: 1, cues: DEFAULT_CUES });
  const [status, setStatus] = useState('');
  const [issues, setIssues] = useState<Issue[]>([]);
  const [selected, setSelected] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const uploadRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api
      .getCatalog('audio')
      .then((r) => {
        const data = r.data as AudioDoc;
        if (data?.cues?.length) setDoc({ version: data.version ?? 1, cues: data.cues });
        else setDoc({ version: 1, cues: DEFAULT_CUES });
      })
      .catch((e) => setStatus(String(e.message || e)));
  }, []);

  const cue = doc.cues[selected];
  const filePath = cue?.file?.trim() || '';

  useEffect(() => {
    if (!filePath) {
      setPreviewUrl('');
      return;
    }
    const cached = peekAssetUrl(filePath, 'project');
    if (cached) {
      setPreviewUrl(cached);
      return;
    }
    let cancelled = false;
    ensureAssetUrl(filePath, 'project').then((url) => {
      if (!cancelled) setPreviewUrl(url ?? '');
    });
    return () => {
      cancelled = true;
    };
  }, [filePath]);

  const updateCue = (patch: Partial<Cue>) => {
    setDoc((prev) => {
      const cues = [...prev.cues];
      cues[selected] = { ...cues[selected], ...patch };
      return { ...prev, cues };
    });
  };

  const save = async () => {
    try {
      const r = await api.saveCatalog('audio', doc);
      setIssues(r.issues.filter((i) => i.catalog === 'audio'));
      setStatus('audio.json を保存しました');
    } catch (e) {
      setStatus(String((e as Error).message || e));
    }
  };

  const seed = () => {
    setDoc({ version: 1, cues: DEFAULT_CUES });
    setSelected(0);
    setStatus('Must テンプレを読み込みました（未保存）');
  };

  const runUpload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    setStatus('アップロード内容を解析中…');
    try {
      const items = await collectAudioUploads(files);
      if (items.length === 0) {
        setStatus('音声ファイルがありません（ogg/wav/mp3/m4a、またはそれらを含む ZIP）');
        return;
      }
      if (
        !confirm(
          `${items.length} 件を assets/audio/ へアップロードします。同名は上書きされます。よろしいですか？`,
        )
      ) {
        return;
      }
      let done = 0;
      let failed = 0;
      let cursor = 0;
      const worker = async () => {
        while (cursor < items.length) {
          const idx = cursor++;
          const item = items[idx];
          try {
            await api.uploadAsset(item.relativePath, item.blob, item.contentType);
            done++;
          } catch {
            failed++;
          }
          setStatus(`アップロード中 ${done + failed}/${items.length}…`);
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(UPLOAD_CONCURRENCY, items.length) }, () =>
          worker(),
        ),
      );
      setStatus(
        `アップロード完了: 成功 ${done}` + (failed ? ` / 失敗 ${failed}` : ''),
      );
    } catch (e) {
      setStatus(String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <header className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">音声割当</h2>
          <p className="text-sm text-[var(--muted)]">
            キューに音声ファイルを割り当てます。ファイルは assets/audio/ に保存。{status}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <input
            ref={uploadRef}
            type="file"
            accept="audio/*,.ogg,.wav,.mp3,.m4a,.zip,application/zip"
            multiple
            className="hidden"
            onChange={(e) => {
              void runUpload(e.target.files);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => uploadRef.current?.click()}
            className="px-3 py-1.5 rounded border border-[var(--line)] text-sm bg-[var(--input-bg)] disabled:opacity-40"
          >
            素材を追加
          </button>
          <button
            type="button"
            onClick={seed}
            className="px-3 py-1.5 rounded border border-[var(--line)] text-sm bg-[var(--input-bg)]"
          >
            Must テンプレ
          </button>
          <button
            type="button"
            onClick={save}
            className="px-3 py-1.5 rounded text-sm bg-[var(--accent)] text-[var(--bg)]"
          >
            保存
          </button>
        </div>
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
                {c.kind} / {c.trigger ?? '—'} {c.file ? '' : '・未割当'}
              </div>
            </button>
          ))}
        </aside>

        <section className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4 space-y-3 max-w-xl">
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
                <span className="text-[var(--muted)]">file（assets 相対）</span>
                <div className="mt-1 flex gap-2">
                  <input
                    className="flex-1 rounded border border-[var(--line)] px-2 py-1.5 font-mono text-xs bg-[var(--input-bg)]"
                    placeholder="audio/bgm/battle.ogg"
                    value={cue.file ?? ''}
                    onChange={(e) => updateCue({ file: e.target.value })}
                  />
                  <button
                    type="button"
                    className="px-3 py-1.5 rounded border border-[var(--line)] text-sm bg-[var(--input-bg)] shrink-0"
                    onClick={() => setPickerOpen(true)}
                  >
                    選択
                  </button>
                </div>
              </label>
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
              {filePath && previewUrl && (
                <audio key={previewUrl} controls className="w-full mt-2" src={previewUrl} />
              )}
              {filePath && !previewUrl && (
                <p className="text-xs text-[var(--muted)]">プレビュー読み込み中…</p>
              )}
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
            updateCue({ file: path });
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}
