import { useEffect, useMemo, useState } from 'react';
import { api, type AssetEntry } from '../lib/api';
import { ensureAssetUrl, peekAssetUrl } from '../lib/assetUrlCache';

type Props = {
  value?: string;
  onPick: (path: string) => void;
  onClose: () => void;
};

export function AudioPicker({ value, onPick, onClose }: Props) {
  const [assets, setAssets] = useState<AssetEntry[]>([]);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('all');
  const [error, setError] = useState('');
  const [hover, setHover] = useState<string | null>(value ?? null);
  const [previewUrl, setPreviewUrl] = useState('');

  useEffect(() => {
    api
      .assets('audio')
      .then((r) => setAssets(r.assets.filter((a) => a.kind === 'audio')))
      .catch((e) => setError(String(e.message || e)));
  }, []);

  const categories = useMemo(() => {
    const set = new Set(assets.map((a) => a.category));
    return ['all', ...[...set].sort()];
  }, [assets]);

  const filtered = assets.filter((a) => {
    if (cat !== 'all' && a.category !== cat) return false;
    if (q && !a.relativePath.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  const previewPath = hover || value || null;

  useEffect(() => {
    if (!previewPath) {
      setPreviewUrl('');
      return;
    }
    const cached = peekAssetUrl(previewPath, 'project');
    if (cached) {
      setPreviewUrl(cached);
      return;
    }
    let cancelled = false;
    ensureAssetUrl(previewPath, 'project').then((url) => {
      if (!cancelled) setPreviewUrl(url ?? '');
    });
    return () => {
      cancelled = true;
    };
  }, [previewPath]);

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-[var(--panel)] rounded-lg border border-[var(--line)] w-full max-w-4xl h-[80vh] flex flex-col shadow-xl">
        <div className="flex items-center justify-between gap-3 p-4 border-b border-[var(--line)] shrink-0">
          <div>
            <h3 className="font-semibold">音声アセットを選択</h3>
            <p className="text-xs text-[var(--muted)]">
              project/assets/audio/ 配下。クリックで割当。
            </p>
          </div>
          <button
            type="button"
            className="px-3 py-1.5 rounded border border-[var(--line)] text-sm bg-[var(--input-bg)]"
            onClick={onClose}
          >
            閉じる
          </button>
        </div>
        <div className="p-3 flex gap-2 border-b border-[var(--line)] shrink-0">
          <input
            className="flex-1 rounded border border-[var(--line)] px-3 py-1.5 text-sm bg-[var(--input-bg)]"
            placeholder="検索..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select
            className="rounded border border-[var(--line)] px-2 py-1.5 text-sm bg-[var(--input-bg)]"
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
        {error && <p className="p-3 text-sm text-[var(--danger)]">{error}</p>}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <div className="overflow-auto p-3 flex-1 space-y-1">
            {filtered.length === 0 && (
              <p className="text-sm text-[var(--muted)] p-2">
                音声ファイルがありません。先に「素材を追加」でアップロードしてください。
              </p>
            )}
            {filtered.map((a) => {
              const selected = value === a.relativePath;
              const active = hover === a.relativePath;
              return (
                <button
                  key={a.relativePath}
                  type="button"
                  onMouseEnter={() => setHover(a.relativePath)}
                  onClick={() => onPick(a.relativePath)}
                  className={`w-full text-left rounded border px-3 py-2 ${
                    selected || active
                      ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                      : 'border-[var(--line)] bg-[var(--input-bg)] hover:border-[var(--accent)]'
                  }`}
                >
                  <div className="text-sm font-medium break-all">{a.name}</div>
                  <div className="text-[10px] font-mono text-[var(--muted)] break-all">
                    {a.relativePath}
                  </div>
                </button>
              );
            })}
          </div>
          <aside className="w-72 shrink-0 border-l border-[var(--line)] p-4 overflow-auto">
            <h4 className="text-sm font-medium mb-2">プレビュー</h4>
            {previewPath && previewUrl ? (
              <>
                <audio key={previewUrl} controls className="w-full" src={previewUrl} />
                <p className="mt-2 text-[10px] font-mono break-all text-[var(--muted)]">
                  {previewPath}
                </p>
              </>
            ) : previewPath ? (
              <p className="text-xs text-[var(--muted)]">読み込み中…</p>
            ) : (
              <p className="text-xs text-[var(--muted)]">行にマウスを乗せてください</p>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
