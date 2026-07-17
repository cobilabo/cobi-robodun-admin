import { useEffect, useMemo, useState } from 'react';
import { api, assetUrl, type AssetEntry } from '../lib/api';

type Props = {
  value?: string;
  onPick: (path: string) => void;
  onClose: () => void;
  preferCategory?: string;
};

export function AssetPicker({ value, onPick, onClose, preferCategory }: Props) {
  const [assets, setAssets] = useState<AssetEntry[]>([]);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState(preferCategory ?? 'all');
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .assets('UI')
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

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-[var(--panel)] rounded-lg border border-[var(--line)] w-full max-w-4xl max-h-[85vh] flex flex-col shadow-xl">
        <div className="flex items-center justify-between gap-3 p-4 border-b border-[var(--line)]">
          <div>
            <h3 className="font-semibold">プロジェクトアセットを選択</h3>
            <p className="text-xs text-[var(--muted)]">assets/UI 配下（取込済み）</p>
          </div>
          <button
            type="button"
            className="px-3 py-1.5 rounded border border-[var(--line)] text-sm"
            onClick={onClose}
          >
            閉じる
          </button>
        </div>
        <div className="p-3 flex gap-2 border-b border-[var(--line)]">
          <input
            className="flex-1 rounded border border-[var(--line)] px-3 py-1.5 text-sm"
            placeholder="検索..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select
            className="rounded border border-[var(--line)] px-2 py-1.5 text-sm"
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
        <div className="overflow-auto p-3 grid grid-cols-4 md:grid-cols-6 gap-2">
          {filtered.map((a) => {
            const selected = value === a.relativePath;
            return (
              <button
                key={a.relativePath}
                type="button"
                onClick={() => onPick(a.relativePath)}
                className={`rounded border p-2 text-left hover:border-[var(--accent)] ${
                  selected
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                    : 'border-[var(--line)] bg-white'
                }`}
              >
                <div className="aspect-square bg-[#f0ebe3] rounded flex items-center justify-center overflow-hidden mb-1">
                  <img
                    src={assetUrl(a.relativePath)}
                    alt=""
                    className="max-w-full max-h-full object-contain"
                    style={{ imageRendering: 'pixelated' }}
                  />
                </div>
                <div className="text-[10px] leading-tight break-all text-[var(--muted)]">
                  {a.name}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
