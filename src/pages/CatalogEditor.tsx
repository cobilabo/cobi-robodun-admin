import { useEffect, useState } from 'react';
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
import { PageDesc, MetaChip, UiButton, equipSlotLabelJa } from '../components/ui';

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
  equipmentSlots: Row[];
  assetSlots: Row[];
};

function normalizeHud(raw: unknown): HudDoc {
  const doc = orderCatalogData('hud', raw) as HudDoc;
  return {
    appVersion: doc.appVersion ?? DEFAULT_HUD.appVersion,
    equipmentSlots: Array.isArray(doc.equipmentSlots) ? doc.equipmentSlots : [],
    assetSlots: Array.isArray(doc.assetSlots) ? doc.assetSlots : [...DEFAULT_HUD.assetSlots],
  };
}

function flattenHudRows(doc: HudDoc): Row[] {
  return [
    ...doc.equipmentSlots.map((s) => ({ ...s, kind: 'equipment' })),
    ...doc.assetSlots.map((s) => ({ ...s, kind: 'asset' })),
  ];
}

function splitHudRows(rows: Row[]): { equipmentSlots: Row[]; assetSlots: Row[] } {
  const equipmentSlots: Row[] = [];
  const assetSlots: Row[] = [];
  for (const r of rows) {
    if (r.kind === 'asset' || (!r.slot && r.key)) {
      const { kind: _k, ...rest } = r;
      assetSlots.push({
        key: String(rest.key ?? ''),
        labelJa: String(rest.labelJa ?? ''),
        icon: String(rest.icon ?? ''),
        noteJa: String(rest.noteJa ?? ''),
        ...(rest.useEquippedWeapon ? { useEquippedWeapon: true } : {}),
      });
    } else {
      const { kind: _k, ...rest } = r;
      equipmentSlots.push({
        slot: String(rest.slot ?? 'Weapon'),
        labelJa: String(rest.labelJa ?? ''),
        icon: String(rest.icon ?? ''),
      });
    }
  }
  return { equipmentSlots, assetSlots };
}

function hudSlotLabel(row: Row): string {
  if (row.kind === 'asset' || row.key) {
    const key = String(row.key ?? '');
    const label = String(row.labelJa ?? '');
    return label ? `${key} — ${label}` : key || '(asset)';
  }
  const slot = String(row.slot ?? '');
  const label = String(row.labelJa ?? '');
  return label ? `${slot} — ${label}` : slot || '(empty)';
}

function rowImagePath(row: Row): string {
  return String(row.icon || row.portrait || '').trim();
}

function toHudPayload(appVersion: string, rows: Row[]): HudDoc {
  const { equipmentSlots, assetSlots } = splitHudRows(rows);
  return orderCatalogData('hud', {
    appVersion,
    equipmentSlots,
    assetSlots,
  }) as HudDoc;
}

function formatEditorJson(catalogId: string, rows: Row[], appVersion: string): string {
  if (catalogId === 'hud') {
    const doc = toHudPayload(appVersion, rows);
    return `${JSON.stringify(
      { equipmentSlots: doc.equipmentSlots, assetSlots: doc.assetSlots },
      null,
      2,
    )}\n`;
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
  const isHud = catalogId === 'hud';

  const load = async (name: string) => {
    setStatus('読込中...');
    const r = await api.getCatalog(name);
    if (name === 'hud') {
      const doc = normalizeHud(r.data);
      const flat = flattenHudRows(doc);
      setAppVersion(doc.appVersion);
      setRows(flat);
      setSelectedIdx(0);
      setDirty(false);
      setJsonText(formatEditorJson('hud', flat, doc.appVersion));
      setJsonParseError('');
      setIssues([]);
      setStatus(
        `hud: 装備${doc.equipmentSlots.length} / 見た目${doc.assetSlots.length}`,
      );
      return;
    }
    const data = orderCatalogData(name, r.data) as Row[];
    const rowsData = Array.isArray(data) ? data : [];
    setRows(rowsData);
    setSelectedIdx(0);
    setDirty(false);
    setJsonText(formatEditorJson(name, rowsData, DEFAULT_HUD.appVersion));
    setJsonParseError('');
    setIssues([]);
    setStatus(`${name}: ${rowsData.length} 件`);
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
    setCatalogId(id);
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
      const asAsset = selected?.kind === 'asset' || Boolean(selected?.key);
      const template: Row = asAsset
        ? {
            kind: 'asset',
            key: `ui.custom_${Date.now().toString(36)}`,
            labelJa: '新規',
            icon: '',
            noteJa: '',
          }
        : {
            kind: 'equipment',
            slot: String(selected?.slot ?? 'Weapon'),
            labelJa: '新規',
            icon: '',
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
      const r = await api.saveCatalog(catalogId, data);
      const related = r.issues.filter(
        (i) => i.catalog === catalogId || !i.catalog,
      );
      setIssues(related);
      setDirty(false);
      const savedRows = isHud
        ? flattenHudRows(data as HudDoc)
        : (data as Row[]);
      if (isHud) setRows(savedRows);
      setJsonText(formatEditorJson(catalogId, savedRows, appVersion));
      const errors = related.filter((i) => i.level === 'error').length;
      const warns = related.filter((i) => i.level === 'warning').length;
      setStatus(
        (r.backupPath
          ? `保存しました（バックアップ: ${r.backupPath}）`
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
      <header className="flex items-end justify-between gap-2 flex-wrap">
        <PageDesc>
          {editMode === 'form' ? 'フォーム編集' : 'JSON 直接編集'}。{status}
          {dirty ? ' ・未保存の変更あり' : ''}
        </PageDesc>
        <div className="flex gap-1.5 flex-wrap items-center">
          <div className="flex h-8 rounded border border-[var(--line)] overflow-hidden">
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
              <span className="text-sm font-medium font-mono">{catalogId}.json</span>
              <span
                className={`text-xs ${
                  jsonParseError ? 'text-[var(--danger)]' : 'text-[var(--accent)]'
                }`}
              >
                {jsonParseError || 'JSON 構文 OK'}
              </span>
            </div>
            <JsonCodeEditor value={jsonText} onChange={onJsonChange} />
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
          {rows.map((row, i) => {
            const imgPath = rowImagePath(row);
            let meta: string | null = null;
            if (catalogId === 'skills') {
              const ex = row.exclusiveTo;
              if (ex == null || ex === '') meta = '共通';
              else {
                const id = String(ex);
                const hit = idOptions.characters?.find((o) => o.id === id);
                meta = hit?.name || id;
              }
            } else if (catalogId === 'equipment') {
              meta = equipSlotLabelJa(row.slot);
            }
            return (
              <button
                key={`${row.id ?? row.slot}-${i}`}
                type="button"
                onClick={() => setSelectedIdx(i)}
                className={`w-full text-left px-2.5 py-1.5 text-[11px] border-b border-[var(--line)] flex items-center gap-2 ${
                  selectedIdx === i
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
                <span className="min-w-0 truncate whitespace-nowrap leading-snug">
                  {isHud ? hudSlotLabel(row) : rowLabel(row)}
                </span>
                {meta ? <MetaChip>{meta}</MetaChip> : null}
              </button>
            );
          })}
          {rows.length === 0 && (
            <p className="p-2.5 text-[11px] text-[var(--muted)]">行がありません</p>
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
