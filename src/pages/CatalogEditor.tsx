import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, type Issue } from '../lib/api';
import {
  fieldCaption,
  inferFieldKind,
  refCatalogHint,
  rowLabel,
} from '../lib/fieldInfer';
import { AssetPicker } from '../components/AssetPicker';
import { AlphaBoundsPreview } from '../components/AlphaBoundsPreview';
import { JsonCodeEditor } from '../components/JsonCodeEditor';
import { ensureAssetUrl, peekAssetUrl } from '../lib/assetUrlCache';
import {
  labelForOption,
  rowsToRefOptions,
  type RefOption,
} from '../lib/catalogRefs';
import { DEFAULT_HUD } from '../lib/catalogRegistry';
import { CATALOG_IDS, validateCatalogBundle } from '../lib/validateContent';

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
type HudDoc = { appVersion: string; equipmentSlots: Row[] };

function formatCatalogJson(data: unknown): string {
  return `${JSON.stringify(data, null, 2)}\n`;
}

function normalizeHud(raw: unknown): HudDoc {
  const doc = (raw && typeof raw === 'object' ? raw : {}) as Partial<HudDoc>;
  const slots = Array.isArray(doc.equipmentSlots)
    ? doc.equipmentSlots.map((s) => ({
        slot: String((s as Row)?.slot ?? 'Weapon'),
        labelJa: String((s as Row)?.labelJa ?? ''),
        icon: String((s as Row)?.icon ?? ''),
      }))
    : DEFAULT_HUD.equipmentSlots.map((s) => ({ ...s }));
  return {
    appVersion: String(doc.appVersion ?? DEFAULT_HUD.appVersion),
    equipmentSlots: slots,
  };
}

function hudSlotLabel(row: Row): string {
  const slot = String(row.slot ?? '');
  const label = String(row.labelJa ?? '');
  return label ? `${slot} — ${label}` : slot || '(empty)';
}

function toHudPayload(appVersion: string, slots: Row[]): HudDoc {
  return {
    appVersion,
    equipmentSlots: slots.map((s) => ({
      slot: String(s.slot ?? ''),
      labelJa: String(s.labelJa ?? ''),
      icon: String(s.icon ?? ''),
    })),
  };
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
      setAppVersion(doc.appVersion);
      setRows(doc.equipmentSlots);
      setSelectedIdx(0);
      setDirty(false);
      setJsonText(formatCatalogJson(doc));
      setJsonParseError('');
      setIssues([]);
      setStatus(`hud: ${doc.equipmentSlots.length} スロット`);
      return;
    }
    const data = Array.isArray(r.data) ? (r.data as Row[]) : [];
    setRows(data);
    setSelectedIdx(0);
    setDirty(false);
    setJsonText(formatCatalogJson(data));
    setJsonParseError('');
    setIssues([]);
    setStatus(`${name}: ${data.length} 件`);
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

  const keys = useMemo(() => {
    if (!selected) return [] as string[];
    return Object.keys(selected);
  }, [selected]);

  const updateField = (key: string, value: unknown) => {
    setRows((prev) => {
      const next = [...prev];
      next[selectedIdx] = { ...next[selectedIdx], [key]: value };
      return next;
    });
    setDirty(true);
  };

  const addRow = () => {
    if (isHud) {
      const template: Row = selected
        ? {
            slot: String(selected.slot ?? 'Weapon'),
            labelJa: '',
            icon: '',
          }
        : { slot: 'Weapon', labelJa: '新規', icon: '' };
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
            if (k === 'code') return [k, `new_${Date.now().toString(36)}`];
            if (typeof v === 'string') return [k, ''];
            if (typeof v === 'number') return [k, 0];
            if (Array.isArray(v)) return [k, []];
            if (v && typeof v === 'object') return [k, { ...(v as object) }];
            return [k, v];
          }),
        )
      : { id: nextId, code: `new_${Date.now().toString(36)}`, nameJa: '新規' };
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
  ):
    | { ok: true; data: Row[]; hud?: HudDoc }
    | { ok: false; error: string } => {
    try {
      const parsed = JSON.parse(text.replace(/^\uFEFF/, '')) as unknown;
      if (isHud) {
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          return { ok: false, error: 'ルートは JSON オブジェクトである必要があります' };
        }
        const doc = normalizeHud(parsed);
        return { ok: true, data: doc.equipmentSlots, hud: doc };
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
      return { ok: true, data: parsed as Row[] };
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
    if (parsed.hud) setAppVersion(parsed.hud.appVersion);
    setSelectedIdx(0);
    return parsed.data;
  };

  const switchEditMode = (mode: EditMode) => {
    if (mode === editMode) return;
    if (mode === 'json') {
      setJsonText(
        formatCatalogJson(isHud ? toHudPayload(appVersion, rows) : rows),
      );
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
      setJsonText(
        formatCatalogJson(isHud ? toHudPayload(appVersion, rows) : rows),
      );
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
        data = parsed.hud ?? parsed.data;
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
        if (parsed.hud) {
          data = parsed.hud;
          setAppVersion(parsed.hud.appVersion);
          setRows(parsed.hud.equipmentSlots);
        } else {
          data = parsed.data;
          setRows(parsed.data);
        }
      }
      const r = await api.saveCatalog(catalogId, data);
      const related = r.issues.filter(
        (i) => i.catalog === catalogId || !i.catalog,
      );
      setIssues(related);
      setDirty(false);
      setJsonText(formatCatalogJson(data));
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
          className={`w-full text-left px-3 py-2 text-sm border-b border-[var(--line)] ${
            catalogId === c.id
              ? 'bg-[var(--accent-soft)] text-[var(--accent)] font-medium'
              : 'hover:bg-[var(--hover)]'
          }`}
        >
          {c.label}
          <span className="block text-[10px] text-[var(--muted)]">{c.id}.json</span>
        </button>
      ))}
    </aside>
  );

  return (
    <div className="h-[calc(100svh-3rem)] flex flex-col gap-3 min-h-0">
      <header className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">カタログ編集</h2>
          <p className="text-sm text-[var(--muted)]">
            {editMode === 'form' ? 'フォーム編集' : 'JSON 直接編集'}。{status}
            {dirty ? ' ・未保存の変更あり' : ''}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <div className="flex rounded border border-[var(--line)] overflow-hidden">
            <button
              type="button"
              onClick={() => switchEditMode('form')}
              className={`px-3 py-1.5 text-sm ${
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
              className={`px-3 py-1.5 text-sm border-l border-[var(--line)] ${
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
              <button
                type="button"
                onClick={addRow}
                className="px-3 py-1.5 rounded border border-[var(--line)] text-sm bg-[var(--input-bg)]"
              >
                行を追加
              </button>
              <button
                type="button"
                onClick={removeRow}
                className="px-3 py-1.5 rounded border border-[var(--line)] text-sm bg-[var(--input-bg)]"
              >
                行を削除
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => void validateOnly()}
            className="px-3 py-1.5 rounded border border-[var(--line)] text-sm bg-[var(--input-bg)]"
          >
            検証
          </button>
          <button
            type="button"
            onClick={() => void save()}
            className="px-3 py-1.5 rounded text-sm bg-[var(--accent)] text-[var(--bg)]"
          >
            保存
          </button>
        </div>
      </header>

      <div
        className={`flex-1 min-h-0 grid gap-3 ${
          editMode === 'json'
            ? 'grid-cols-[180px_1fr]'
            : 'grid-cols-[180px_280px_1fr]'
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
        <aside className="rounded-lg border border-[var(--line)] bg-[var(--panel)] overflow-auto">
          {rows.map((row, i) => (
            <button
              key={`${row.id}-${i}`}
              type="button"
              onClick={() => setSelectedIdx(i)}
              className={`w-full text-left px-3 py-2 text-sm border-b border-[var(--line)] ${
                selectedIdx === i
                  ? 'bg-[var(--accent-soft)]'
                  : 'hover:bg-[var(--hover)]'
              }`}
            >
              {isHud ? hudSlotLabel(row) : rowLabel(row)}
            </button>
          ))}
          {rows.length === 0 && (
            <p className="p-3 text-sm text-[var(--muted)]">行がありません</p>
          )}
        </aside>

        <section className="rounded-lg border border-[var(--line)] bg-[var(--panel)] overflow-auto p-4">
          {isHud && editMode === 'form' && (
            <label className="block text-sm mb-4 max-w-2xl">
              <span className="text-[var(--muted)]">appVersion</span>
              <input
                className="mt-1 w-full max-w-xs rounded border border-[var(--line)] px-2 py-1.5 font-mono text-sm bg-[var(--input-bg)]"
                value={appVersion}
                onChange={(e) => {
                  setAppVersion(e.target.value);
                  setDirty(true);
                }}
              />
              <span className="mt-1 block text-xs text-[var(--muted)]">
                タイトル画面では v{'{appVersion}'} と表示されます
              </span>
            </label>
          )}
          {!selected && (
            <p className="text-sm text-[var(--muted)]">行を選択してください</p>
          )}
          {selected && (
            <div className="space-y-3 max-w-2xl">
              {Boolean(previewPath) && (
                <div className="mb-4 max-w-md">
                  <div className="text-sm text-[var(--muted)] mb-2">プレビュー</div>
                  {previewSrc ? (
                    <AlphaBoundsPreview
                      src={previewSrc}
                      cacheKey={previewPath}
                      maxSide={320}
                    />
                  ) : (
                    <p className="text-xs text-[var(--muted)]">画像を読み込み中…</p>
                  )}
                  <p className="mt-1 text-[10px] font-mono break-all text-[var(--muted)]">
                    {previewPath}
                  </p>
                </div>
              )}
              {keys.map((key) => {
                const value = selected[key];
                const kind = inferFieldKind(key, value);
                const hint = refCatalogHint(key);
                const options = hint ? idOptions[hint] ?? [] : [];
                const caption = fieldCaption(key);

                if (kind === 'asset') {
                  return (
                    <label key={key} className="block text-sm">
                      <span className="text-[var(--muted)]">{caption}</span>
                      <div className="mt-1 flex gap-2">
                        <input
                          className="flex-1 rounded border border-[var(--line)] px-2 py-1.5 font-mono text-xs bg-[var(--input-bg)]"
                          value={String(value ?? '')}
                          onChange={(e) => updateField(key, e.target.value)}
                        />
                        <button
                          type="button"
                          className="px-2 py-1 rounded border border-[var(--line)] text-xs bg-[var(--input-bg)]"
                          onClick={() => setPickerKey(key)}
                        >
                          選択
                        </button>
                      </div>
                    </label>
                  );
                }

                if (kind === 'idMulti') {
                  const arr = Array.isArray(value)
                    ? value.map(String)
                    : String(value ?? '')
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean);
                  const orphan = arr.filter(
                    (id) => !options.some((o) => o.id === id),
                  );
                  return (
                    <fieldset key={key} className="text-sm">
                      <legend className="text-[var(--muted)]">{caption}</legend>
                      {arr.length > 0 && (
                        <ul className="mt-1 mb-2 space-y-0.5 text-xs">
                          {arr.map((id) => (
                            <li
                              key={id}
                              className="rounded bg-[var(--input-bg)] px-2 py-1 border border-[var(--line)]"
                            >
                              {labelForOption(options, id)}
                            </li>
                          ))}
                        </ul>
                      )}
                      <div className="mt-1 max-h-48 overflow-auto border border-[var(--line)] rounded p-2 grid grid-cols-1 gap-1">
                        {options.map((opt) => (
                          <label
                            key={opt.id}
                            className="flex items-start gap-2 text-xs leading-snug"
                          >
                            <input
                              type="checkbox"
                              className="mt-0.5 shrink-0"
                              checked={arr.includes(opt.id)}
                              onChange={(e) => {
                                const next = e.target.checked
                                  ? [...arr, opt.id]
                                  : arr.filter((x) => x !== opt.id);
                                updateField(key, next);
                              }}
                            />
                            <span>
                              <span className="font-mono text-[var(--muted)]">
                                {opt.id}
                              </span>
                              {opt.name ? (
                                <span className="text-[var(--ink)]">
                                  {' '}
                                  — {opt.name}
                                </span>
                              ) : null}
                            </span>
                          </label>
                        ))}
                        {orphan.map((id) => (
                          <label
                            key={id}
                            className="flex items-start gap-2 text-xs text-[var(--warn)]"
                          >
                            <input
                              type="checkbox"
                              className="mt-0.5"
                              checked
                              onChange={() =>
                                updateField(
                                  key,
                                  arr.filter((x) => x !== id),
                                )
                              }
                            />
                            <span>
                              {id}（参照先に存在しません）
                            </span>
                          </label>
                        ))}
                        {options.length === 0 && (
                          <p className="text-[var(--muted)]">選択肢がありません</p>
                        )}
                      </div>
                    </fieldset>
                  );
                }

                if (kind === 'idSingle') {
                  const current = String(value ?? '');
                  const known = options.some((o) => o.id === current);
                  return (
                    <label key={key} className="block text-sm">
                      <span className="text-[var(--muted)]">{caption}</span>
                      <select
                        className="mt-1 w-full rounded border border-[var(--line)] px-2 py-1.5 bg-[var(--input-bg)]"
                        value={current}
                        onChange={(e) => updateField(key, e.target.value)}
                      >
                        <option value="">（なし）</option>
                        {options.map((opt) => (
                          <option key={opt.id} value={opt.id}>
                            {opt.label}
                          </option>
                        ))}
                        {current && !known ? (
                          <option value={current}>
                            {current}（参照先に存在しません）
                          </option>
                        ) : null}
                      </select>
                      {current && (
                        <p className="mt-1 text-xs text-[var(--muted)]">
                          選択中: {labelForOption(options, current)}
                        </p>
                      )}
                    </label>
                  );
                }

                if (kind === 'numberMap' && value && typeof value === 'object') {
                  const obj = value as Record<string, number>;
                  return (
                    <fieldset key={key} className="text-sm">
                      <legend className="text-[var(--muted)]">{key}</legend>
                      <div className="mt-1 grid grid-cols-2 gap-2">
                        {Object.entries(obj).map(([k, v]) => (
                          <label key={k} className="flex items-center gap-2">
                            <span className="w-12 text-xs">{k}</span>
                            <input
                              type="number"
                              className="flex-1 rounded border border-[var(--line)] px-2 py-1"
                              value={v}
                              onChange={(e) =>
                                updateField(key, {
                                  ...obj,
                                  [k]: Number(e.target.value),
                                })
                              }
                            />
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  );
                }

                if (kind === 'number') {
                  return (
                    <label key={key} className="block text-sm">
                      <span className="text-[var(--muted)]">{key}</span>
                      <input
                        type="number"
                        className="mt-1 w-full rounded border border-[var(--line)] px-2 py-1.5"
                        value={Number(value ?? 0)}
                        onChange={(e) => updateField(key, Number(e.target.value))}
                      />
                    </label>
                  );
                }

                if (kind === 'boolean') {
                  return (
                    <label key={key} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={Boolean(value)}
                        onChange={(e) => updateField(key, e.target.checked)}
                      />
                      {key}
                    </label>
                  );
                }

                if (kind === 'json') {
                  return (
                    <label key={key} className="block text-sm">
                      <span className="text-[var(--muted)]">{key} (JSON)</span>
                      <textarea
                        className="mt-1 w-full rounded border border-[var(--line)] px-2 py-1.5 font-mono text-xs h-24"
                        value={JSON.stringify(value, null, 2)}
                        onChange={(e) => {
                          try {
                            updateField(key, JSON.parse(e.target.value));
                          } catch {
                            /* ignore while typing */
                          }
                        }}
                      />
                    </label>
                  );
                }

                return (
                  <label key={key} className="block text-sm">
                    <span className="text-[var(--muted)]">{key}</span>
                    <input
                      className="mt-1 w-full rounded border border-[var(--line)] px-2 py-1.5"
                      value={String(value ?? '')}
                      onChange={(e) => updateField(key, e.target.value)}
                    />
                  </label>
                );
              })}
            </div>
          )}

          {issues.length > 0 && (
            <div className="mt-6 border-t border-[var(--line)] pt-3">
              <h4 className="text-sm font-medium mb-1">検証（関連）</h4>
              <ul className="text-xs space-y-1 max-h-32 overflow-auto">
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
            updateField(pickerKey, path);
            setPickerKey(null);
          }}
        />
      )}
    </div>
  );
}
