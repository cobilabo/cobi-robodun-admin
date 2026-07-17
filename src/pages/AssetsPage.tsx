import { useEffect, useMemo, useRef, useState } from 'react';
import {
  api,
  assetUrl,
  libraryUrl,
  type AssetEntry,
} from '../lib/api';
import { AlphaBoundsPreview } from '../components/AlphaBoundsPreview';
import { LazyAssetThumb } from '../components/LazyAssetThumb';
import { ensureAssetUrl, peekAssetUrl, putAssetUrl } from '../lib/assetUrlCache';
import {
  collectFromDataTransfer,
  collectUploadItems,
  type LibraryUploadItem,
} from '../lib/libraryUpload';
import { usePersistedWidth } from '../hooks/usePersistedWidth';
import { countAssetRefs } from '../lib/catalogRefs';
import { CATALOG_IDS } from '../lib/validateContent';

const PAGE_SIZE = 48;
const UPLOAD_CONCURRENCY = 6;
const IMPORT_CONCURRENCY = 4;
const PREVIEW_WIDTH_KEY = 'robodun-admin.assets.previewWidth';

export function AssetsPage() {
  const [tab, setTab] = useState<'project' | 'library'>('project');
  const [project, setProject] = useState<AssetEntry[]>([]);
  const [library, setLibrary] = useState<AssetEntry[]>([]);
  const [libRoot, setLibRoot] = useState<string | null>(null);
  const [libraryLoaded, setLibraryLoaded] = useState(false);
  const [refCounts, setRefCounts] = useState<Map<string, number>>(new Map());
  const [usageFilter, setUsageFilter] = useState<'all' | 'used' | 'unused'>('all');
  const [cat, setCat] = useState('all');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<AssetEntry | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [destPath, setDestPath] = useState('UI/imported/item.png');
  const [importRoot, setImportRoot] = useState('UI/imported');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [listBusy, setListBusy] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);
  const [uploadPct, setUploadPct] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const {
    width: previewWidth,
    onPointerDown: onResizeDown,
    onPointerMove: onResizeMove,
    onPointerUp: onResizeUp,
  } = usePersistedWidth(PREVIEW_WIDTH_KEY, {
    initial: 320,
    min: 240,
    max: 720,
  });

  const loadRefCounts = async () => {
    const catalogs: Record<string, unknown> = {};
    await Promise.all(
      CATALOG_IDS.map(async (id) => {
        const r = await api.getCatalog(id);
        catalogs[id] = r.data;
      }),
    );
    setRefCounts(countAssetRefs(catalogs));
  };

  const loadProject = async () => {
    const a = await api.assets();
    setProject(a.assets);
    for (const e of a.assets) {
      if (e.url) putAssetUrl(e.relativePath, 'project', e.url);
    }
    await loadRefCounts().catch(() => undefined);
  };

  const loadLibrary = async () => {
    setListBusy(true);
    try {
      const l = await api.library();
      setLibrary(l.assets);
      setLibRoot(l.libraryRoot);
      setLibraryLoaded(true);
      for (const e of l.assets) {
        if (e.url) putAssetUrl(e.relativePath, 'library', e.url);
      }
    } finally {
      setListBusy(false);
    }
  };

  const refresh = async () => {
    setListBusy(true);
    try {
      await loadProject();
      if (tab === 'library' || libraryLoaded) await loadLibrary();
      setPreviewKey((k) => k + 1);
    } finally {
      setListBusy(false);
    }
  };

  useEffect(() => {
    loadProject().catch((e) => setMsg(String(e.message || e)));
  }, []);

  useEffect(() => {
    if (tab !== 'library' || libraryLoaded) return;
    loadLibrary().catch((e) => setMsg(String(e.message || e)));
  }, [tab, libraryLoaded]);

  useEffect(() => {
    setChecked(new Set());
    setSelected(null);
    setPage(1);
  }, [tab, cat, q, usageFilter]);

  const list = tab === 'project' ? project : library;
  const source = tab === 'library' ? 'library' : 'project';

  const categories = useMemo(() => {
    const set = new Set(list.map((a) => a.category));
    return ['all', ...[...set].sort()];
  }, [list]);

  const unusedCount = useMemo(() => {
    if (tab !== 'project') return 0;
    return project.filter(
      (a) => a.kind === 'image' && (refCounts.get(a.relativePath) ?? 0) === 0,
    ).length;
  }, [tab, project, refCounts]);

  const filtered = useMemo(() => {
    const qLower = q.toLowerCase();
    return list.filter((a) => {
      if (a.kind !== 'image') return false;
      if (cat !== 'all' && a.category !== cat) return false;
      if (qLower && !a.relativePath.toLowerCase().includes(qLower)) return false;
      if (tab === 'project') {
        const n = refCounts.get(a.relativePath) ?? 0;
        if (usageFilter === 'used' && n === 0) return false;
        if (usageFilter === 'unused' && n > 0) return false;
      }
      return true;
    });
  }, [list, cat, q, tab, usageFilter, refCounts]);

  const visibleImages = filtered.slice(0, page * PAGE_SIZE);
  const hasMore = visibleImages.length < filtered.length;

  useEffect(() => {
    const root = scrollRef.current;
    const sentinel = sentinelRef.current;
    if (!root || !sentinel || !hasMore) return;

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setPage((p) => p + 1);
        }
      },
      { root, rootMargin: '320px', threshold: 0 },
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, [hasMore, page, visibleImages.length, filtered.length, tab, cat, q]);

  const libraryDestFor = (libraryPath: string) => {
    const root = importRoot.replace(/\\/g, '/').replace(/\/+$/, '');
    const rel = libraryPath.replace(/\\/g, '/').replace(/^\/+/, '');
    return root ? `${root}/${rel}` : rel;
  };

  const selectAsset = async (a: AssetEntry) => {
    const cached = a.url || peekAssetUrl(a.relativePath, source);
    const next = cached ? { ...a, url: cached } : a;
    setSelected(next);
    if (tab === 'library') {
      setDestPath(libraryDestFor(a.relativePath));
    }
    if (!next.url) {
      const url = await ensureAssetUrl(a.relativePath, source);
      if (url) {
        setSelected((prev) =>
          prev?.relativePath === a.relativePath ? { ...prev, url } : prev,
        );
      }
    }
  };

  const toggleCheck = (rel: string, on?: boolean) => {
    setChecked((prev) => {
      const next = new Set(prev);
      const enable = on ?? !next.has(rel);
      if (enable) next.add(rel);
      else next.delete(rel);
      return next;
    });
  };

  const selectAllVisible = () => {
    setChecked(new Set(visibleImages.map((a) => a.relativePath)));
  };

  const clearChecked = () => setChecked(new Set());

  const runTrim = async (paths: string[]) => {
    if (paths.length === 0 || tab === 'library') return;
    if (
      !confirm(
        `${paths.length} 件の画像の透過余白をトリムします。上書きされます。よろしいですか？`,
      )
    ) {
      return;
    }
    setBusy(true);
    setMsg('トリム中...');
    try {
      const r = await api.trimBatch(paths, source);
      setMsg(
        `トリム完了: 変更 ${r.trimmedCount} / 余白なし ${r.unchangedCount}` +
          (r.failedCount ? ` / 失敗 ${r.failedCount}` : ''),
      );
      await refresh();
    } catch (e) {
      setMsg(String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  };

  const trimChecked = () => runTrim([...checked]);
  const trimAllVisible = () =>
    runTrim(visibleImages.map((a) => a.relativePath));
  const trimSelectedOne = () => {
    if (!selected) return;
    runTrim([selected.relativePath]);
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

  const importChecked = async () => {
    if (tab !== 'library' || checked.size === 0) return;
    const paths = [...checked];
    if (
      !confirm(
        `${paths.length} 件をプロジェクトへ取り込みます。\n先頭パス: ${importRoot}/\n同名は上書きされます。よろしいですか？`,
      )
    ) {
      return;
    }
    setBusy(true);
    let done = 0;
    let failed = 0;
    let cursor = 0;
    const errors: string[] = [];
    const worker = async () => {
      while (cursor < paths.length) {
        const idx = cursor++;
        const libPath = paths[idx];
        const dest = libraryDestFor(libPath);
        try {
          await api.importAsset(libPath, dest);
          done++;
        } catch (e) {
          failed++;
          if (errors.length < 5) {
            errors.push(`${libPath}: ${(e as Error).message || e}`);
          }
        }
        setMsg(`取込中 ${done + failed}/${paths.length}…`);
      }
    };
    try {
      await Promise.all(
        Array.from(
          { length: Math.min(IMPORT_CONCURRENCY, paths.length) },
          () => worker(),
        ),
      );
      setMsg(
        `一括取込完了: 成功 ${done}` +
          (failed ? ` / 失敗 ${failed}` : '') +
          (errors.length ? `（例: ${errors[0]}）` : ''),
      );
      setChecked(new Set());
      setTab('project');
      await refresh();
    } catch (e) {
      setMsg(String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  };

  const runLibraryUpload = async (items: LibraryUploadItem[]) => {
    if (items.length === 0) {
      setMsg('アップロード対象の画像がありません（png/jpg/webp/gif）');
      return;
    }
    if (
      !confirm(
        `${items.length} 件の画像をライブラリへアップロードします。同名パスは上書きされます。よろしいですか？`,
      )
    ) {
      return;
    }
    setBusy(true);
    setUploadPct(`0/${items.length}`);
    let done = 0;
    let failed = 0;
    const errors: string[] = [];
    let cursor = 0;

    const worker = async () => {
      while (cursor < items.length) {
        const idx = cursor++;
        const item = items[idx];
        try {
          await api.uploadLibraryFile(
            item.relativePath,
            item.blob,
            item.contentType,
          );
          done++;
        } catch (e) {
          failed++;
          if (errors.length < 5) {
            errors.push(`${item.relativePath}: ${(e as Error).message || e}`);
          }
        }
        setUploadPct(`${done + failed}/${items.length}`);
      }
    };

    try {
      await Promise.all(
        Array.from(
          { length: Math.min(UPLOAD_CONCURRENCY, items.length) },
          () => worker(),
        ),
      );
      setMsg(
        `アップロード完了: 成功 ${done}` +
          (failed ? ` / 失敗 ${failed}` : '') +
          (errors.length ? `（例: ${errors[0]}）` : ''),
      );
      await loadLibrary();
      setPage(1);
    } catch (e) {
      setMsg(String((e as Error).message || e));
    } finally {
      setBusy(false);
      setUploadPct(null);
    }
  };

  const onPickUploads = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    setMsg('アップロード内容を解析中…');
    try {
      const items = await collectUploadItems(files);
      setBusy(false);
      await runLibraryUpload(items);
    } catch (e) {
      setBusy(false);
      setMsg(`解析に失敗: ${(e as Error).message || e}`);
    }
  };

  const onDropUploads = async (dt: DataTransfer) => {
    setDragOver(false);
    setBusy(true);
    setMsg('ドロップ内容を解析中…');
    try {
      const items = await collectFromDataTransfer(dt);
      setBusy(false);
      await runLibraryUpload(items);
    } catch (e) {
      setBusy(false);
      setMsg(`解析に失敗: ${(e as Error).message || e}`);
    }
  };

  const previewSrc = selected
    ? tab === 'project'
      ? assetUrl(selected.relativePath, selected)
      : libraryUrl(selected.relativePath, selected)
    : '';

  return (
    <div className="h-[calc(100svh-3rem)] flex flex-col gap-3 min-h-0">
      <header className="flex items-end justify-between gap-3 flex-wrap shrink-0">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">アセット</h2>
          <p className="text-sm text-[var(--muted)]">
            {tab === 'library'
              ? '外部素材庫。チェックで一括取込可。「素材を追加」またはドロップで追加。'
              : 'ゲーム正本。チェックで複数トリム可。'}
            {msg}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className={`px-3 py-1.5 rounded text-sm border ${
              tab === 'project'
                ? 'bg-[var(--accent)] text-[var(--bg)] border-transparent'
                : 'border-[var(--line)] bg-[var(--input-bg)]'
            }`}
            onClick={() => setTab('project')}
          >
            プロジェクト
          </button>
          <button
            type="button"
            className={`px-3 py-1.5 rounded text-sm border ${
              tab === 'library'
                ? 'bg-[var(--accent)] text-[var(--bg)] border-transparent'
                : 'border-[var(--line)] bg-[var(--input-bg)]'
            }`}
            onClick={() => setTab('library')}
          >
            ライブラリ
          </button>
        </div>
      </header>

      {tab === 'library' && (
        <p className="text-xs text-[var(--muted)] font-mono shrink-0">
          ライブラリ: {libRoot ?? '（未設定）'}
          {library.length > 0 ? ` · ${library.length} 件` : ''}
          {listBusy ? ' · 一覧取得中…' : ''}
          {uploadPct ? ` · 送信 ${uploadPct}` : ''}
        </p>
      )}

      <div className="flex flex-wrap gap-2 items-center shrink-0">
        <input
          className="flex-1 min-w-[160px] rounded border border-[var(--line)] px-3 py-1.5 text-sm bg-[var(--input-bg)]"
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
        {tab === 'project' && (
          <select
            className="rounded border border-[var(--line)] px-2 py-1.5 text-sm bg-[var(--input-bg)]"
            value={usageFilter}
            onChange={(e) =>
              setUsageFilter(e.target.value as 'all' | 'used' | 'unused')
            }
            title="カタログからの参照"
          >
            <option value="all">参照: すべて</option>
            <option value="used">参照あり</option>
            <option value="unused">未割当（{unusedCount}）</option>
          </select>
        )}
        <button
          type="button"
          disabled={busy || visibleImages.length === 0}
          onClick={selectAllVisible}
          className="px-3 py-1.5 rounded border border-[var(--line)] text-sm bg-[var(--input-bg)] disabled:opacity-40"
        >
          表示中を全選択
        </button>
        <button
          type="button"
          disabled={busy || checked.size === 0}
          onClick={clearChecked}
          className="px-3 py-1.5 rounded border border-[var(--line)] text-sm bg-[var(--input-bg)] disabled:opacity-40"
        >
          選択解除
        </button>
        {tab === 'library' && (
          <>
            <input
              ref={uploadInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,.png,.jpg,.jpeg,.webp,.gif,.zip,application/zip"
              multiple
              className="hidden"
              onChange={(e) => {
                void onPickUploads(e.target.files);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => uploadInputRef.current?.click()}
              className="px-3 py-1.5 rounded border border-[var(--line)] text-sm bg-[var(--input-bg)] disabled:opacity-40"
              title="画像・ZIPを選択（フォルダは一覧へドロップ）"
            >
              素材を追加
            </button>
            <button
              type="button"
              disabled={busy || checked.size === 0}
              onClick={() => void importChecked()}
              className="px-3 py-1.5 rounded text-sm bg-[var(--accent)] text-[var(--bg)] disabled:opacity-40"
            >
              選択を取込（{checked.size}）
            </button>
          </>
        )}
        {tab === 'project' && (
          <>
            <button
              type="button"
              disabled={busy || checked.size === 0}
              onClick={trimChecked}
              className="px-3 py-1.5 rounded text-sm bg-[var(--accent)] text-[var(--bg)] disabled:opacity-40"
            >
              選択をトリム（{checked.size}）
            </button>
            <button
              type="button"
              disabled={busy || visibleImages.length === 0}
              onClick={trimAllVisible}
              className="px-3 py-1.5 rounded border border-[var(--line)] text-sm bg-[var(--input-bg)] disabled:opacity-40"
            >
              表示中を一括トリム（{visibleImages.length}）
            </button>
          </>
        )}
      </div>

      {tab === 'library' && (
        <label className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted)] shrink-0">
          一括取込の先頭パス
          <input
            className="min-w-[200px] flex-1 rounded border border-[var(--line)] px-2 py-1 font-mono text-xs bg-[var(--input-bg)] text-[var(--ink)]"
            value={importRoot}
            onChange={(e) => setImportRoot(e.target.value)}
            placeholder="UI/imported"
          />
          <span className="font-mono">/（ライブラリ相対パス）</span>
        </label>
      )}

      <div className="flex flex-1 min-h-0 gap-0">
        <div
          ref={scrollRef}
          className={`rounded-lg border p-3 overflow-y-auto min-h-0 min-w-0 flex-1 ${
            tab === 'library' && dragOver
              ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
              : 'border-[var(--line)] bg-[var(--panel)]'
          }`}
          onDragEnter={
            tab === 'library'
              ? (e) => {
                  e.preventDefault();
                  setDragOver(true);
                }
              : undefined
          }
          onDragOver={
            tab === 'library'
              ? (e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'copy';
                  setDragOver(true);
                }
              : undefined
          }
          onDragLeave={
            tab === 'library'
              ? (e) => {
                  if (e.currentTarget === e.target) setDragOver(false);
                }
              : undefined
          }
          onDrop={
            tab === 'library'
              ? (e) => {
                  e.preventDefault();
                  void onDropUploads(e.dataTransfer);
                }
              : undefined
          }
        >
          <div className="grid grid-cols-4 md:grid-cols-6 gap-2 content-start">
            {visibleImages.map((a) => {
              const isChecked = checked.has(a.relativePath);
              const isFocus = selected?.relativePath === a.relativePath;
              return (
                <div
                  key={a.relativePath}
                  className={`rounded border p-2 text-left relative ${
                    isFocus
                      ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                      : isChecked
                        ? 'border-[var(--bounds)] bg-[var(--input-bg)]'
                        : 'border-[var(--line)] bg-[var(--input-bg)]'
                  }`}
                >
                  <label className="absolute top-1.5 left-1.5 z-10 flex items-center">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={(e) => {
                        e.stopPropagation();
                        toggleCheck(a.relativePath, e.target.checked);
                      }}
                      className="w-4 h-4 accent-[var(--accent)]"
                    />
                  </label>
                  <button
                    type="button"
                    className="w-full text-left"
                    onClick={() => {
                      void selectAsset(a);
                    }}
                  >
                    <LazyAssetThumb
                      relativePath={a.relativePath}
                      source={source}
                      initialUrl={
                        a.url || peekAssetUrl(a.relativePath, source)
                      }
                    />
                    <div className="text-[10px] break-all text-[var(--muted)]">
                      {a.name}
                    </div>
                    {tab === 'project' && (
                      <div
                        className={`mt-0.5 text-[10px] font-mono ${
                          (refCounts.get(a.relativePath) ?? 0) > 0
                            ? 'text-[var(--accent)]'
                            : 'text-[var(--warn)]'
                        }`}
                      >
                        {(refCounts.get(a.relativePath) ?? 0) > 0
                          ? `使用 ${refCounts.get(a.relativePath)}`
                          : '未割当'}
                      </div>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
          {hasMore && (
            <div
              ref={sentinelRef}
              className="py-4 text-center text-xs text-[var(--muted)]"
              aria-hidden
            >
              {visibleImages.length}/{filtered.length} 読み込み中…
            </div>
          )}
          {!hasMore && filtered.length > 0 && (
            <p className="py-3 text-center text-xs text-[var(--muted)]">
              全 {filtered.length} 件
            </p>
          )}
          {!listBusy && filtered.length === 0 && (
            <p className="text-sm text-[var(--muted)] p-4">該当なし</p>
          )}
        </div>

        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="プレビュー幅を変更"
          title="ドラッグで幅を変更"
          className="w-1.5 shrink-0 mx-1 rounded-full cursor-col-resize bg-[var(--line)] hover:bg-[var(--accent)] active:bg-[var(--accent)] touch-none"
          onPointerDown={onResizeDown}
          onPointerMove={onResizeMove}
          onPointerUp={onResizeUp}
          onPointerCancel={onResizeUp}
        />

        <aside
          style={{ width: previewWidth }}
          className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4 space-y-3 overflow-y-auto min-h-0 shrink-0"
        >
          <h3 className="font-medium">
            {tab === 'library' ? 'プレビュー' : 'プレビュー（透明余白）'}
          </h3>
          {!selected && (
            <p className="text-sm text-[var(--muted)]">
              {tab === 'library'
                ? 'チェックで複数選択し一括取込、または1件ずつ取込。'
                : '画像をクリックして詳細表示。チェックで複数選択トリム。'}
            </p>
          )}
          {selected && (
            <>
              {previewSrc ? (
                <AlphaBoundsPreview
                  src={previewSrc}
                  cacheKey={`${selected.relativePath}-${previewKey}`}
                  maxSide={Math.max(200, Math.floor(previewWidth - 40))}
                />
              ) : (
                <p className="text-xs text-[var(--muted)]">
                  プレビュー URL を取得中…
                </p>
              )}
              <p className="text-xs font-mono break-all text-[var(--muted)]">
                {selected.relativePath}
              </p>
              {tab === 'project' && (
                <p
                  className={`text-xs ${
                    (refCounts.get(selected.relativePath) ?? 0) > 0
                      ? 'text-[var(--accent)]'
                      : 'text-[var(--warn)]'
                  }`}
                >
                  カタログ参照:{' '}
                  {(refCounts.get(selected.relativePath) ?? 0) > 0
                    ? `${refCounts.get(selected.relativePath)} 件`
                    : 'なし（未割当）'}
                </p>
              )}
              {tab === 'project' && (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={trimSelectedOne}
                    className="w-full px-3 py-2 rounded bg-[var(--accent)] text-[var(--bg)] text-sm disabled:opacity-40"
                  >
                    この画像をトリム
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => toggleCheck(selected.relativePath)}
                    className="w-full px-3 py-2 rounded border border-[var(--line)] text-sm bg-[var(--input-bg)]"
                  >
                    {checked.has(selected.relativePath)
                      ? '選択から外す'
                      : '複数選択に追加'}
                  </button>
                </>
              )}
              {tab === 'library' && (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => toggleCheck(selected.relativePath)}
                    className="w-full px-3 py-2 rounded border border-[var(--line)] text-sm bg-[var(--input-bg)]"
                  >
                    {checked.has(selected.relativePath)
                      ? '選択から外す'
                      : '複数選択に追加'}
                  </button>
                  <label className="block text-xs text-[var(--muted)]">
                    取込先（この1件・assets 相対）
                    <input
                      className="mt-1 w-full rounded border border-[var(--line)] px-2 py-1.5 font-mono text-xs bg-[var(--input-bg)]"
                      value={destPath}
                      onChange={(e) => setDestPath(e.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void importSelected()}
                    className="w-full px-3 py-2 rounded bg-[var(--accent)] text-[var(--bg)] text-sm disabled:opacity-40"
                  >
                    この画像を取込
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
