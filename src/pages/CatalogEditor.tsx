import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, type Issue } from '../lib/api';
import { rowLabel } from '../lib/fieldInfer';
import { AssetPicker } from '../components/AssetPicker';
import { CatalogFormBody } from '../components/CatalogFormBody';
import { JsonCodeEditor } from '../components/JsonCodeEditor';
import { LazyAssetThumb } from '../components/LazyAssetThumb';
import { ensureAssetUrl, forgetAssetUrl, peekAssetUrl } from '../lib/assetUrlCache';
import {
  rowsToRefOptions,
  countAssetRefs,
  type RefOption,
} from '../lib/catalogRefs';
import {
  keysForRow,
  orderCatalogData,
  stringifyCatalog,
} from '../lib/catalogOrder';
import { CATALOG_IDS as ALL_CATALOG_IDS, DEFAULT_HUD } from '../lib/catalogRegistry';
import { CATALOG_IDS, validateCatalogBundle } from '../lib/validateContent';
import { CatalogHistoryBar } from '../components/CatalogHistoryBar';
import { JsonMergeDiffView } from '../components/JsonMergeDiffView';
import { PageDesc, MetaChip, UiButton, equipSlotLabelJa } from '../components/ui';
import { isCloudMode } from '../lib/mode';

const CATALOGS = [
  { id: 'characters', label: 'キャラ' },
  { id: 'enemies', label: '敵' },
  { id: 'bosses', label: 'ボス' },
  { id: 'skills', label: 'スキル' },
  { id: 'equipment', label: '装備' },
  { id: 'effects', label: '効果' },
  { id: 'behaviors', label: '行動' },
  { id: 'hud', label: 'HUD' },
] as const;

type Row = Record<string, unknown>;
type EditMode = 'form' | 'json';
type HudDoc = {
  appVersion: string;
  assetSlots: Row[];
};

function mergeDefaultHudAssetSlots(existing: Row[]): Row[] {
  const byKey = new Map<string, Row>();
  for (const s of existing) {
    const key = String(s.key ?? '').trim();
    if (key) byKey.set(key, s);
  }
  const merged: Row[] = [];
  for (const def of DEFAULT_HUD.assetSlots) {
    const cur = byKey.get(def.key);
    if (cur) {
      merged.push(cur);
      byKey.delete(def.key);
    } else {
      merged.push({ ...def });
    }
  }
  for (const leftover of byKey.values()) merged.push(leftover);
  return merged;
}

function normalizeHud(raw: unknown): HudDoc {
  const doc = orderCatalogData('hud', raw) as HudDoc;
  const slots = Array.isArray(doc.assetSlots)
    ? doc.assetSlots
    : [...DEFAULT_HUD.assetSlots];
  return {
    appVersion: doc.appVersion ?? DEFAULT_HUD.appVersion,
    assetSlots: mergeDefaultHudAssetSlots(slots as Row[]),
  };
}

function flattenHudRows(doc: HudDoc): Row[] {
  return doc.assetSlots.map((s) => ({ ...s, kind: 'asset' }));
}

function splitHudRows(rows: Row[]): { assetSlots: Row[] } {
  const assetSlots: Row[] = [];
  for (const r of rows) {
    // 旧 equipment 行は破棄（ゲーム固定スロットへ移行済み）
    if (r.kind === 'equipment' || (r.slot && !r.key)) continue;
    const { kind: _k, ...rest } = r;
    assetSlots.push({
      key: String(rest.key ?? ''),
      labelJa: String(rest.labelJa ?? ''),
      icon: String(rest.icon ?? ''),
      noteJa: String(rest.noteJa ?? ''),
      ...(rest.useEquippedWeapon ? { useEquippedWeapon: true } : {}),
    });
  }
  return { assetSlots };
}

function hudSlotLabel(row: Row): string {
  const key = String(row.key ?? '');
  const label = String(row.labelJa ?? '');
  return label ? `${key} — ${label}` : key || '(asset)';
}

function rowImagePath(row: Row): string {
  return String(row.icon || row.portrait || '').trim();
}

function toHudPayload(appVersion: string, rows: Row[]): HudDoc {
  const { assetSlots } = splitHudRows(rows);
  return orderCatalogData('hud', {
    appVersion,
    assetSlots,
  }) as HudDoc;
}

function formatEditorJson(catalogId: string, rows: Row[], appVersion: string): string {
  if (catalogId === 'hud') {
    const doc = toHudPayload(appVersion, rows);
    return `${JSON.stringify({ assetSlots: doc.assetSlots }, null, 2)}\n`;
  }
  return stringifyCatalog(catalogId, rows);
}

export function CatalogEditor() {
  const [searchParams] = useSearchParams();
  const [catalogId, setCatalogId] = useState<string>(() => {
    const q = searchParams.get('c');
    return CATALOGS.some((c) => c.id === q) ? (q as string) : 'enemies';
  });
  const [rows, setRows] = useState<Row[]>([]);
  const [appVersion, setAppVersion] = useState<string>(DEFAULT_HUD.appVersion);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [idOptions, setIdOptions] = useState<Record<string, RefOption[]>>({});
  const [status, setStatus] = useState('');
  const [issues, setIssues] = useState<Issue[]>([]);
  const [pickerKey, setPickerKey] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [previewSrc, setPreviewSrc] = useState('');
  const [editMode, setEditMode] = useState<EditMode>('form');
  const [jsonText, setJsonText] = useState('[]\n');
  const [jsonParseError, setJsonParseError] = useState('');
  const [expectedUpdatedAt, setExpectedUpdatedAt] = useState<string | null>(null);
  const [viewingHistory, setViewingHistory] = useState(false);
  const [historyResetToken, setHistoryResetToken] = useState(0);
  /** 過去版表示時の比較基準（読込時点の最新 JSON テキスト） */
  const [diffBaseJson, setDiffBaseJson] = useState<string | null>(null);
  /** 装備: slot / スキル: exclusiveTo キー（''=共通）。再クリックで null */
  const [listFilter, setListFilter] = useState<string | null>(null);
  const isHud = catalogId === 'hud';

  const skillExclusiveKey = (row: Row): string => {
    const ex = row.exclusiveTo;
    if (ex == null || ex === '') return '';
    return String(ex);
  };

  const skillExclusiveLabel = (row: Row): string => {
    const key = skillExclusiveKey(row);
    if (!key) return '共通';
    return idOptions.characters?.find((o) => o.id === key)?.name || key;
  };

  /** リスト表示用（装備は出現ターン昇順＋部位フィルタ、スキルは専用キャラフィルタ） */
  const listItems = useMemo(() => {
    let items = rows.map((row, index) => ({ row, index }));

    if (catalogId === 'equipment') {
      items.sort((a, b) => {
        const sa = Number(a.row.spawnTurn ?? 0);
        const sb = Number(b.row.spawnTurn ?? 0);
        if (sa !== sb) return sa - sb;
        const slotCmp = String(a.row.slot ?? '').localeCompare(String(b.row.slot ?? ''));
        if (slotCmp !== 0) return slotCmp;
        return String(a.row.id ?? '').localeCompare(String(b.row.id ?? ''));
      });
      if (listFilter != null) {
        items = items.filter((x) => String(x.row.slot ?? '') === listFilter);
      }
    } else if (catalogId === 'skills') {
      items.sort((a, b) => {
        const ka = skillExclusiveKey(a.row);
        const kb = skillExclusiveKey(b.row);
        if (ka !== kb) {
          // 共通を先に、その後 ID 順
          if (ka === '') return -1;
          if (kb === '') return 1;
          return ka.localeCompare(kb);
        }
        return String(a.row.id ?? '').localeCompare(String(b.row.id ?? ''));
      });
      if (listFilter != null) {
        items = items.filter((x) => skillExclusiveKey(x.row) === listFilter);
      }
    }

    return items;
  }, [rows, catalogId, listFilter, idOptions.characters]);

  const jsonTextFromRaw = (name: string, raw: unknown): string => {
    if (name === 'hud') {
      const doc = normalizeHud(raw);
      return formatEditorJson('hud', flattenHudRows(doc), doc.appVersion);
    }
    const data = orderCatalogData(name, raw) as Row[];
    const rowsData = Array.isArray(data) ? data : [];
    return formatEditorJson(name, rowsData, DEFAULT_HUD.appVersion);
  };

  const applyLoadedData = (name: string, raw: unknown, meta?: {
    updatedAt?: string | null;
    asHistory?: boolean;
  }) => {
    // 過去版読込時は競合検知用に「現在の最新 updatedAt」を維持する
    if (!meta?.asHistory) {
      setExpectedUpdatedAt(meta?.updatedAt ?? null);
      setDiffBaseJson(null);
    }
    setViewingHistory(Boolean(meta?.asHistory));
    if (!meta?.asHistory) setListFilter(null);
    if (name === 'hud') {
      const doc = normalizeHud(raw);
      const flat = flattenHudRows(doc);
      setAppVersion(doc.appVersion);
      setRows(flat);
      setSelectedIdx(0);
      setDirty(Boolean(meta?.asHistory));
      setJsonText(formatEditorJson('hud', flat, doc.appVersion));
      setJsonParseError('');
      setIssues([]);
      setStatus(
        meta?.asHistory
          ? `hud: 過去版を表示中（${doc.assetSlots.length} 枠）`
          : `hud: 見た目 ${doc.assetSlots.length} 枠`,
      );
      return;
    }
    const data = orderCatalogData(name, raw) as Row[];
    const rowsData = Array.isArray(data) ? data : [];
    setRows(rowsData);
    setSelectedIdx(0);
    setDirty(Boolean(meta?.asHistory));
    setJsonText(formatEditorJson(name, rowsData, DEFAULT_HUD.appVersion));
    setJsonParseError('');
    setIssues([]);
    setStatus(
      meta?.asHistory
        ? `${name}: 過去版を表示中（${rowsData.length} 件）`
        : `${name}: ${rowsData.length} 件`,
    );
  };

  const load = async (name: string) => {
    setStatus('読込中...');
    const r = await api.getCatalog(name);
    applyLoadedData(name, r.data, {
      updatedAt: r.updatedAt,
      asHistory: false,
    });
    setHistoryResetToken((n) => n + 1);
  };

  const loadHistoryRevision = async (_revisionId: string, data: unknown) => {
    setStatus('過去版と最新を比較用に読込中...');
    try {
      const latest = await api.getCatalog(catalogId);
      setDiffBaseJson(jsonTextFromRaw(catalogId, latest.data));
      // 競合検知用は最新の updatedAt を維持
      setExpectedUpdatedAt(latest.updatedAt);
    } catch {
      setDiffBaseJson(null);
    }
    applyLoadedData(catalogId, data, { asHistory: true });
  };

  useEffect(() => {
    const q = searchParams.get('c');
    if (q && CATALOGS.some((c) => c.id === q) && q !== catalogId) {
      setCatalogId(q);
    }
  }, [searchParams]);

  useEffect(() => {
    load(catalogId).catch((e) => setStatus(String(e.message || e)));
  }, [catalogId]);

  const switchCatalog = (id: string) => {
    if (id === catalogId) return;
    if (dirty && !confirm('未保存の変更があります。破棄してカタログを切り替えますか？')) {
      return;
    }
    setListFilter(null);
    setCatalogId(id);
  };

  const toggleListFilter = (key: string) => {
    setListFilter((prev) => (prev === key ? null : key));
  };

  useEffect(() => {
    Promise.all(
      [
        'skills',
        'equipment',
        'effects',
        'behaviors',
        'characters',
        'enemies',
        'bosses',
      ].map(async (n) => {
        const r = await api.getCatalog(n);
        const arr = Array.isArray(r.data) ? (r.data as Row[]) : [];
        return [n, rowsToRefOptions(arr)] as const;
      }),
    ).then((pairs) => {
      const map: Record<string, RefOption[]> = {};
      for (const [k, v] of pairs) map[k] = v;
      setIdOptions(map);
    });
  }, []);

  const selected = rows[selectedIdx] ?? null;
  const previewPath = selected
    ? String(selected.icon || selected.portrait || '')
    : '';

  useEffect(() => {
    if (!previewPath) {
      setPreviewSrc('');
      return;
    }
    const cached = peekAssetUrl(previewPath, 'project');
    if (cached) {
      setPreviewSrc(cached);
      return;
    }
    let cancelled = false;
    ensureAssetUrl(previewPath, 'project').then((url) => {
      if (!cancelled) setPreviewSrc(url ?? '');
    });
    return () => {
      cancelled = true;
    };
  }, [previewPath]);

  const updateField = (key: string, value: unknown) => {
    setRows((prev) => {
      const next = [...prev];
      const merged = { ...next[selectedIdx], [key]: value };
      const orderedKeys = keysForRow(catalogId, merged);
      next[selectedIdx] = Object.fromEntries(
        orderedKeys.map((k) => [k, merged[k]]),
      );
      return next;
    });
    setDirty(true);
  };

  /** 差し替えで参照ゼロになった旧プロジェクト画像を削除 */
  const applyAssetPick = async (fieldKey: string, projectPath: string) => {
    const oldPath = String(selected?.[fieldKey] ?? '')
      .replace(/\\/g, '/')
      .trim();
    const nextPath = projectPath.replace(/\\/g, '/').trim();
    updateField(fieldKey, nextPath);
    setPickerKey(null);
    setStatus(`取込完了: ${nextPath}`);

    if (!oldPath || oldPath === nextPath) return;
    if (!oldPath.startsWith('UI/') && !oldPath.startsWith('audio/')) return;

    try {
      const nextRows = rows.map((r, i) =>
        i === selectedIdx ? { ...r, [fieldKey]: nextPath } : r,
      );
      const draft =
        catalogId === 'hud'
          ? toHudPayload(appVersion, nextRows)
          : nextRows;

      const bundle: Record<string, unknown> = {};
      await Promise.all(
        ALL_CATALOG_IDS.map(async (id) => {
          if (id === catalogId) {
            bundle[id] = draft;
            return;
          }
          try {
            bundle[id] = (await api.getCatalog(id)).data;
          } catch {
            bundle[id] = id === 'hud' || id === 'audio' ? {} : [];
          }
        }),
      );

      const refs = countAssetRefs(bundle);
      if ((refs.get(oldPath) ?? 0) > 0) return;

      await api.deleteAsset(oldPath, 'project');
      forgetAssetUrl(oldPath, 'project');
      setStatus(`取込完了: ${nextPath}（旧画像を削除: ${oldPath}）`);
    } catch (e) {
      setStatus(
        `取込は完了（${nextPath}）。旧画像削除スキップ: ${String((e as Error).message || e)}`,
      );
    }
  };

  const addRow = () => {
    if (isHud) {
      const template: Row = {
        kind: 'asset',
        key: `ui.custom_${Date.now().toString(36)}`,
        labelJa: '新規',
        icon: '',
        noteJa: '',
      };
      setRows((prev) => [...prev, template]);
      setSelectedIdx(rows.length);
      setDirty(true);
      return;
    }
    const prefixMap: Record<string, string> = {
      characters: 'chr_',
      enemies: 'enm_',
      bosses: 'bos_',
      skills: 'skl_',
      equipment: 'eq_',
      effects: 'fx_',
      behaviors: 'beh_',
      audio: 'aud_',
    };
    const prefix = prefixMap[catalogId] ?? '';
    let maxN = 0;
    for (const row of rows) {
      const id = String(row.id ?? '');
      if (!prefix || !id.startsWith(prefix)) continue;
      const n = Number.parseInt(id.slice(prefix.length), 10);
      if (!Number.isNaN(n)) maxN = Math.max(maxN, n);
    }
    const nextId = prefix
      ? `${prefix}${String(maxN + 1).padStart(2, '0')}`
      : `new_${Date.now().toString(36)}`;
    const template: Row = selected
      ? Object.fromEntries(
          Object.entries(selected).map(([k, v]) => {
            if (k === 'id') return [k, nextId];
            if (k === 'logic') return [k, 'act_normal'];
            if (typeof v === 'string') return [k, ''];
            if (typeof v === 'number') return [k, 0];
            if (Array.isArray(v)) return [k, []];
            if (v && typeof v === 'object') return [k, { ...(v as object) }];
            return [k, v];
          }),
        )
      : { id: nextId, nameJa: '新規' };
    if (catalogId === 'bosses') {
      template.isBoss = true;
    }
    setRows((prev) => [...prev, template]);
    setSelectedIdx(rows.length);
    setDirty(true);
  };

  const removeRow = () => {
    if (!selected) return;
    const label = isHud ? hudSlotLabel(selected) : rowLabel(selected);
    if (!confirm(`削除しますか？ ${label}`)) return;
    setRows((prev) => prev.filter((_, i) => i !== selectedIdx));
    setSelectedIdx(0);
    setDirty(true);
  };

  const parseJsonCatalog = (
    text: string,
  ): { ok: true; data: Row[] } | { ok: false; error: string } => {
    try {
      const parsed = JSON.parse(text.replace(/^\uFEFF/, '')) as unknown;
      if (isHud) {
        let flat: Row[] = [];
        if (Array.isArray(parsed)) {
          flat = parsed as Row[];
        } else if (parsed && typeof parsed === 'object') {
          const doc = normalizeHud(parsed);
          flat = flattenHudRows(doc);
        } else {
          return { ok: false, error: 'ルートはオブジェクトまたは配列である必要があります' };
        }
        for (let i = 0; i < flat.length; i++) {
          if (!flat[i] || typeof flat[i] !== 'object' || Array.isArray(flat[i])) {
            return {
              ok: false,
              error: `要素[${i}] はオブジェクトである必要があります`,
            };
          }
        }
        return { ok: true, data: flat };
      }
      if (!Array.isArray(parsed)) {
        return { ok: false, error: 'ルートは JSON 配列である必要があります' };
      }
      for (let i = 0; i < parsed.length; i++) {
        if (!parsed[i] || typeof parsed[i] !== 'object' || Array.isArray(parsed[i])) {
          return {
            ok: false,
            error: `要素[${i}] はオブジェクトである必要があります`,
          };
        }
      }
      return {
        ok: true,
        data: orderCatalogData(catalogId, parsed) as Row[],
      };
    } catch (e) {
      return { ok: false, error: `JSON 構文エラー: ${(e as Error).message}` };
    }
  };

  const applyJsonToForm = (): Row[] | null => {
    const parsed = parseJsonCatalog(jsonText);
    if (!parsed.ok) {
      setJsonParseError(parsed.error);
      setStatus(parsed.error);
      return null;
    }
    setJsonParseError('');
    setRows(parsed.data);
    setSelectedIdx(0);
    return parsed.data;
  };

  const switchEditMode = (mode: EditMode) => {
    if (mode === editMode) return;
    if (mode === 'json') {
      setJsonText(formatEditorJson(catalogId, rows, appVersion));
      setJsonParseError('');
      setEditMode('json');
      return;
    }
    const data = applyJsonToForm();
    if (!data) {
      if (
        !confirm(
          'JSON にエラーがあります。破棄してフォームに戻りますか？',
        )
      ) {
        return;
      }
      setJsonText(formatEditorJson(catalogId, rows, appVersion));
      setJsonParseError('');
    }
    setEditMode('form');
  };

  const runValidate = async (data: Row[] | HudDoc) => {
    const catalogs: Record<string, unknown> = {};
    const payload =
      isHud && Array.isArray(data)
        ? toHudPayload(appVersion, data)
        : data;
    await Promise.all(
      CATALOG_IDS.map(async (id) => {
        if (id === catalogId) {
          catalogs[id] = payload;
          return;
        }
        const r = await api.getCatalog(id);
        catalogs[id] = r.data;
      }),
    );
    catalogs[catalogId] = payload;
    const assets = await api.assets();
    const paths = assets.assets.map((a) => a.relativePath);
    const all = validateCatalogBundle(catalogs, paths);
    setIssues(all.filter((i) => i.catalog === catalogId || !i.catalog));
    return all;
  };

  const validateOnly = async () => {
    try {
      setStatus('検証中...');
      let data: Row[] | HudDoc = rows;
      if (editMode === 'json') {
        const parsed = parseJsonCatalog(jsonText);
        if (!parsed.ok) {
          setJsonParseError(parsed.error);
          setIssues([]);
          setStatus(parsed.error);
          return;
        }
        setJsonParseError('');
        data = isHud ? toHudPayload(appVersion, parsed.data) : parsed.data;
      } else if (isHud) {
        data = toHudPayload(appVersion, rows);
      }
      const all = await runValidate(data);
      const errors = all.filter(
        (i) =>
          (i.catalog === catalogId || !i.catalog) && i.level === 'error',
      ).length;
      const warns = all.filter(
        (i) =>
          (i.catalog === catalogId || !i.catalog) && i.level === 'warning',
      ).length;
      setStatus(`検証完了: エラー ${errors} / 警告 ${warns}`);
    } catch (e) {
      setStatus(String((e as Error).message || e));
    }
  };

  const save = async () => {
    try {
      if (
        viewingHistory &&
        !confirm(
          '過去版の内容を新しい最新として保存します。他カタログとの参照ずれに注意してください。続行しますか？',
        )
      ) {
        return;
      }
      setStatus('保存中...');
      let data: Row[] | HudDoc = isHud ? toHudPayload(appVersion, rows) : rows;
      if (editMode === 'json') {
        const parsed = parseJsonCatalog(jsonText);
        if (!parsed.ok) {
          setJsonParseError(parsed.error);
          setStatus(`保存中止: ${parsed.error}`);
          return;
        }
        setJsonParseError('');
        setRows(parsed.data);
        data = isHud ? toHudPayload(appVersion, parsed.data) : parsed.data;
      }
      const r = await api.saveCatalog(catalogId, data, {
        expectedUpdatedAt: isCloudMode() ? expectedUpdatedAt : null,
      });
      const related = r.issues.filter(
        (i) => i.catalog === catalogId || !i.catalog,
      );
      setIssues(related);
      setDirty(false);
      setViewingHistory(false);
      setDiffBaseJson(null);
      const savedRows = isHud
        ? flattenHudRows(data as HudDoc)
        : (data as Row[]);
      if (isHud) setRows(savedRows);
      setJsonText(formatEditorJson(catalogId, savedRows, appVersion));
      // 保存後の updatedAt を取り直す（競合検知用）
      try {
        const latest = await api.getCatalog(catalogId);
        setExpectedUpdatedAt(latest.updatedAt);
      } catch {
        setExpectedUpdatedAt(null);
      }
      setHistoryResetToken((n) => n + 1);
      const errors = related.filter((i) => i.level === 'error').length;
      const warns = related.filter((i) => i.level === 'warning').length;
      setStatus(
        (r.backupPath
          ? `保存しました（履歴: ${r.backupPath}）`
          : '保存しました') + ` · 検証 エラー ${errors} / 警告 ${warns}`,
      );
    } catch (e) {
      setStatus(String((e as Error).message || e));
    }
  };

  const onJsonChange = (text: string) => {
    setJsonText(text);
    setDirty(true);
    const parsed = parseJsonCatalog(text);
    setJsonParseError(parsed.ok ? '' : parsed.error);
  };

  const catalogNav = (
    <aside className="rounded-lg border border-[var(--line)] bg-[var(--panel)] overflow-auto">
      {CATALOGS.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => switchCatalog(c.id)}
          className={`w-full text-left px-2.5 py-1.5 text-[11px] border-b border-[var(--line)] ${
            catalogId === c.id
              ? 'bg-[var(--accent-soft)] text-[var(--accent)] font-medium'
              : 'hover:bg-[var(--hover)]'
          }`}
        >
          {c.label}
          <span className="block text-[9px] text-[var(--muted)]">{c.id}.json</span>
        </button>
      ))}
    </aside>
  );

  return (
    <div className="h-[calc(100svh-3rem)] flex flex-col gap-2 min-h-0 text-xs">
      <header className="flex flex-col gap-1.5">
        <div className="flex items-center justify-end gap-2 flex-wrap">
            <CatalogHistoryBar
              catalogId={catalogId}
              dirty={dirty}
              resetToken={historyResetToken}
              onStatus={setStatus}
              onLoadLatest={() => load(catalogId)}
              onLoadRevision={(id, data) => loadHistoryRevision(id, data)}
            />
          <div className="flex h-8 rounded border border-[var(--line)] overflow-hidden shrink-0">
            <button
              type="button"
              onClick={() => switchEditMode('form')}
              className={`h-full px-2.5 text-[11px] ${
                editMode === 'form'
                  ? 'bg-[var(--accent)] text-[var(--bg)]'
                  : 'bg-[var(--input-bg)]'
              }`}
            >
              フォーム
            </button>
            <button
              type="button"
              onClick={() => switchEditMode('json')}
              className={`h-full px-2.5 text-[11px] border-l border-[var(--line)] ${
                editMode === 'json'
                  ? 'bg-[var(--accent)] text-[var(--bg)]'
                  : 'bg-[var(--input-bg)]'
              }`}
            >
              JSON
            </button>
          </div>
          {editMode === 'form' && (
            <>
              <UiButton onClick={addRow}>行を追加</UiButton>
              <UiButton onClick={removeRow}>行を削除</UiButton>
            </>
          )}
          <UiButton onClick={() => void validateOnly()}>検証</UiButton>
          <UiButton variant="accent" onClick={() => void save()}>
            保存
          </UiButton>
        </div>
        <PageDesc>
          {editMode === 'form' ? 'フォーム編集' : 'JSON 直接編集'}。{status}
          {dirty ? ' ・未保存の変更あり' : ''}
          {viewingHistory ? ' ・過去版' : ''}
        </PageDesc>
      </header>

      <div
        className={`flex-1 min-h-0 grid gap-2 ${
          editMode === 'json'
            ? 'grid-cols-[150px_1fr]'
            : 'grid-cols-[150px_minmax(360px,28%)_1fr]'
        }`}
      >
        {catalogNav}

        {editMode === 'json' ? (
          <section className="rounded-lg border border-[var(--line)] bg-[var(--panel)] min-h-0 flex flex-col overflow-hidden">
            <div className="px-3 py-2 border-b border-[var(--line)] flex items-center justify-between gap-2 shrink-0">
              <span className="text-sm font-medium font-mono">
                {catalogId}.json
                {viewingHistory && diffBaseJson
                  ? ' · 過去版 ↔ 最新'
                  : ''}
              </span>
              <span
                className={`text-xs ${
                  jsonParseError ? 'text-[var(--danger)]' : 'text-[var(--accent)]'
                }`}
              >
                {jsonParseError || 'JSON 構文 OK'}
              </span>
            </div>
            {viewingHistory && diffBaseJson ? (
              <JsonMergeDiffView
                leftValue={jsonText}
                leftLabel="過去版（編集中・未保存）"
                rightValue={diffBaseJson}
                rightLabel="最新（クラウド）"
                onLeftChange={onJsonChange}
              />
            ) : (
              <JsonCodeEditor value={jsonText} onChange={onJsonChange} />
            )}
            {issues.length > 0 && (
              <div className="border-t border-[var(--line)] p-3 shrink-0 max-h-40 overflow-auto">
                <h4 className="text-sm font-medium mb-1">コンテンツ検証</h4>
                <ul className="text-xs space-y-1">
                  {issues.slice(0, 40).map((i, idx) => (
                    <li
                      key={idx}
                      className={
                        i.level === 'error'
                          ? 'text-[var(--danger)]'
                          : 'text-[var(--warn)]'
                      }
                    >
                      {i.id ? `[${i.id}] ` : ''}
                      {i.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        ) : (
          <>
        <aside className="rounded-lg border border-[var(--line)] bg-[var(--panel)] overflow-auto min-w-0">
          {listFilter != null && (catalogId === 'equipment' || catalogId === 'skills') && (
            <div className="px-2.5 py-1.5 text-[10px] text-[var(--muted)] border-b border-[var(--line)] flex items-center justify-between gap-2">
              <span>
                絞り込み中:{' '}
                <span className="text-[var(--accent)]">
                  {catalogId === 'equipment'
                    ? equipSlotLabelJa(listFilter)
                    : listFilter === ''
                      ? '共通'
                      : idOptions.characters?.find((o) => o.id === listFilter)?.name ||
                        listFilter}
                </span>
                （{listItems.length}件）
              </span>
              <button
                type="button"
                className="text-[var(--accent)] hover:underline"
                onClick={() => setListFilter(null)}
              >
                解除
              </button>
            </div>
          )}
          {listItems.map(({ row, index }) => {
            const imgPath = rowImagePath(row);
            const spawnTurn =
              catalogId === 'equipment' ? Number(row.spawnTurn ?? 0) : null;
            const equipSlot =
              catalogId === 'equipment' ? String(row.slot ?? '') : null;
            const skillKey =
              catalogId === 'skills' ? skillExclusiveKey(row) : null;
            return (
              <button
                key={`${row.id ?? row.slot ?? row.key}-${index}`}
                type="button"
                onClick={() => setSelectedIdx(index)}
                className={`w-full text-left px-2.5 py-1.5 text-[11px] border-b border-[var(--line)] flex items-center gap-2 ${
                  selectedIdx === index
                    ? 'bg-[var(--accent-soft)]'
                    : 'hover:bg-[var(--hover)]'
                }`}
              >
                {imgPath ? (
                  <LazyAssetThumb
                    relativePath={imgPath}
                    source="project"
                    className="!mb-0 size-6 shrink-0"
                  />
                ) : null}
                <span className="min-w-0 truncate whitespace-nowrap leading-snug flex-1">
                  {isHud ? hudSlotLabel(row) : rowLabel(row)}
                </span>
                {spawnTurn != null && (
                  <span
                    className="shrink-0 font-mono text-[9px] text-[var(--muted)] tabular-nums"
                    title="出現ターン"
                  >
                    T{spawnTurn}
                  </span>
                )}
                {equipSlot != null && (
                  <MetaChip
                    active={listFilter === equipSlot}
                    title="クリックでこの部位のみ表示（再クリックで解除）"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleListFilter(equipSlot);
                    }}
                  >
                    {equipSlotLabelJa(equipSlot)}
                  </MetaChip>
                )}
                {skillKey != null && (
                  <MetaChip
                    active={listFilter === skillKey}
                    title="クリックでこの専用のみ表示（再クリックで解除）"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleListFilter(skillKey);
                    }}
                  >
                    {skillExclusiveLabel(row)}
                  </MetaChip>
                )}
              </button>
            );
          })}
          {listItems.length === 0 && (
            <p className="p-2.5 text-[11px] text-[var(--muted)]">
              {rows.length === 0 ? '行がありません' : '該当する行がありません'}
            </p>
          )}
        </aside>

        <section className="rounded-lg border border-[var(--line)] bg-[var(--panel)] overflow-auto p-3">
          {!selected && (
            <p className="text-[11px] text-[var(--muted)]">行を選択してください</p>
          )}
          {selected && (
            <CatalogFormBody
              catalogId={catalogId}
              selected={selected}
              previewPath={previewPath}
              previewSrc={previewSrc}
              idOptions={idOptions}
              onUpdate={updateField}
              onPickAsset={setPickerKey}
            />
          )}

          {issues.length > 0 && (
            <div className="mt-4 border-t border-[var(--line)] pt-2">
              <h4 className="text-[11px] font-medium mb-1">検証（関連）</h4>
              <ul className="text-[10px] space-y-0.5 max-h-28 overflow-auto">
                {issues.slice(0, 20).map((i, idx) => (
                  <li
                    key={idx}
                    className={
                      i.level === 'error'
                        ? 'text-[var(--danger)]'
                        : 'text-[var(--warn)]'
                    }
                  >
                    {i.id ? `[${i.id}] ` : ''}
                    {i.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
          </>
        )}
      </div>

      {pickerKey && selected && editMode === 'form' && (
        <AssetPicker
          value={String(selected[pickerKey] ?? '')}
          preferCategory={
            catalogId === 'characters'
              ? 'characters'
              : catalogId === 'skills'
                ? 'skills'
                : catalogId === 'equipment'
                  ? 'equipment'
                  : catalogId === 'hud'
                    ? 'hud'
                    : 'enemies'
          }
          onClose={() => setPickerKey(null)}
          onPick={(path) => {
            if (!pickerKey) return;
            void applyAssetPick(pickerKey, path);
          }}
        />
      )}
    </div>
  );
}
