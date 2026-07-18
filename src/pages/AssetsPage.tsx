import { useEffect, useMemo, useRef, useState } from 'react';
import { MoreVertical } from 'lucide-react';
import {
  api,
  assetUrl,
  libraryUrl,
  type AssetEntry,
} from '../lib/api';
import { AlphaBoundsPreview } from '../components/AlphaBoundsPreview';
import { LazyAssetThumb } from '../components/LazyAssetThumb';
import {
  ensureAssetUrl,
  forgetAssetUrl,
  peekAssetUrl,
  putAssetUrl,
} from '../lib/assetUrlCache';
import {
  collectFromDataTransfer,
  collectUploadItems,
  type LibraryUploadItem,
} from '../lib/libraryUpload';
import { usePersistedWidth } from '../hooks/usePersistedWidth';
import {
  categoryOfPath,
  defaultAiFileName,
  defaultCopyFileName,
  fileNameOf,
  isCategoryKeepPath,
  pathInCategory,
  pathWithCategory,
  pathWithFileName,
} from '../lib/assetCategory';
import { countAssetRefs } from '../lib/catalogRefs';
import { isCloudMode } from '../lib/mode';
import { CATALOG_IDS } from '../lib/validateContent';
import { PageDesc, UiButton, UiInput, UiSelect } from '../components/ui';

const PAGE_SIZE = 48;
const UPLOAD_CONCURRENCY = 6;
const IMPORT_CONCURRENCY = 4;
const DELETE_CONCURRENCY = 6;
const PREVIEW_WIDTH_KEY = 'robodun-admin.assets.previewWidth';
const MAX_AI_REFS = 4;
const NEW_CATEGORY_VALUE = '__new__';

export function AssetsPage() {
  const [tab, setTab] = useState<'project' | 'library'>('library');
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
  const [dupOpen, setDupOpen] = useState(false);
  const [dupCat, setDupCat] = useState('');
  const [dupName, setDupName] = useState('');
  const [moveCat, setMoveCat] = useState('');
  const [catCreateNew, setCatCreateNew] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [renameName, setRenameName] = useState('');
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiDestCat, setAiDestCat] = useState('');
  const [aiDestName, setAiDestName] = useState('');
  const [aiShape, setAiShape] = useState<'square' | 'portrait' | 'landscape'>(
    'square',
  );
  const [aiTransparent, setAiTransparent] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [catMenuOpen, setCatMenuOpen] = useState(false);
  const [emptyCatMenuOpen, setEmptyCatMenuOpen] = useState(false);
  const [renameCatMenuOpen, setRenameCatMenuOpen] = useState(false);
  const [renameFromCat, setRenameFromCat] = useState('');
  const [renameToCat, setRenameToCat] = useState('');
  const [selectMode, setSelectMode] = useState(false);
  const [rangeAnchor, setRangeAnchor] = useState<number | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [listBusy, setListBusy] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);
  const [mediaRev, setMediaRev] = useState(0);
  const [uploadPct, setUploadPct] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const paintSelectRef = useRef(false);
  const paintAddRef = useRef(true);
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
    setMenuOpen(false);
    setCatMenuOpen(false);
    setEmptyCatMenuOpen(false);
    setRenameCatMenuOpen(false);
    setRangeAnchor(null);
  }, [tab, cat, q, usageFilter]);

  useEffect(() => {
    const endPaint = () => {
      paintSelectRef.current = false;
    };
    window.addEventListener('pointerup', endPaint);
    window.addEventListener('pointercancel', endPaint);
    return () => {
      window.removeEventListener('pointerup', endPaint);
      window.removeEventListener('pointercancel', endPaint);
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) {
        setMenuOpen(false);
        setCatMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);

  const list = tab === 'project' ? project : library;
  const source = tab === 'library' ? 'library' : 'project';

  const imageList = useMemo(
    () =>
      list.filter(
        (a) => a.kind === 'image' && !isCategoryKeepPath(a.relativePath),
      ),
    [list],
  );

  const categoryStats = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of list) {
      const c = a.category;
      if (!c) continue;
      if (!map.has(c)) map.set(c, 0);
      if (a.kind === 'image' && !isCategoryKeepPath(a.relativePath)) {
        map.set(c, (map.get(c) ?? 0) + 1);
      }
    }
    return [...map.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [list]);

  const existingCategories = useMemo(
    () => categoryStats.map((c) => c.name),
    [categoryStats],
  );

  const emptyCategories = useMemo(
    () => categoryStats.filter((c) => c.count === 0).map((c) => c.name),
    [categoryStats],
  );

  const categories = useMemo(
    () => ['all', ...existingCategories],
    [existingCategories],
  );

  const unusedCount = useMemo(() => {
    if (tab !== 'project') return 0;
    return imageList.filter(
      (a) => (refCounts.get(a.relativePath) ?? 0) === 0,
    ).length;
  }, [tab, imageList, refCounts]);

  const filtered = useMemo(() => {
    const qLower = q.toLowerCase();
    return imageList.filter((a) => {
      if (cat !== 'all' && a.category !== cat) return false;
      if (qLower && !a.relativePath.toLowerCase().includes(qLower)) return false;
      if (tab === 'project') {
        const n = refCounts.get(a.relativePath) ?? 0;
        if (usageFilter === 'used' && n === 0) return false;
        if (usageFilter === 'unused' && n > 0) return false;
      }
      return true;
    });
  }, [imageList, cat, q, tab, usageFilter, refCounts]);

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

  const selectionTargets = (): string[] => {
    if (checked.size > 0) return [...checked];
    return selected ? [selected.relativePath] : [];
  };

  const aiReferencePaths = (): string[] => {
    const out: string[] = [];
    if (selected) out.push(selected.relativePath);
    for (const p of checked) {
      if (out.length >= MAX_AI_REFS) break;
      if (!out.includes(p)) out.push(p);
    }
    return out.slice(0, MAX_AI_REFS);
  };

  const selectAsset = async (a: AssetEntry) => {
    const cached = a.url || peekAssetUrl(a.relativePath, source);
    const next = cached ? { ...a, url: cached } : a;
    setSelected(next);
    setDupOpen(false);
    setMoveCat(a.category);
    setRenameName(fileNameOf(a.relativePath));
    if (tab === 'library') {
      setDestPath(libraryDestFor(a.relativePath));
      setAiDestCat(a.category);
      setAiDestName(defaultAiFileName());
      setDupCat(a.category);
      setDupName(defaultCopyFileName(a.relativePath));
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

  const changeCategory = async () => {
    const nextCat = (catCreateNew ? newCatName : moveCat).trim();
    if (!nextCat) {
      setMsg('カテゴリを入力してください');
      return;
    }
    const paths = selectionTargets();
    if (paths.length === 0) {
      setMsg('対象画像を選択してください');
      return;
    }
    const plans: { src: string; dest: string }[] = [];
    try {
      for (const src of paths) {
        const dest = pathWithCategory(src, nextCat, source);
        if (src !== dest) plans.push({ src, dest });
      }
    } catch (e) {
      setMsg(String((e as Error).message || e));
      return;
    }
    if (plans.length === 0) {
      setMsg('カテゴリは既に同じです');
      return;
    }
    if (
      !confirm(
        `${plans.length} 件のカテゴリを「${nextCat}」へ変更（ファイル移動）します。\nカタログ内のパスは自動更新されません。よろしいですか？`,
      )
    ) {
      return;
    }
    setBusy(true);
    setMenuOpen(false);
    setCatMenuOpen(false);
    setMsg('カテゴリ変更中…');
    let done = 0;
    let failed = 0;
    const errors: string[] = [];
    try {
      if (catCreateNew && !existingCategories.includes(nextCat)) {
        await api.createCategory(nextCat, source).catch(() => undefined);
      }
      for (const { src, dest } of plans) {
        try {
          await api.moveAsset(src, dest, source);
          forgetAssetUrl(src, source);
          done++;
        } catch (e) {
          failed++;
          if (errors.length < 5) {
            errors.push(`${src}: ${(e as Error).message || e}`);
          }
        }
      }
      setMsg(
        `カテゴリ変更: 成功 ${done}` +
          (failed ? ` / 失敗 ${failed}` : '') +
          (errors.length ? `（例: ${errors[0]}）` : ''),
      );
      setChecked(new Set());
      setSelected(null);
      setCatCreateNew(false);
      setNewCatName('');
      await refresh();
    } catch (e) {
      setMsg(String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  };

  const createEmptyCategory = async () => {
    const name = newCatName.trim();
    if (!name) {
      setMsg('新規カテゴリ名を入力してください');
      return;
    }
    setBusy(true);
    setMenuOpen(false);
    setCatMenuOpen(false);
    try {
      const r = await api.createCategory(name, source);
      setMsg(`カテゴリ「${r.category}」を作成しました`);
      setNewCatName('');
      setCatCreateNew(false);
      await refresh();
    } catch (e) {
      setMsg(String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  };

  const deleteEmptyCategory = async (name: string) => {
    if (
      !confirm(
        `カテゴリ「${name}」を削除しますか？\n（画像 0 件のときのみ削除できます）`,
      )
    ) {
      return;
    }
    setBusy(true);
    setMenuOpen(false);
    setEmptyCatMenuOpen(false);
    try {
      const r = await api.deleteCategory(name, source);
      setMsg(`カテゴリ「${r.category}」を削除しました`);
      if (cat === name) setCat('all');
      await refresh();
    } catch (e) {
      setMsg(String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  };

  const renameCategory = async () => {
    const from = renameFromCat.trim();
    const to = renameToCat.trim();
    if (!from || !to) {
      setMsg('変更前・変更後のカテゴリ名を入力してください');
      return;
    }
    if (from === to) {
      setMsg('カテゴリ名は変更されていません');
      return;
    }
    if (
      !confirm(
        `カテゴリ名を変更しますか？\n「${from}」→「${to}」\n配下のファイルをすべて移動します。\nカタログ内のパスは自動更新されません。`,
      )
    ) {
      return;
    }
    setBusy(true);
    setMenuOpen(false);
    setRenameCatMenuOpen(false);
    setMsg('カテゴリ名を変更中…');
    try {
      const r = await api.renameCategory(from, to, source);
      setMsg(
        `カテゴリ名を変更しました: ${r.from} → ${r.to}（${r.moved} 件）`,
      );
      if (cat === from) setCat(to);
      setChecked(new Set());
      setSelected(null);
      setRenameToCat('');
      await refresh();
    } catch (e) {
      setMsg(String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  };

  const runAiGenerate = async () => {
    if (!isCloudMode()) {
      setMsg('AI 生成はクラウドモードでのみ利用できます');
      return;
    }
    const refs = aiReferencePaths();
    if (refs.length === 0) {
      setMsg('参照画像を選択してください');
      return;
    }
    if (!aiPrompt.trim()) {
      setMsg('プロンプトを入力してください');
      return;
    }
    let dest: string;
    try {
      let name = aiDestName.trim() || defaultAiFileName();
      if (!name.toLowerCase().endsWith('.webp')) {
        name = `${name.replace(/\.[^.]+$/, '')}.webp`;
      }
      const cat = aiDestCat || selected?.category || 'ai';
      if (!existingCategories.includes(cat)) {
        await api.createCategory(cat, 'library').catch(() => undefined);
      }
      dest = pathInCategory(cat, name, 'library');
    } catch (e) {
      setMsg(String((e as Error).message || e));
      return;
    }
    setBusy(true);
    const shapeLabel =
      aiShape === 'portrait' ? '縦長' : aiShape === 'landscape' ? '横長' : '正方形';
    setMsg(
      `AI 生成中（参照 ${refs.length} 枚・${shapeLabel}${aiTransparent ? '・透明' : ''}）…`,
    );
    try {
      const r = await api.generateLibraryImage(refs, aiPrompt, dest, {
        shape: aiShape,
        transparentBackground: aiTransparent,
      });
      const sizeHint =
        r.width && r.height ? ` ${r.width}×${r.height}` : '';
      const pruneHint =
        typeof r.pruned === 'number' && r.pruned > 0
          ? `（同カテゴリの旧ファイル ${r.pruned} 件を削除）`
          : '';
      setMsg(`AI 生成完了: ${r.path}${sizeHint}${pruneHint}`);
      setAiDestCat(categoryOfPath(r.path, 'library'));
      setAiDestName(defaultAiFileName());
      await loadLibrary();
      const entry = (await api.library()).assets.find(
        (a) => a.relativePath === r.path,
      );
      if (entry) await selectAsset(entry);
    } catch (e) {
      setMsg(String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  };

  const renameSelected = async () => {
    if (!selected) return;
    let dest: string;
    try {
      dest = pathWithFileName(selected.relativePath, renameName);
    } catch (e) {
      setMsg(String((e as Error).message || e));
      return;
    }
    if (dest === selected.relativePath) {
      setMsg('ファイル名は変更されていません');
      return;
    }
    if (
      !confirm(
        `ファイル名を変更しますか？\n${selected.relativePath}\n→ ${dest}\n\nカタログ内のパスは自動更新されません。`,
      )
    ) {
      return;
    }
    setBusy(true);
    setMsg('リネーム中…');
    try {
      const r = await api.moveAsset(selected.relativePath, dest, source);
      forgetAssetUrl(selected.relativePath, source);
      setMsg(`リネームしました: ${r.path}`);
      setChecked((prev) => {
        const next = new Set(prev);
        next.delete(selected.relativePath);
        next.add(r.path);
        return next;
      });
      await refresh();
      const listRes =
        source === 'library' ? await api.library() : await api.assets();
      const entry = listRes.assets.find((a) => a.relativePath === r.path);
      if (entry) await selectAsset(entry);
    } catch (e) {
      setMsg(String((e as Error).message || e));
    } finally {
      setBusy(false);
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

  const applyRangeCheck = (fromIdx: number, toIdx: number, enable = true) => {
    const lo = Math.min(fromIdx, toIdx);
    const hi = Math.max(fromIdx, toIdx);
    setChecked((prev) => {
      const next = new Set(prev);
      for (let i = lo; i <= hi; i++) {
        const path = filtered[i]?.relativePath;
        if (!path) continue;
        if (enable) next.add(path);
        else next.delete(path);
      }
      return next;
    });
  };

  const handleItemPick = (
    a: AssetEntry,
    indexInFiltered: number,
    e: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean },
  ) => {
    if (selectMode) {
      if (e.shiftKey && rangeAnchor !== null) {
        applyRangeCheck(rangeAnchor, indexInFiltered, true);
      } else if (e.metaKey || e.ctrlKey) {
        toggleCheck(a.relativePath);
        setRangeAnchor(indexInFiltered);
      } else {
        toggleCheck(a.relativePath);
        setRangeAnchor(indexInFiltered);
      }
      void selectAsset(a);
      return;
    }
    void selectAsset(a);
  };

  const beginPaintSelect = (rel: string, currentlyChecked: boolean) => {
    if (!selectMode) return;
    paintSelectRef.current = true;
    paintAddRef.current = !currentlyChecked;
    toggleCheck(rel, paintAddRef.current);
  };

  const paintSelectEnter = (rel: string) => {
    if (!selectMode || !paintSelectRef.current) return;
    toggleCheck(rel, paintAddRef.current);
  };

  const selectAllVisible = () => {
    setChecked(new Set(visibleImages.map((a) => a.relativePath)));
  };

  const selectAllFiltered = () => {
    setChecked(new Set(filtered.map((a) => a.relativePath)));
    setRangeAnchor(filtered.length > 0 ? 0 : null);
  };

  const clearChecked = () => {
    setChecked(new Set());
    setRangeAnchor(null);
  };

  const runTrim = async (paths: string[]) => {
    if (paths.length === 0 || tab !== 'library') return;
    if (
      !confirm(
        `${paths.length} 件の画像の透過余白をトリムします。上書きされます。よろしいですか？`,
      )
    ) {
      return;
    }
    setBusy(true);
    setMenuOpen(false);
    setMsg('トリム中...');
    try {
      const r = await api.trimBatch(paths, 'library');
      setMsg(
        `トリム完了: 変更 ${r.trimmedCount} / 余白なし ${r.unchangedCount}` +
          (r.failedCount ? ` / 失敗 ${r.failedCount}` : ''),
      );
      const rev = Date.now();
      for (const p of paths) forgetAssetUrl(p, 'library');
      setMediaRev(rev);
      setPreviewKey(rev);
      await refresh();
      if (selected && paths.includes(selected.relativePath)) {
        const url = await ensureAssetUrl(selected.relativePath, 'library');
        setSelected((prev) =>
          prev && paths.includes(prev.relativePath)
            ? { ...prev, url: url ?? prev.url }
            : prev,
        );
      }
    } catch (e) {
      setMsg(String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  };

  const trimSelectedOne = () => {
    if (!selected) return;
    void runTrim([selected.relativePath]);
  };

  const deletePaths = async (paths: string[]) => {
    if (paths.length === 0) return;
    const where = tab === 'library' ? 'ライブラリ' : 'プロジェクト';
    let refWarn = '';
    if (tab === 'project') {
      const withRefs = paths.filter((p) => (refCounts.get(p) ?? 0) > 0);
      if (withRefs.length > 0) {
        refWarn = `\n\n注意: ${withRefs.length} 件はカタログから参照されています。削除すると参照切れになります。`;
      }
    }
    if (
      !confirm(
        `${where}から ${paths.length} 件を削除しますか？${refWarn}\n\nこの操作は元に戻せません。`,
      )
    ) {
      return;
    }
    setBusy(true);
    setMenuOpen(false);
    setMsg('削除中...');
    let done = 0;
    let failed = 0;
    const errors: string[] = [];
    let cursor = 0;
    const worker = async () => {
      while (cursor < paths.length) {
        const idx = cursor++;
        const path = paths[idx]!;
        try {
          await api.deleteAsset(path, source);
          forgetAssetUrl(path, source);
          done++;
        } catch (e) {
          failed++;
          if (errors.length < 5) {
            errors.push(`${path}: ${(e as Error).message || e}`);
          }
        }
        setMsg(`削除中 ${done + failed}/${paths.length}…`);
      }
    };
    try {
      await Promise.all(
        Array.from(
          { length: Math.min(DELETE_CONCURRENCY, paths.length) },
          () => worker(),
        ),
      );
      setMsg(
        `削除完了: 成功 ${done}` +
          (failed ? ` / 失敗 ${failed}` : '') +
          (errors.length ? `（例: ${errors[0]}）` : ''),
      );
      setChecked(new Set());
      if (selected && paths.includes(selected.relativePath)) {
        setSelected(null);
      }
      await refresh();
    } catch (e) {
      setMsg(String((e as Error).message || e));
    } finally {
      setBusy(false);
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

  const openDuplicate = () => {
    if (!selected || tab !== 'library') return;
    setDupCat(selected.category);
    setDupName(defaultCopyFileName(selected.relativePath));
    setDupOpen(true);
  };

  const confirmDuplicate = async () => {
    if (!selected || tab !== 'library') return;
    let dest: string;
    try {
      dest = pathInCategory(
        dupCat || selected.category,
        dupName.trim() || defaultCopyFileName(selected.relativePath),
        'library',
      );
    } catch (e) {
      setMsg(String((e as Error).message || e));
      return;
    }
    if (dest === selected.relativePath) {
      setMsg('複製先が複製元と同じです');
      return;
    }
    setBusy(true);
    setMsg('複製中...');
    try {
      const r = await api.copyLibraryAsset(selected.relativePath, dest);
      setMsg(`複製しました: ${r.path}`);
      setDupOpen(false);
      await loadLibrary();
      const entry = (await api.library()).assets.find(
        (a) => a.relativePath === r.path,
      );
      if (entry) await selectAsset(entry);
    } catch (e) {
      setMsg(String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  };

  const importChecked = async () => {
    if (tab !== 'library') return;
    const paths = selectionTargets();
    if (paths.length === 0) {
      setMsg('取込対象を選択してください');
      return;
    }
    if (
      !confirm(
        `${paths.length} 件をプロジェクトへ取り込みます。\n先頭パス: ${importRoot}/\n同名は上書きされます。よろしいですか？`,
      )
    ) {
      return;
    }
    setBusy(true);
    setMenuOpen(false);
    let done = 0;
    let failed = 0;
    let cursor = 0;
    const errors: string[] = [];
    const worker = async () => {
      while (cursor < paths.length) {
        const idx = cursor++;
        const libPath = paths[idx]!;
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
        const item = items[idx]!;
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

  const hasSelection = checked.size > 0 || Boolean(selected);
  const selectionCount = checked.size > 0 ? checked.size : selected ? 1 : 0;
  const aiRefs = aiReferencePaths();

  return (
    <div className="h-[calc(100svh-3rem)] flex flex-col gap-3 min-h-0">
      <header className="flex items-end justify-between gap-3 flex-wrap shrink-0">
        <PageDesc>
          {tab === 'library'
            ? '外部素材庫。選択モードで範囲選択可。右パネルで AI 生成・リネーム。一括操作は ⋮ から。'
            : 'ゲーム正本。選択モードで範囲選択可。右パネルでリネーム。一括操作は ⋮ から。'}
          {msg ? ` — ${msg}` : ''}
        </PageDesc>
        <div className="flex gap-1.5">
          <UiButton
            variant={tab === 'project' ? 'accent' : 'default'}
            onClick={() => setTab('project')}
          >
            プロジェクト
          </UiButton>
          <UiButton
            variant={tab === 'library' ? 'accent' : 'default'}
            onClick={() => setTab('library')}
          >
            ライブラリ
          </UiButton>
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

      <div className="flex flex-wrap gap-1.5 items-center shrink-0">
        <UiInput
          className="flex-1 min-w-[160px]"
          placeholder="検索..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <UiSelect value={cat} onChange={(e) => setCat(e.target.value)}>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </UiSelect>
        {tab === 'project' && (
          <UiSelect
            value={usageFilter}
            onChange={(e) =>
              setUsageFilter(e.target.value as 'all' | 'used' | 'unused')
            }
            title="カタログからの参照"
          >
            <option value="all">参照: すべて</option>
            <option value="used">参照あり</option>
            <option value="unused">未割当（{unusedCount}）</option>
          </UiSelect>
        )}
        <UiButton
          disabled={busy}
          variant={selectMode ? 'accent' : 'default'}
          onClick={() => {
            setSelectMode((v) => !v);
            setRangeAnchor(null);
            paintSelectRef.current = false;
          }}
          title="ON: クリックで選択、Shift+クリックで範囲、ドラッグで連続選択"
        >
          選択モード{selectMode ? ' ON' : ''}
          {checked.size > 0 ? `（${checked.size}）` : ''}
        </UiButton>
        <UiButton
          disabled={busy || visibleImages.length === 0}
          onClick={selectAllVisible}
        >
          表示中を全選択
        </UiButton>
        <UiButton
          disabled={busy || filtered.length === 0}
          onClick={selectAllFiltered}
          title="フィルタ後の全件（未表示分含む）"
        >
          絞り込み全選択（{filtered.length}）
        </UiButton>
        <UiButton
          disabled={busy || checked.size === 0}
          onClick={clearChecked}
        >
          選択解除
        </UiButton>
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
            <UiButton
              disabled={busy}
              onClick={() => uploadInputRef.current?.click()}
              title="画像・ZIPを選択（フォルダは一覧へドロップ）"
            >
              素材を追加
            </UiButton>
          </>
        )}

        <div className="relative" ref={menuRef}>
          <UiButton
            disabled={busy}
            onClick={() => {
              setMenuOpen((o) => !o);
              setCatMenuOpen(false);
            }}
            title="選択に対する操作"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="!px-2"
          >
            <MoreVertical className="w-4 h-4" />
          </UiButton>
          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full mt-1 z-30 min-w-[220px] rounded-lg border border-[var(--line)] bg-[var(--panel)] shadow-lg py-1 text-sm"
            >
              {tab === 'library' && (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={!hasSelection}
                    className="w-full text-left px-3 py-2 hover:bg-[var(--input-bg)] disabled:opacity-40"
                    onClick={() => void runTrim(selectionTargets())}
                  >
                    選択をトリム（{selectionCount}）
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={!hasSelection}
                    className="w-full text-left px-3 py-2 hover:bg-[var(--input-bg)] disabled:opacity-40"
                    onClick={() => void importChecked()}
                  >
                    選択を取込（{selectionCount}）
                  </button>
                </>
              )}
              <button
                type="button"
                role="menuitem"
                disabled={!hasSelection}
                className="w-full text-left px-3 py-2 hover:bg-[var(--input-bg)] disabled:opacity-40"
                onClick={() => {
                  const paths = selectionTargets();
                  const entry = paths[0]
                    ? list.find((a) => a.relativePath === paths[0])
                    : undefined;
                  const current = entry?.category ?? '';
                  setCatCreateNew(false);
                  setNewCatName('');
                  setMoveCat(
                    existingCategories.includes(current)
                      ? current
                      : (existingCategories[0] ?? ''),
                  );
                  setEmptyCatMenuOpen(false);
                  setRenameCatMenuOpen(false);
                  setCatMenuOpen(true);
                }}
              >
                選択をカテゴリ変更（{selectionCount}）
              </button>
              <button
                type="button"
                role="menuitem"
                className="w-full text-left px-3 py-2 hover:bg-[var(--input-bg)]"
                onClick={() => {
                  setCatCreateNew(true);
                  setNewCatName('');
                  setMoveCat('');
                  setEmptyCatMenuOpen(false);
                  setRenameCatMenuOpen(false);
                  setCatMenuOpen(true);
                }}
              >
                新規カテゴリを作成
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={existingCategories.length === 0}
                className="w-full text-left px-3 py-2 hover:bg-[var(--input-bg)] disabled:opacity-40"
                onClick={() => {
                  setCatMenuOpen(false);
                  setEmptyCatMenuOpen(false);
                  setRenameFromCat(existingCategories[0] ?? '');
                  setRenameToCat('');
                  setRenameCatMenuOpen(true);
                }}
              >
                カテゴリ名を変更
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={emptyCategories.length === 0}
                className="w-full text-left px-3 py-2 hover:bg-[var(--input-bg)] disabled:opacity-40"
                onClick={() => {
                  setCatMenuOpen(false);
                  setRenameCatMenuOpen(false);
                  setEmptyCatMenuOpen(true);
                }}
              >
                空のカテゴリを削除（{emptyCategories.length}）
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={!hasSelection}
                className="w-full text-left px-3 py-2 text-[var(--danger)] hover:bg-[var(--input-bg)] disabled:opacity-40"
                onClick={() => void deletePaths(selectionTargets())}
              >
                選択を削除（{selectionCount}）
              </button>
              {catMenuOpen && (
                <div className="border-t border-[var(--line)] px-3 py-2 space-y-2 bg-[var(--input-bg)]">
                  {hasSelection ? (
                    <>
                      <label className="block text-xs text-[var(--muted)]">
                        移動先カテゴリ
                        <select
                          className="mt-1 w-full rounded border border-[var(--line)] px-2 py-1.5 text-sm bg-[var(--panel)]"
                          value={
                            catCreateNew
                              ? NEW_CATEGORY_VALUE
                              : existingCategories.includes(moveCat)
                                ? moveCat
                                : (existingCategories[0] ?? NEW_CATEGORY_VALUE)
                          }
                          onChange={(e) => {
                            if (e.target.value === NEW_CATEGORY_VALUE) {
                              setCatCreateNew(true);
                              setMoveCat('');
                            } else {
                              setCatCreateNew(false);
                              setMoveCat(e.target.value);
                            }
                          }}
                          autoFocus
                        >
                          {existingCategories.map((c) => (
                            <option key={c} value={c}>
                              {c}（
                              {categoryStats.find((s) => s.name === c)?.count ??
                                0}
                              ）
                            </option>
                          ))}
                          <option value={NEW_CATEGORY_VALUE}>
                            ＋ 新規カテゴリ…
                          </option>
                        </select>
                      </label>
                      {catCreateNew && (
                        <label className="block text-xs text-[var(--muted)]">
                          新規カテゴリ名
                          <input
                            className="mt-1 w-full rounded border border-[var(--line)] px-2 py-1.5 text-sm bg-[var(--panel)]"
                            value={newCatName}
                            onChange={(e) => setNewCatName(e.target.value)}
                            placeholder="例: skills"
                          />
                        </label>
                      )}
                      <button
                        type="button"
                        disabled={
                          busy ||
                          !(catCreateNew ? newCatName.trim() : moveCat.trim())
                        }
                        onClick={() => void changeCategory()}
                        className="w-full px-2 py-1.5 rounded bg-[var(--accent)] text-[var(--bg)] text-xs disabled:opacity-40"
                      >
                        変更を実行
                      </button>
                    </>
                  ) : (
                    <>
                      <label className="block text-xs text-[var(--muted)]">
                        新規カテゴリ名（空フォルダ）
                        <input
                          className="mt-1 w-full rounded border border-[var(--line)] px-2 py-1.5 text-sm bg-[var(--panel)]"
                          value={newCatName}
                          onChange={(e) => setNewCatName(e.target.value)}
                          placeholder="例: skills"
                          autoFocus
                        />
                      </label>
                      <button
                        type="button"
                        disabled={busy || !newCatName.trim()}
                        onClick={() => void createEmptyCategory()}
                        className="w-full px-2 py-1.5 rounded bg-[var(--accent)] text-[var(--bg)] text-xs disabled:opacity-40"
                      >
                        作成
                      </button>
                    </>
                  )}
                </div>
              )}
              {emptyCatMenuOpen && (
                <div className="border-t border-[var(--line)] px-3 py-2 space-y-1 bg-[var(--input-bg)]">
                  <p className="text-[11px] text-[var(--muted)] mb-1">
                    画像 0 件のカテゴリのみ削除できます
                  </p>
                  {emptyCategories.length === 0 ? (
                    <p className="text-[11px] text-[var(--muted)]">該当なし</p>
                  ) : (
                    emptyCategories.map((name) => (
                      <button
                        key={name}
                        type="button"
                        disabled={busy}
                        className="w-full text-left px-2 py-1.5 rounded text-xs text-[var(--danger)] hover:bg-[var(--panel)] disabled:opacity-40"
                        onClick={() => void deleteEmptyCategory(name)}
                      >
                        削除: {name}
                      </button>
                    ))
                  )}
                </div>
              )}
              {renameCatMenuOpen && (
                <div className="border-t border-[var(--line)] px-3 py-2 space-y-2 bg-[var(--input-bg)]">
                  <label className="block text-xs text-[var(--muted)]">
                    変更前
                    <select
                      className="mt-1 w-full rounded border border-[var(--line)] px-2 py-1.5 text-sm bg-[var(--panel)]"
                      value={
                        existingCategories.includes(renameFromCat)
                          ? renameFromCat
                          : (existingCategories[0] ?? '')
                      }
                      onChange={(e) => setRenameFromCat(e.target.value)}
                      autoFocus
                    >
                      {existingCategories.map((c) => (
                        <option key={c} value={c}>
                          {c}（
                          {categoryStats.find((s) => s.name === c)?.count ?? 0}
                          ）
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-xs text-[var(--muted)]">
                    変更後の名前
                    <input
                      className="mt-1 w-full rounded border border-[var(--line)] px-2 py-1.5 text-sm bg-[var(--panel)]"
                      value={renameToCat}
                      onChange={(e) => setRenameToCat(e.target.value)}
                      placeholder="新しいカテゴリ名"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={
                      busy ||
                      !renameFromCat.trim() ||
                      !renameToCat.trim() ||
                      renameFromCat.trim() === renameToCat.trim()
                    }
                    onClick={() => void renameCategory()}
                    className="w-full px-2 py-1.5 rounded bg-[var(--accent)] text-[var(--bg)] text-xs disabled:opacity-40"
                  >
                    名前を変更
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
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
            selectMode
              ? 'border-[var(--accent)] bg-[var(--panel)]'
              : tab === 'library' && dragOver
                ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                : 'border-[var(--line)] bg-[var(--panel)]'
          } ${selectMode ? 'select-none touch-none' : ''}`}
          onDragEnter={
            tab === 'library' && !selectMode
              ? (e) => {
                  e.preventDefault();
                  setDragOver(true);
                }
              : undefined
          }
          onDragOver={
            tab === 'library' && !selectMode
              ? (e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'copy';
                  setDragOver(true);
                }
              : undefined
          }
          onDragLeave={
            tab === 'library' && !selectMode
              ? (e) => {
                  if (e.currentTarget === e.target) setDragOver(false);
                }
              : undefined
          }
          onDrop={
            tab === 'library' && !selectMode
              ? (e) => {
                  e.preventDefault();
                  void onDropUploads(e.dataTransfer);
                }
              : undefined
          }
        >
          {selectMode && (
            <p className="text-xs text-[var(--muted)] mb-2 sticky top-0 bg-[var(--panel)]/95 backdrop-blur py-1 z-10">
              選択モード: クリックで選択切替 / Shift+クリックで範囲 / ドラッグで連続選択
            </p>
          )}
          <div className="grid grid-cols-4 md:grid-cols-6 gap-2 content-start">
            {visibleImages.map((a, indexInFiltered) => {
              const isChecked = checked.has(a.relativePath);
              const isFocus = selected?.relativePath === a.relativePath;
              return (
                <div
                  key={a.relativePath}
                  data-asset-path={a.relativePath}
                  className={`rounded border p-2 text-left relative ${
                    isChecked
                      ? 'border-[var(--accent)] bg-[var(--accent-soft)] ring-1 ring-[var(--accent)]'
                      : isFocus
                        ? 'border-[var(--bounds)] bg-[var(--input-bg)]'
                        : 'border-[var(--line)] bg-[var(--input-bg)]'
                  } ${selectMode ? 'cursor-pointer' : ''}`}
                  onPointerDown={(e) => {
                    if (!selectMode || e.button !== 0) return;
                    e.preventDefault();
                    if (e.shiftKey && rangeAnchor !== null) {
                      applyRangeCheck(rangeAnchor, indexInFiltered, true);
                      void selectAsset(a);
                      return;
                    }
                    beginPaintSelect(a.relativePath, isChecked);
                    setRangeAnchor(indexInFiltered);
                    void selectAsset(a);
                  }}
                  onPointerEnter={() => {
                    paintSelectEnter(a.relativePath);
                  }}
                >
                  {!selectMode && (
                    <label className="absolute top-1.5 left-1.5 z-10 flex items-center">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          e.stopPropagation();
                          toggleCheck(a.relativePath, e.target.checked);
                          setRangeAnchor(indexInFiltered);
                        }}
                        className="w-4 h-4 accent-[var(--accent)]"
                      />
                    </label>
                  )}
                  {selectMode && isChecked && (
                    <span className="absolute top-1.5 left-1.5 z-10 w-4 h-4 rounded bg-[var(--accent)] text-[var(--bg)] text-[10px] leading-4 text-center font-bold">
                      ✓
                    </span>
                  )}
                  <button
                    type="button"
                    className="w-full text-left"
                    onClick={(e) => {
                      if (selectMode) return;
                      handleItemPick(a, indexInFiltered, e);
                    }}
                  >
                    <LazyAssetThumb
                      relativePath={a.relativePath}
                      source={source}
                      initialUrl={
                        a.url || peekAssetUrl(a.relativePath, source)
                      }
                      revision={mediaRev || undefined}
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
            {tab === 'library' ? 'プレビュー（透明余白）' : 'プレビュー'}
          </h3>
          {!selected && (
            <p className="text-sm text-[var(--muted)]">
              画像をクリックして詳細表示。複数選択の一括操作はヘッダーの ⋮ から。
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
              <p className="text-xs text-[var(--muted)]">
                カテゴリ: <span className="font-mono">{selected.category}</span>
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

              <div className="space-y-2 rounded border border-[var(--line)] p-3 bg-[var(--input-bg)]">
                <label className="block text-xs text-[var(--muted)]">
                  ファイル名
                  <input
                    className="mt-1 w-full rounded border border-[var(--line)] px-2 py-1.5 font-mono text-xs bg-[var(--panel)]"
                    value={renameName}
                    onChange={(e) => setRenameName(e.target.value)}
                  />
                </label>
                <button
                  type="button"
                  disabled={busy || !renameName.trim()}
                  onClick={() => void renameSelected()}
                  className="w-full px-3 py-1.5 rounded border border-[var(--line)] text-sm bg-[var(--panel)] disabled:opacity-40"
                >
                  ファイル名を変更
                </button>
              </div>

              {tab === 'library' && (
                <div className="space-y-2 rounded border border-[var(--line)] p-3 bg-[var(--input-bg)]">
                  <h4 className="text-sm font-medium">AI 生成</h4>
                  <p className="text-[11px] text-[var(--muted)] leading-relaxed">
                    参照 {aiRefs.length} 枚（この画像＋チェック）を元に生成します。保存先カテゴリには
                    <strong className="font-medium"> 最新 1 件だけ </strong>
                    残し、同カテゴリの他ファイルは削除します（参照に使っている画像は残します）。
                    既定ファイル名は <code className="font-mono">ai_latest.webp</code> です。
                  </p>
                  <p className="text-[10px] font-mono break-all text-[var(--muted)]">
                    {aiRefs.join(', ') || '（参照なし）'}
                  </p>
                  <label className="block text-xs text-[var(--muted)]">
                    形状
                    <select
                      className="mt-1 w-full rounded border border-[var(--line)] px-2 py-1.5 text-sm bg-[var(--panel)]"
                      value={aiShape}
                      onChange={(e) =>
                        setAiShape(
                          e.target.value as 'square' | 'portrait' | 'landscape',
                        )
                      }
                    >
                      <option value="square">正方形</option>
                      <option value="portrait">縦長</option>
                      <option value="landscape">横長</option>
                    </select>
                  </label>
                  <label className="flex items-center gap-2 text-xs text-[var(--muted)]">
                    <input
                      type="checkbox"
                      className="rounded border-[var(--line)]"
                      checked={aiTransparent}
                      onChange={(e) => setAiTransparent(e.target.checked)}
                    />
                    背景透明化（マゼンタキー抜き）
                  </label>
                  <textarea
                    className="w-full min-h-[88px] rounded border border-[var(--line)] px-2 py-1.5 text-sm bg-[var(--panel)]"
                    placeholder="手動プロンプト"
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                  />
                  <label className="block text-xs text-[var(--muted)]">
                    保存先カテゴリ
                    <select
                      className="mt-1 w-full rounded border border-[var(--line)] px-2 py-1.5 text-sm bg-[var(--panel)]"
                      value={
                        existingCategories.includes(aiDestCat)
                          ? aiDestCat
                          : aiDestCat ||
                            selected.category ||
                            existingCategories[0] ||
                            ''
                      }
                      onChange={(e) => setAiDestCat(e.target.value)}
                    >
                      {!existingCategories.includes(aiDestCat) &&
                        aiDestCat && (
                          <option value={aiDestCat}>{aiDestCat}</option>
                        )}
                      {existingCategories.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-xs text-[var(--muted)]">
                    ファイル名（.webp）
                    <input
                      className="mt-1 w-full rounded border border-[var(--line)] px-2 py-1.5 font-mono text-xs bg-[var(--panel)]"
                      value={aiDestName}
                      onChange={(e) => setAiDestName(e.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    disabled={busy || !aiPrompt.trim() || aiRefs.length === 0}
                    onClick={() => void runAiGenerate()}
                    className="w-full px-3 py-2 rounded bg-[var(--accent)] text-[var(--bg)] text-sm disabled:opacity-40"
                  >
                    生成してライブラリへ保存
                  </button>
                </div>
              )}

              {tab === 'library' && (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={trimSelectedOne}
                    className="w-full px-3 py-2 rounded border border-[var(--line)] text-sm bg-[var(--input-bg)] disabled:opacity-40"
                  >
                    この画像をトリム
                  </button>
                  {!dupOpen ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={openDuplicate}
                      className="w-full px-3 py-2 rounded border border-[var(--line)] text-sm bg-[var(--input-bg)] disabled:opacity-40"
                    >
                      複製
                    </button>
                  ) : (
                    <div className="space-y-2 rounded border border-[var(--line)] p-3 bg-[var(--input-bg)]">
                      <label className="block text-xs text-[var(--muted)]">
                        複製先カテゴリ
                        <select
                          className="mt-1 w-full rounded border border-[var(--line)] px-2 py-1.5 text-sm bg-[var(--panel)]"
                          value={
                            existingCategories.includes(dupCat)
                              ? dupCat
                              : dupCat ||
                                selected.category ||
                                existingCategories[0] ||
                                ''
                          }
                          onChange={(e) => setDupCat(e.target.value)}
                          autoFocus
                        >
                          {!existingCategories.includes(dupCat) && dupCat && (
                            <option value={dupCat}>{dupCat}</option>
                          )}
                          {existingCategories.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block text-xs text-[var(--muted)]">
                        ファイル名
                        <input
                          className="mt-1 w-full rounded border border-[var(--line)] px-2 py-1.5 font-mono text-xs bg-[var(--panel)]"
                          value={dupName}
                          onChange={(e) => setDupName(e.target.value)}
                        />
                      </label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={busy || !dupName.trim()}
                          onClick={() => void confirmDuplicate()}
                          className="flex-1 px-3 py-1.5 rounded bg-[var(--accent)] text-[var(--bg)] text-sm disabled:opacity-40"
                        >
                          複製を実行
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setDupOpen(false)}
                          className="px-3 py-1.5 rounded border border-[var(--line)] text-sm disabled:opacity-40"
                        >
                          取消
                        </button>
                      </div>
                    </div>
                  )}
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
              <button
                type="button"
                disabled={busy}
                onClick={() => void deletePaths([selected.relativePath])}
                className="w-full px-3 py-2 rounded border border-[var(--danger)] text-[var(--danger)] text-sm bg-[var(--input-bg)] disabled:opacity-40"
              >
                この画像を削除
              </button>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
