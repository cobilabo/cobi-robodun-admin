import { useEffect, useMemo, useState } from 'react';
import { api, type AssetEntry } from '../lib/api';
import {
  libraryPathToProjectPath,
  projectPathToLibraryPath,
} from '../lib/assetCategory';
import { AlphaBoundsPreview } from './AlphaBoundsPreview';
import { LazyAssetThumb } from './LazyAssetThumb';
import { ensureAssetUrl, peekAssetUrl } from '../lib/assetUrlCache';
import { PageDesc, UiButton, UiInput, UiSelect } from './ui';

type Props = {
  /** カタログに保存されているプロジェクト側パス（UI/...） */
  value?: string;
  /** 取込後のプロジェクトパスを返す */
  onPick: (projectPath: string) => void;
  onClose: () => void;
  preferCategory?: string;
};

export function AssetPicker({ value, onPick, onClose, preferCategory }: Props) {
  const [assets, setAssets] = useState<AssetEntry[]>([]);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState(preferCategory ?? 'all');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [hover, setHover] = useState<string | null>(
    () => projectPathToLibraryPath(value ?? '') ?? null,
  );
  const [previewSrc, setPreviewSrc] = useState('');

  const selectedLibrary = projectPathToLibraryPath(value ?? '') ?? '';

  useEffect(() => {
    api
      .library()
      .then((r) => setAssets(r.assets.filter((a) => a.kind === 'image')))
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

  const previewPath = hover || selectedLibrary || null;

  useEffect(() => {
    if (!previewPath) {
      setPreviewSrc('');
      return;
    }
    const cached = peekAssetUrl(previewPath, 'library');
    if (cached) {
      setPreviewSrc(cached);
      return;
    }
    let cancelled = false;
    ensureAssetUrl(previewPath, 'library').then((url) => {
      if (!cancelled && url) setPreviewSrc(url);
    });
    return () => {
      cancelled = true;
    };
  }, [previewPath]);

  const pickLibrary = async (libraryPath: string) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const dest = libraryPathToProjectPath(libraryPath);
      const r = await api.importAsset(libraryPath, dest);
      onPick(r.path);
    } catch (e) {
      setError(String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-[var(--panel)] rounded-lg border border-[var(--line)] w-full max-w-6xl h-[85vh] flex flex-col shadow-xl">
        <div className="flex items-center justify-between gap-3 p-4 border-b border-[var(--line)] shrink-0">
          <div>
            <h3 className="font-semibold text-sm">ライブラリから選択</h3>
            <PageDesc>
              選ぶとプロジェクト（UI/同カテゴリ）へ取り込み、カタログにはプロジェクトパスを保存します。
            </PageDesc>
          </div>
          <UiButton onClick={onClose} disabled={busy}>
            閉じる
          </UiButton>
        </div>
        <div className="p-3 flex gap-1.5 border-b border-[var(--line)] shrink-0">
          <UiInput
            className="flex-1"
            placeholder="検索..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            disabled={busy}
          />
          <UiSelect
            value={cat}
            onChange={(e) => setCat(e.target.value)}
            disabled={busy}
          >
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </UiSelect>
        </div>
        {busy && (
          <p className="px-3 pt-2 text-sm text-[var(--accent)]">取込中…</p>
        )}
        {error && <p className="p-3 text-sm text-[var(--danger)]">{error}</p>}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <div className="overflow-auto p-3 grid grid-cols-3 md:grid-cols-4 gap-2 flex-1 content-start">
            {filtered.map((a) => {
              const selected = selectedLibrary === a.relativePath;
              return (
                <button
                  key={a.relativePath}
                  type="button"
                  disabled={busy}
                  onMouseEnter={() => setHover(a.relativePath)}
                  onClick={() => void pickLibrary(a.relativePath)}
                  className={`rounded border p-2 text-left hover:border-[var(--accent)] disabled:opacity-60 ${
                    selected
                      ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                      : 'border-[var(--line)] bg-[var(--input-bg)]'
                  }`}
                >
                  <LazyAssetThumb
                    relativePath={a.relativePath}
                    source="library"
                    initialUrl={a.url || peekAssetUrl(a.relativePath, 'library')}
                  />
                  <div className="text-[10px] leading-tight break-all text-[var(--muted)]">
                    {a.name}
                  </div>
                </button>
              );
            })}
          </div>
          <aside className="w-[380px] shrink-0 border-l border-[var(--line)] p-4 overflow-auto">
            <h4 className="text-sm font-medium mb-3">透明余白プレビュー</h4>
            {previewPath && previewSrc ? (
              <AlphaBoundsPreview
                src={previewSrc}
                cacheKey={`library:${previewPath}`}
                maxSide={360}
              />
            ) : previewPath ? (
              <p className="text-xs text-[var(--muted)]">読み込み中…</p>
            ) : (
              <p className="text-xs text-[var(--muted)]">
                画像にマウスを乗せてください
              </p>
            )}
            {previewPath && (
              <p className="mt-2 text-[10px] font-mono break-all text-[var(--muted)]">
                ライブラリ: {previewPath}
                <br />
                → 取込先: {libraryPathToProjectPath(previewPath)}
              </p>
            )}
            {value && (
              <p className="mt-2 text-[10px] font-mono break-all text-[var(--muted)]">
                現在のカタログ値: {value}
              </p>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
