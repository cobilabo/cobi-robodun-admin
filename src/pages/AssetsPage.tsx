import { useEffect, useMemo, useState } from 'react';
import {
  api,
  assetUrl,
  libraryUrl,
  type AssetEntry,
} from '../lib/api';

export function AssetsPage() {
  const [tab, setTab] = useState<'project' | 'library'>('project');
  const [project, setProject] = useState<AssetEntry[]>([]);
  const [library, setLibrary] = useState<AssetEntry[]>([]);
  const [libRoot, setLibRoot] = useState<string | null>(null);
  const [cat, setCat] = useState('all');
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<AssetEntry | null>(null);
  const [destPath, setDestPath] = useState('UI/enemies/imported.png');
  const [msg, setMsg] = useState('');

  const refresh = async () => {
    const [a, l] = await Promise.all([api.assets(), api.library()]);
    setProject(a.assets);
    setLibrary(l.assets);
    setLibRoot(l.libraryRoot);
  };

  useEffect(() => {
    refresh().catch((e) => setMsg(String(e.message || e)));
  }, []);

  const list = tab === 'project' ? project : library;
  const categories = useMemo(() => {
    const set = new Set(list.map((a) => a.category));
    return ['all', ...[...set].sort()];
  }, [list]);

  const filtered = list.filter((a) => {
    if (a.kind !== 'image' && tab === 'library') return false;
    if (cat !== 'all' && a.category !== cat) return false;
    if (q && !a.relativePath.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  const trimSelected = async () => {
    if (!selected) return;
    try {
      const r = await api.trimAsset(
        selected.relativePath,
        tab === 'library' ? 'library' : 'project',
      );
      setMsg(
        r.trimmed
          ? `トリム完了 ${r.before.width}x${r.before.height} → ${r.after.width}x${r.after.height}`
          : '余白なし（変更なし）',
      );
      await refresh();
    } catch (e) {
      setMsg(String((e as Error).message || e));
    }
  };

  const importSelected = async () => {
    if (!selected || tab !== 'library') return;
    try {
      const r = await api.importAsset(selected.relativePath, destPath);
      setMsg(`取込完了: ${r.path}`);
      setTab('project');
      await refresh();
    } catch (e) {
      setMsg(String((e as Error).message || e));
    }
  };

  return (
    <div className="space-y-4">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">アセット</h2>
          <p className="text-sm text-[var(--muted)]">
            プロジェクト（正本）と外部ライブラリの 2 層。{msg}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className={`px-3 py-1.5 rounded text-sm border ${
              tab === 'project'
                ? 'bg-[var(--accent)] text-white border-transparent'
                : 'border-[var(--line)] bg-white'
            }`}
            onClick={() => setTab('project')}
          >
            プロジェクト
          </button>
          <button
            type="button"
            className={`px-3 py-1.5 rounded text-sm border ${
              tab === 'library'
                ? 'bg-[var(--accent)] text-white border-transparent'
                : 'border-[var(--line)] bg-white'
            }`}
            onClick={() => setTab('library')}
          >
            ライブラリ
          </button>
        </div>
      </header>

      {tab === 'library' && (
        <p className="text-xs text-[var(--muted)] font-mono">
          LIBRARY_ROOT: {libRoot ?? '（未設定）'}
        </p>
      )}

      <div className="flex gap-2">
        <input
          className="flex-1 rounded border border-[var(--line)] px-3 py-1.5 text-sm bg-white"
          placeholder="検索..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          className="rounded border border-[var(--line)] px-2 py-1.5 text-sm bg-white"
          value={cat}
          onChange={(e) => setCat(e.target.value)}
        >
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-[1fr_280px] gap-4 min-h-[60vh]">
        <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-3 overflow-auto grid grid-cols-4 md:grid-cols-6 gap-2 content-start">
          {filtered.slice(0, 300).map((a) => (
            <button
              key={a.relativePath}
              type="button"
              onClick={() => {
                setSelected(a);
                if (tab === 'library') {
                  const name = a.name.replace(/\s+/g, '_');
                  setDestPath(`UI/enemies/${name}`);
                }
              }}
              className={`rounded border p-2 text-left ${
                selected?.relativePath === a.relativePath
                  ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                  : 'border-[var(--line)] bg-white'
              }`}
            >
              <div className="aspect-square bg-[#efe9df] rounded flex items-center justify-center overflow-hidden mb-1">
                {a.kind === 'image' ? (
                  <img
                    src={
                      tab === 'project'
                        ? assetUrl(a.relativePath)
                        : libraryUrl(a.relativePath)
                    }
                    alt=""
                    className="max-w-full max-h-full object-contain"
                    style={{ imageRendering: 'pixelated' }}
                  />
                ) : (
                  <span className="text-xs text-[var(--muted)]">{a.kind}</span>
                )}
              </div>
              <div className="text-[10px] break-all text-[var(--muted)]">
                {a.name}
              </div>
            </button>
          ))}
        </div>

        <aside className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4 space-y-3">
          <h3 className="font-medium">選択中</h3>
          {!selected && (
            <p className="text-sm text-[var(--muted)]">画像を選択してください</p>
          )}
          {selected && (
            <>
              <div className="aspect-square bg-[#efe9df] rounded border border-[var(--line)] flex items-center justify-center overflow-hidden">
                <img
                  src={
                    tab === 'project'
                      ? assetUrl(selected.relativePath)
                      : libraryUrl(selected.relativePath)
                  }
                  alt=""
                  className="max-w-full max-h-full object-contain"
                  style={{ imageRendering: 'pixelated' }}
                />
              </div>
              <p className="text-xs font-mono break-all text-[var(--muted)]">
                {selected.relativePath}
              </p>
              <button
                type="button"
                onClick={trimSelected}
                className="w-full px-3 py-2 rounded bg-[var(--accent)] text-white text-sm"
              >
                透過余白をトリム
              </button>
              {tab === 'library' && (
                <>
                  <label className="block text-xs text-[var(--muted)]">
                    取込先（assets 相対）
                    <input
                      className="mt-1 w-full rounded border border-[var(--line)] px-2 py-1.5 font-mono text-xs"
                      value={destPath}
                      onChange={(e) => setDestPath(e.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={importSelected}
                    className="w-full px-3 py-2 rounded border border-[var(--line)] text-sm bg-white"
                  >
                    プロジェクトへ取込
                  </button>
                </>
              )}
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
