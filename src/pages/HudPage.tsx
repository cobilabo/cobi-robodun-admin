import { useEffect, useState } from 'react';
import { api, type Issue } from '../lib/api';
import { AssetPicker } from '../components/AssetPicker';
import { DEFAULT_HUD } from '../lib/catalogRegistry';
import { validateCatalogBundle, CATALOG_IDS } from '../lib/validateContent';

type EquipSlot = 'Weapon' | 'Armor' | 'Accessory' | string;

type SlotRow = {
  slot: EquipSlot;
  labelJa: string;
  icon: string;
};

type HudDoc = {
  appVersion: string;
  equipmentSlots: SlotRow[];
};

const SLOT_OPTIONS: EquipSlot[] = ['Weapon', 'Armor', 'Accessory'];

function normalizeHud(raw: unknown): HudDoc {
  const doc = (raw && typeof raw === 'object' ? raw : {}) as Partial<HudDoc>;
  const slots = Array.isArray(doc.equipmentSlots)
    ? doc.equipmentSlots.map((s) => ({
        slot: String(s?.slot ?? 'Weapon'),
        labelJa: String(s?.labelJa ?? ''),
        icon: String(s?.icon ?? ''),
      }))
    : DEFAULT_HUD.equipmentSlots.map((s) => ({ ...s }));
  return {
    appVersion: String(doc.appVersion ?? DEFAULT_HUD.appVersion),
    equipmentSlots: slots,
  };
}

export function HudPage() {
  const [doc, setDoc] = useState<HudDoc>(normalizeHud(DEFAULT_HUD));
  const [status, setStatus] = useState('');
  const [issues, setIssues] = useState<Issue[]>([]);
  const [pickerIndex, setPickerIndex] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .getCatalog('hud')
      .then((r) => setDoc(normalizeHud(r.data)))
      .catch((e) => setStatus(String(e.message || e)));
  }, []);

  const updateSlot = (index: number, patch: Partial<SlotRow>) => {
    setDoc((prev) => {
      const equipmentSlots = prev.equipmentSlots.map((s, i) =>
        i === index ? { ...s, ...patch } : s,
      );
      return { ...prev, equipmentSlots };
    });
  };

  const addSlot = () => {
    setDoc((prev) => ({
      ...prev,
      equipmentSlots: [
        ...prev.equipmentSlots,
        { slot: 'Weapon', labelJa: '新規', icon: '' },
      ],
    }));
  };

  const removeSlot = (index: number) => {
    setDoc((prev) => ({
      ...prev,
      equipmentSlots: prev.equipmentSlots.filter((_, i) => i !== index),
    }));
  };

  const runValidate = async (data: HudDoc) => {
    const catalogs: Record<string, unknown> = {};
    await Promise.all(
      CATALOG_IDS.map(async (id) => {
        if (id === 'hud') {
          catalogs[id] = data;
          return;
        }
        const r = await api.getCatalog(id);
        catalogs[id] = r.data;
      }),
    );
    const assets = await api.assets();
    const paths = assets.assets.map((a) => a.relativePath);
    const all = validateCatalogBundle(catalogs, paths);
    setIssues(all.filter((i) => i.catalog === 'hud' || !i.catalog));
    return all;
  };

  const save = async () => {
    setBusy(true);
    setStatus('保存中...');
    try {
      const all = await runValidate(doc);
      const errors = all.filter((i) => i.level === 'error' && i.catalog === 'hud');
      if (errors.length > 0) {
        setStatus(`検証エラー ${errors.length} 件のため保存しませんでした`);
        return;
      }
      const r = await api.saveCatalog('hud', doc);
      setIssues(r.issues?.filter((i) => i.catalog === 'hud') ?? []);
      setStatus('保存しました（local なら GAME_ROOT/data/hud.json、cloud なら Firestore）');
    } catch (e) {
      setStatus(String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  };

  const validateOnly = async () => {
    setBusy(true);
    setStatus('検証中...');
    try {
      const all = await runValidate(doc);
      const errors = all.filter((i) => i.level === 'error');
      const warnings = all.filter((i) => i.level === 'warning');
      setStatus(`検証完了: エラー ${errors.length} / 警告 ${warnings.length}`);
    } catch (e) {
      setStatus(String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">HUD</h2>
          <p className="text-sm text-[var(--muted)] mt-1">
            タイトル下のバージョンと、装備スロット種別アイコン（data/hud.json）
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void validateOnly()}
            className="px-3 py-2 rounded border border-[var(--line)] text-sm bg-[var(--input-bg)] disabled:opacity-40"
          >
            検証
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void save()}
            className="px-3 py-2 rounded bg-[var(--accent)] text-[var(--bg)] text-sm disabled:opacity-40"
          >
            保存
          </button>
        </div>
      </header>

      {status && <p className="text-sm text-[var(--muted)]">{status}</p>}

      {issues.length > 0 && (
        <ul className="text-sm space-y-1 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-3 max-h-40 overflow-auto">
          {issues.map((i, idx) => (
            <li
              key={idx}
              className={
                i.level === 'error' ? 'text-[var(--danger)]' : 'text-[var(--warn)]'
              }
            >
              [{i.level}] {i.id ? `${i.id}: ` : ''}
              {i.message}
            </li>
          ))}
        </ul>
      )}

      <section className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4 space-y-3">
        <h3 className="font-medium">アプリ表示バージョン</h3>
        <label className="block text-sm">
          <span className="text-[var(--muted)]">appVersion</span>
          <input
            className="mt-1 w-full max-w-xs rounded border border-[var(--line)] px-2 py-1.5 font-mono text-sm bg-[var(--input-bg)]"
            value={doc.appVersion}
            onChange={(e) => setDoc((p) => ({ ...p, appVersion: e.target.value }))}
            placeholder="1.0.0"
          />
        </label>
        <p className="text-xs text-[var(--muted)]">
          タイトル画面では <code>v{'{appVersion}'}</code> と表示されます。
        </p>
      </section>

      <section className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-medium">装備スロット（種別アイコン）</h3>
          <button
            type="button"
            onClick={addSlot}
            className="px-2 py-1 rounded border border-[var(--line)] text-xs bg-[var(--input-bg)]"
          >
            行を追加
          </button>
        </div>
        <p className="text-xs text-[var(--muted)]">
          各スロットは共通の種別アイコン＋装備名テキストで表示されます。装備個体の icon
          とは別です。
        </p>

        <div className="space-y-3">
          {doc.equipmentSlots.map((slot, i) => (
            <div
              key={i}
              className="rounded-md border border-[var(--line)] p-3 grid gap-2 md:grid-cols-[140px_1fr_1fr_auto]"
            >
              <label className="block text-sm">
                <span className="text-[var(--muted)] text-xs">slot</span>
                <select
                  className="mt-1 w-full rounded border border-[var(--line)] px-2 py-1.5 text-sm bg-[var(--input-bg)]"
                  value={SLOT_OPTIONS.includes(slot.slot) ? slot.slot : slot.slot}
                  onChange={(e) => updateSlot(i, { slot: e.target.value })}
                >
                  {SLOT_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                  {!SLOT_OPTIONS.includes(slot.slot) && (
                    <option value={slot.slot}>{slot.slot}</option>
                  )}
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-[var(--muted)] text-xs">labelJa</span>
                <input
                  className="mt-1 w-full rounded border border-[var(--line)] px-2 py-1.5 text-sm bg-[var(--input-bg)]"
                  value={slot.labelJa}
                  onChange={(e) => updateSlot(i, { labelJa: e.target.value })}
                />
              </label>
              <label className="block text-sm">
                <span className="text-[var(--muted)] text-xs">icon</span>
                <div className="mt-1 flex gap-2">
                  <input
                    className="flex-1 rounded border border-[var(--line)] px-2 py-1.5 font-mono text-xs bg-[var(--input-bg)]"
                    value={slot.icon}
                    onChange={(e) => updateSlot(i, { icon: e.target.value })}
                  />
                  <button
                    type="button"
                    className="px-2 py-1 rounded border border-[var(--line)] text-xs bg-[var(--input-bg)] shrink-0"
                    onClick={() => setPickerIndex(i)}
                  >
                    選択
                  </button>
                </div>
              </label>
              <div className="flex items-end">
                <button
                  type="button"
                  className="px-2 py-1.5 rounded border border-[var(--line)] text-xs text-[var(--danger)]"
                  onClick={() => removeSlot(i)}
                >
                  削除
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {pickerIndex != null && (
        <AssetPicker
          value={doc.equipmentSlots[pickerIndex]?.icon}
          preferCategory="hud"
          onPick={(path) => {
            updateSlot(pickerIndex, { icon: path });
            setPickerIndex(null);
          }}
          onClose={() => setPickerIndex(null)}
        />
      )}
    </div>
  );
}
