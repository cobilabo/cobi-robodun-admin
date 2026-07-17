import { useEffect, useState } from 'react';
import { api, type Issue } from '../lib/api';

type Cue = {
  id: string;
  kind: 'bgm' | 'se' | 'ui' | 'ambience';
  file?: string;
  loop?: boolean;
  trigger?: string;
  noteJa?: string;
};

type AudioDoc = { version: number; cues: Cue[] };

const DEFAULT_CUES: Cue[] = [
  { id: 'bgm_title', kind: 'bgm', loop: true, trigger: 'Title', noteJa: 'タイトル' },
  { id: 'bgm_battle', kind: 'bgm', loop: true, trigger: 'Battle', noteJa: '戦闘' },
  { id: 'bgm_boss', kind: 'bgm', loop: true, trigger: 'Boss', noteJa: 'ボス' },
  { id: 'bgm_gameover', kind: 'bgm', loop: false, trigger: 'GameOver', noteJa: 'ゲームオーバー' },
  { id: 'se_match', kind: 'se', trigger: 'MatchClear', noteJa: 'マッチ成立' },
  { id: 'se_clear', kind: 'se', trigger: 'TileClear', noteJa: '消去' },
  { id: 'se_hit', kind: 'se', trigger: 'Hit', noteJa: '着弾' },
  { id: 'se_player_hit', kind: 'se', trigger: 'PlayerHit', noteJa: '被弾' },
  { id: 'ui_ok', kind: 'ui', trigger: 'UiConfirm', noteJa: '決定' },
  { id: 'ui_back', kind: 'ui', trigger: 'UiBack', noteJa: '戻る' },
];

export function AudioPage() {
  const [doc, setDoc] = useState<AudioDoc>({ version: 1, cues: DEFAULT_CUES });
  const [status, setStatus] = useState('');
  const [issues, setIssues] = useState<Issue[]>([]);
  const [selected, setSelected] = useState(0);

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
      setStatus('audio.json を保存しました（再生はゲーム側スタブ段階）');
    } catch (e) {
      setStatus(String((e as Error).message || e));
    }
  };

  const seed = () => {
    setDoc({ version: 1, cues: DEFAULT_CUES });
    setSelected(0);
    setStatus('Must テンプレを読み込みました（未保存）');
  };

  return (
    <div className="space-y-4">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">音声割当</h2>
          <p className="text-sm text-[var(--muted)]">
            data/audio.json。ファイルは assets/audio/ へ配置。{status}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={seed}
            className="px-3 py-1.5 rounded border border-[var(--line)] text-sm bg-white"
          >
            Must テンプレ
          </button>
          <button
            type="button"
            onClick={save}
            className="px-3 py-1.5 rounded text-sm bg-[var(--accent)] text-white"
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
                selected === i ? 'bg-[var(--accent-soft)]' : 'hover:bg-black/5'
              }`}
            >
              <div className="font-medium">{c.id}</div>
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
                <span className="text-[var(--muted)]">id</span>
                <input
                  className="mt-1 w-full rounded border border-[var(--line)] px-2 py-1.5 font-mono text-sm"
                  value={cue.id}
                  onChange={(e) => updateCue({ id: e.target.value })}
                />
              </label>
              <label className="block text-sm">
                <span className="text-[var(--muted)]">kind</span>
                <select
                  className="mt-1 w-full rounded border border-[var(--line)] px-2 py-1.5"
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
                <input
                  className="mt-1 w-full rounded border border-[var(--line)] px-2 py-1.5 font-mono text-xs"
                  placeholder="audio/bgm/battle.ogg"
                  value={cue.file ?? ''}
                  onChange={(e) => updateCue({ file: e.target.value })}
                />
              </label>
              <label className="block text-sm">
                <span className="text-[var(--muted)]">trigger</span>
                <input
                  className="mt-1 w-full rounded border border-[var(--line)] px-2 py-1.5"
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
                  className="mt-1 w-full rounded border border-[var(--line)] px-2 py-1.5"
                  value={cue.noteJa ?? ''}
                  onChange={(e) => updateCue({ noteJa: e.target.value })}
                />
              </label>
              {cue.file && (
                <audio
                  controls
                  className="w-full mt-2"
                  src={`/api/asset-file?path=${encodeURIComponent(cue.file)}`}
                />
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
    </div>
  );
}
