import { useEffect, useMemo, useState } from 'react';
import { api, assetUrl, type Issue } from '../lib/api';
import {
  inferFieldKind,
  refCatalogHint,
  rowLabel,
} from '../lib/fieldInfer';
import { AssetPicker } from '../components/AssetPicker';

const CATALOGS = [
  { id: 'characters', label: 'キャラ' },
  { id: 'enemies', label: '敵' },
  { id: 'bosses', label: 'ボス' },
  { id: 'skills', label: 'スキル' },
  { id: 'equipment', label: '装備' },
  { id: 'effects', label: '効果' },
  { id: 'behaviors', label: '行動' },
] as const;

type Row = Record<string, unknown>;

export function CatalogEditor() {
  const [catalogId, setCatalogId] = useState<string>('enemies');
  const [rows, setRows] = useState<Row[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [idOptions, setIdOptions] = useState<Record<string, string[]>>({});
  const [status, setStatus] = useState('');
  const [issues, setIssues] = useState<Issue[]>([]);
  const [pickerKey, setPickerKey] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const load = async (name: string) => {
    setStatus('読込中...');
    const r = await api.getCatalog(name);
    const data = Array.isArray(r.data) ? (r.data as Row[]) : [];
    setRows(data);
    setSelectedIdx(0);
    setDirty(false);
    setStatus(`${name}: ${data.length} 件`);
  };

  useEffect(() => {
    load(catalogId).catch((e) => setStatus(String(e.message || e)));
  }, [catalogId]);

  useEffect(() => {
    Promise.all(
      ['skills', 'equipment', 'effects', 'behaviors', 'characters'].map(async (n) => {
        const r = await api.getCatalog(n);
        const arr = Array.isArray(r.data) ? (r.data as Row[]) : [];
        return [n, arr.map((x) => String(x.id ?? '')).filter(Boolean)] as const;
      }),
    ).then((pairs) => {
      const map: Record<string, string[]> = {};
      for (const [k, v] of pairs) map[k] = v;
      setIdOptions(map);
    });
  }, []);

  const selected = rows[selectedIdx] ?? null;

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
    const prefix =
      catalogId === 'characters'
        ? 'char_'
        : catalogId === 'skills'
          ? 'sk_'
          : catalogId === 'effects'
            ? 'fx_'
            : catalogId === 'behaviors'
              ? 'act_'
              : catalogId === 'bosses'
                ? 'boss_'
                : catalogId === 'equipment'
                  ? ''
                  : '';
    const template: Row = selected
      ? Object.fromEntries(
          Object.entries(selected).map(([k, v]) => {
            if (k === 'id') return [k, `${prefix}new_${Date.now().toString(36)}`];
            if (typeof v === 'string') return [k, ''];
            if (typeof v === 'number') return [k, 0];
            if (Array.isArray(v)) return [k, []];
            if (v && typeof v === 'object') return [k, { ...(v as object) }];
            return [k, v];
          }),
        )
      : { id: `${prefix}new`, nameJa: '新規' };
    setRows((prev) => [...prev, template]);
    setSelectedIdx(rows.length);
    setDirty(true);
  };

  const removeRow = () => {
    if (!selected) return;
    if (!confirm(`削除しますか？ ${rowLabel(selected)}`)) return;
    setRows((prev) => prev.filter((_, i) => i !== selectedIdx));
    setSelectedIdx(0);
    setDirty(true);
  };

  const save = async () => {
    try {
      setStatus('保存中...');
      const r = await api.saveCatalog(catalogId, rows);
      setIssues(r.issues.filter((i) => i.catalog === catalogId || !i.catalog));
      setDirty(false);
      setStatus(
        r.backupPath
          ? `保存しました（バックアップ: ${r.backupPath}）`
          : '保存しました',
      );
    } catch (e) {
      setStatus(String((e as Error).message || e));
    }
  };

  return (
    <div className="h-[calc(100vh-3rem)] flex flex-col gap-3">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">カタログ編集</h2>
          <p className="text-sm text-[var(--muted)]">
            3ペイン（種別 / 行 / フィールド）。{status}
            {dirty ? ' ・未保存の変更あり' : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={addRow}
            className="px-3 py-1.5 rounded border border-[var(--line)] text-sm bg-white"
          >
            行を追加
          </button>
          <button
            type="button"
            onClick={removeRow}
            className="px-3 py-1.5 rounded border border-[var(--line)] text-sm bg-white"
          >
            行を削除
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

      <div className="flex-1 min-h-0 grid grid-cols-[180px_280px_1fr] gap-3">
        <aside className="rounded-lg border border-[var(--line)] bg-[var(--panel)] overflow-auto">
          {CATALOGS.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCatalogId(c.id)}
              className={`w-full text-left px-3 py-2 text-sm border-b border-[var(--line)] ${
                catalogId === c.id
                  ? 'bg-[var(--accent-soft)] text-[var(--accent)] font-medium'
                  : 'hover:bg-black/5'
              }`}
            >
              {c.label}
              <span className="block text-[10px] text-[var(--muted)]">{c.id}.json</span>
            </button>
          ))}
        </aside>

        <aside className="rounded-lg border border-[var(--line)] bg-[var(--panel)] overflow-auto">
          {rows.map((row, i) => (
            <button
              key={`${row.id}-${i}`}
              type="button"
              onClick={() => setSelectedIdx(i)}
              className={`w-full text-left px-3 py-2 text-sm border-b border-[var(--line)] ${
                selectedIdx === i
                  ? 'bg-[var(--accent-soft)]'
                  : 'hover:bg-black/5'
              }`}
            >
              {rowLabel(row)}
            </button>
          ))}
          {rows.length === 0 && (
            <p className="p-3 text-sm text-[var(--muted)]">行がありません</p>
          )}
        </aside>

        <section className="rounded-lg border border-[var(--line)] bg-[var(--panel)] overflow-auto p-4">
          {!selected && (
            <p className="text-sm text-[var(--muted)]">行を選択してください</p>
          )}
          {selected && (
            <div className="space-y-3 max-w-2xl">
              {(selected.icon || selected.portrait) && (
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-16 h-16 rounded bg-[#efe9df] border border-[var(--line)] flex items-center justify-center overflow-hidden">
                    <img
                      src={assetUrl(
                        String(selected.icon || selected.portrait || ''),
                      )}
                      alt=""
                      className="max-w-full max-h-full object-contain"
                      style={{ imageRendering: 'pixelated' }}
                    />
                  </div>
                  <div className="text-sm text-[var(--muted)]">プレビュー</div>
                </div>
              )}
              {keys.map((key) => {
                const value = selected[key];
                const kind = inferFieldKind(key, value);
                const hint = refCatalogHint(key);
                const options = hint ? idOptions[hint] ?? [] : [];

                if (kind === 'asset') {
                  return (
                    <label key={key} className="block text-sm">
                      <span className="text-[var(--muted)]">{key}</span>
                      <div className="mt-1 flex gap-2">
                        <input
                          className="flex-1 rounded border border-[var(--line)] px-2 py-1.5 font-mono text-xs"
                          value={String(value ?? '')}
                          onChange={(e) => updateField(key, e.target.value)}
                        />
                        <button
                          type="button"
                          className="px-2 py-1 rounded border border-[var(--line)] text-xs"
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
                  return (
                    <fieldset key={key} className="text-sm">
                      <legend className="text-[var(--muted)]">{key}</legend>
                      <div className="mt-1 max-h-40 overflow-auto border border-[var(--line)] rounded p-2 grid grid-cols-2 gap-1">
                        {options.map((opt) => (
                          <label key={opt} className="flex items-center gap-1 text-xs">
                            <input
                              type="checkbox"
                              checked={arr.includes(opt)}
                              onChange={(e) => {
                                const next = e.target.checked
                                  ? [...arr, opt]
                                  : arr.filter((x) => x !== opt);
                                updateField(key, next);
                              }}
                            />
                            {opt}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  );
                }

                if (kind === 'idSingle') {
                  return (
                    <label key={key} className="block text-sm">
                      <span className="text-[var(--muted)]">{key}</span>
                      <select
                        className="mt-1 w-full rounded border border-[var(--line)] px-2 py-1.5"
                        value={String(value ?? '')}
                        onChange={(e) => updateField(key, e.target.value)}
                      >
                        <option value="">（なし）</option>
                        {options.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                        {value &&
                          !options.includes(String(value)) && (
                            <option value={String(value)}>{String(value)}</option>
                          )}
                      </select>
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
                    {i.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>

      {pickerKey && selected && (
        <AssetPicker
          value={String(selected[pickerKey] ?? '')}
          preferCategory={
            catalogId === 'characters'
              ? 'characters'
              : catalogId === 'skills'
                ? 'skills'
                : catalogId === 'equipment'
                  ? 'equipment'
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
