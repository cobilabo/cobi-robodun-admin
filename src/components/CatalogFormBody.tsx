import {
  fieldCaption,
  fieldNote,
  inferFieldKind,
  refCatalogHint,
} from '../lib/fieldInfer';
import { AlphaBoundsPreview } from './AlphaBoundsPreview';
import { type RefOption } from '../lib/catalogRefs';
import {
  equipBonusKeys,
  formLayoutFor,
  keysForRow,
  type FormBlock,
} from '../lib/catalogOrder';
import { BEHAVIOR_LOGICS, EFFECT_TYPES, EQUIP_SLOTS, EQUIP_UNIQUE_KINDS } from '../lib/catalogRegistry';
import { UiButton, UiInput, UiSelect, UiTextarea } from './ui';

type Row = Record<string, unknown>;

function FieldCaption({
  fieldKey,
  catalogId,
  suffix = '',
}: {
  fieldKey: string;
  catalogId: string;
  suffix?: string;
}) {
  const note = fieldNote(fieldKey, catalogId);
  return (
    <span className="text-[var(--muted)] text-[11px]">
      {fieldCaption(fieldKey, catalogId)}
      {suffix}
      {note ? (
        <span className="ml-1.5 text-[9px] opacity-80">{note}</span>
      ) : null}
    </span>
  );
}

type Props = {
  catalogId: string;
  selected: Row;
  previewPath: string;
  previewSrc: string;
  idOptions: Record<string, RefOption[]>;
  onUpdate: (key: string, value: unknown) => void;
  onPickAsset: (key: string) => void;
};

export function CatalogFormBody({
  catalogId,
  selected,
  previewPath,
  previewSrc,
  idOptions,
  onUpdate,
  onPickAsset,
}: Props) {
  const keys = keysForRow(catalogId, selected);
  const layout = formLayoutFor(catalogId);
  const assetKey = 'portrait' in selected ? 'portrait' : 'icon';

  const renderField = (key: string, compact = false) => {
    // ボスカタログでは isBoss は自動付与のため UI 非表示
    if (catalogId === 'bosses' && key === 'isBoss') return null;
    // scaling は廃止（効果 type / スキル効果参照で意図を表現）
    if (key === 'scaling') return null;
    // vfx はゲーム側専用フィールド（管理 UI では編集しない）
    if (key === 'vfx') return null;

    if (!(key in selected) && key !== 'descriptionJa' && key !== 'logic') {
      // allow missing optional keys in layout by creating empty
    }
    const value = selected[key];
    const kind = inferFieldKind(key, value ?? (key.endsWith('Ids') ? [] : ''));
    const hint = refCatalogHint(key);
    const options = hint ? idOptions[hint] ?? [] : [];
    const caption = <FieldCaption fieldKey={key} catalogId={catalogId} />;
    const fieldCls = compact ? 'mt-0.5 w-full' : 'mt-0.5 w-full';

    if (key === 'id') {
      return (
        <label key={key} className="block min-w-0">
          {caption}
          <UiInput
            className={`${fieldCls} font-mono border-dashed opacity-80 cursor-default`}
            value={String(value ?? '')}
            readOnly
            tabIndex={-1}
          />
        </label>
      );
    }

    if (kind === 'asset') {
      return (
        <label key={key} className="block min-w-0">
          {caption}
          <div className="mt-0.5 flex gap-1.5">
            <UiInput
              className="flex-1 font-mono"
              value={String(value ?? '')}
              onChange={(e) => onUpdate(key, e.target.value)}
            />
            <UiButton onClick={() => onPickAsset(key)}>ライブラリ</UiButton>
          </div>
        </label>
      );
    }

    if (key === 'type' && catalogId === 'effects') {
      const current = String(value ?? '');
      return (
        <label key={key} className="block min-w-0">
          {caption}
          <UiSelect
            className={fieldCls}
            value={current}
            onChange={(e) => onUpdate(key, e.target.value)}
          >
            <option value="">（選択）</option>
            {EFFECT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
            {current &&
            !(EFFECT_TYPES as readonly string[]).includes(current) ? (
              <option value={current}>{current}（未登録）</option>
            ) : null}
          </UiSelect>
        </label>
      );
    }

    if (key === 'logic' && catalogId === 'behaviors') {
      const current = String(value ?? '');
      return (
        <label key={key} className="block min-w-0">
          {caption}
          <UiSelect
            className={fieldCls}
            value={current}
            onChange={(e) => onUpdate(key, e.target.value)}
          >
            <option value="">（選択）</option>
            {BEHAVIOR_LOGICS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
            {current &&
            !(BEHAVIOR_LOGICS as readonly string[]).includes(current) ? (
              <option value={current}>{current}（未登録）</option>
            ) : null}
          </UiSelect>
        </label>
      );
    }

    if (
      key === 'slot' &&
      (catalogId === 'equipment' || catalogId === 'hud')
    ) {
      const current = String(value ?? '');
      return (
        <label key={key} className="block min-w-0">
          {caption}
          <UiSelect
            className={fieldCls}
            value={current}
            onChange={(e) => onUpdate(key, e.target.value)}
          >
            <option value="">（選択）</option>
            {EQUIP_SLOTS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
            {current &&
            !(EQUIP_SLOTS as readonly string[]).includes(current) ? (
              <option value={current}>{current}（未登録）</option>
            ) : null}
          </UiSelect>
        </label>
      );
    }

    if (key === 'uniqueKind' && catalogId === 'equipment') {
      const current = String(value ?? '');
      const known = EQUIP_UNIQUE_KINDS.some((t) => t.value === current);
      return (
        <label key={key} className="block min-w-0">
          {caption}
          <UiSelect
            className={fieldCls}
            value={current}
            onChange={(e) => onUpdate(key, e.target.value)}
          >
            {EQUIP_UNIQUE_KINDS.map((t) => (
              <option key={t.value || 'none'} value={t.value}>
                {t.label}
              </option>
            ))}
            {current && !known ? (
              <option value={current}>{current}（未登録）</option>
            ) : null}
          </UiSelect>
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
      const orphan = arr.filter((id) => !options.some((o) => o.id === id));
      return (
        <fieldset key={key} className="min-w-0">
          <legend>{caption}</legend>
          <div className="mt-0.5 max-h-40 overflow-auto border border-[var(--line)] rounded p-1.5 grid grid-cols-1 gap-0.5">
            {options.map((opt) => (
              <label
                key={opt.id}
                className="flex items-start gap-1.5 text-[11px] leading-snug"
              >
                <input
                  type="checkbox"
                  className="mt-0.5 shrink-0"
                  checked={arr.includes(opt.id)}
                  onChange={(e) => {
                    const next = e.target.checked
                      ? [...arr, opt.id]
                      : arr.filter((x) => x !== opt.id);
                    onUpdate(key, next);
                  }}
                />
                <span>
                  <span className="font-mono text-[var(--muted)]">{opt.id}</span>
                  {opt.name ? (
                    <span className="text-[var(--ink)]"> — {opt.name}</span>
                  ) : null}
                </span>
              </label>
            ))}
            {orphan.map((id) => (
              <label
                key={id}
                className="flex items-start gap-1.5 text-[11px] text-[var(--warn)]"
              >
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked
                  onChange={() => onUpdate(key, arr.filter((x) => x !== id))}
                />
                <span>{id}（参照先なし）</span>
              </label>
            ))}
            {options.length === 0 && (
              <p className="text-[var(--muted)] text-[11px]">選択肢なし</p>
            )}
          </div>
        </fieldset>
      );
    }

    if (kind === 'idSingle') {
      const current = String(value ?? '');
      const known = options.some((o) => o.id === current);
      return (
        <label key={key} className="block min-w-0">
          {caption}
          <UiSelect
            className={fieldCls}
            value={current}
            onChange={(e) => onUpdate(key, e.target.value)}
          >
            <option value="">（なし）</option>
            {options.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
            {current && !known ? (
              <option value={current}>{current}（参照先なし）</option>
            ) : null}
          </UiSelect>
        </label>
      );
    }

    if (kind === 'numberMap' && value && typeof value === 'object') {
      const obj = value as Record<string, number>;
      return (
        <fieldset key={key} className="min-w-0">
          <legend>{caption}</legend>
          <div className="mt-0.5 grid grid-cols-3 gap-1.5">
            {Object.entries(obj).map(([k, v]) => (
              <label key={k} className="block min-w-0">
                <span className="text-[10px] text-[var(--muted)]">{k}</span>
                <UiInput
                  type="number"
                  className="mt-0.5 w-full"
                  value={v}
                  onChange={(e) =>
                    onUpdate(key, { ...obj, [k]: Number(e.target.value) })
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
        <label key={key} className="block min-w-0">
          {caption}
          <UiInput
            type="number"
            className={fieldCls}
            value={Number(value ?? 0)}
            onChange={(e) => onUpdate(key, Number(e.target.value))}
          />
        </label>
      );
    }

    if (kind === 'boolean') {
      return (
        <label key={key} className="flex items-center gap-1.5 text-[11px] pt-4">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onUpdate(key, e.target.checked)}
          />
          {caption}
        </label>
      );
    }

    if (key === 'descriptionJa') {
      return (
        <label key={key} className="block min-w-0">
          {caption}
          <UiTextarea
            className="mt-0.5 w-full"
            value={String(value ?? '')}
            onChange={(e) => onUpdate(key, e.target.value)}
          />
        </label>
      );
    }

    return (
      <label key={key} className="block min-w-0">
        {caption}
        <UiInput
          className={fieldCls}
          value={String(value ?? '')}
          onChange={(e) => onUpdate(key, e.target.value)}
        />
      </label>
    );
  };

  const renderBlock = (block: FormBlock, i: number) => {
    if (block.kind === 'asset') {
      if (!previewPath && !(assetKey in selected)) return null;
      return (
        <div key={`asset-${i}`} className="space-y-1.5">
          {previewPath ? (
            <div className="max-w-xs">
              {previewSrc ? (
                <AlphaBoundsPreview
                  src={previewSrc}
                  cacheKey={previewPath}
                  maxSide={200}
                />
              ) : (
                <p className="text-[11px] text-[var(--muted)]">読込中…</p>
              )}
            </div>
          ) : null}
          {renderField(assetKey)}
        </div>
      );
    }

    if (block.kind === 'row') {
      const present = block.keys.filter((k) => k in selected || k === 'descriptionJa');
      // ensure keys exist for new templates
      const show = block.keys;
      return (
        <div
          key={`row-${i}`}
          className={`grid gap-1.5 ${
            block.cols === 4
              ? 'grid-cols-4'
              : block.cols === 3
                ? 'grid-cols-3'
                : block.cols === 2
                  ? 'grid-cols-2'
                  : 'grid-cols-1'
          }`}
        >
          {show.map((k) => {
            if (!(k in selected)) {
              // seed empty for layout keys like descriptionJa
              if (k === 'descriptionJa' || k === 'logic' || k === 'nameJa') {
                return renderField(k, true);
              }
            }
            return present.includes(k) || k in selected || true
              ? renderField(k, true)
              : null;
          })}
        </div>
      );
    }

    if (block.kind === 'growth') {
      const growth = (selected.growth && typeof selected.growth === 'object'
        ? selected.growth
        : { hp: 0, atk: 0, dex: 0 }) as Record<string, number>;
      const growthMeta = [
        { key: 'hp' as const, captionKey: 'growthHp' },
        { key: 'atk' as const, captionKey: 'growthAtk' },
        { key: 'dex' as const, captionKey: 'growthDex' },
      ];
      return (
        <div key={`growth-${i}`} className="grid grid-cols-3 gap-1.5">
          {growthMeta.map(({ key: k, captionKey }) => (
            <label key={k} className="block min-w-0">
              <FieldCaption fieldKey={captionKey} catalogId={catalogId} />
              <UiInput
                type="number"
                className="mt-0.5 w-full"
                value={Number(growth[k] ?? 0)}
                onChange={(e) =>
                  onUpdate('growth', {
                    ...growth,
                    [k]: Number(e.target.value),
                  })
                }
              />
            </label>
          ))}
        </div>
      );
    }

    if (block.kind === 'bonuses') {
      return (
        <div key={`bonuses-${i}`} className="space-y-1">
          <div className="text-[11px] text-[var(--muted)]">補正</div>
          <div className="grid grid-cols-3 gap-1.5">
            {equipBonusKeys().map((k) =>
              k in selected ? renderField(k, true) : null,
            )}
          </div>
        </div>
      );
    }

    if (block.kind === 'field') {
      if (!(block.key in selected) && block.key !== 'descriptionJa') {
        // still render description even if missing
        if (block.key !== 'descriptionJa' && block.key !== 'logic') return null;
      }
      return <div key={`f-${block.key}`}>{renderField(block.key)}</div>;
    }

    return null;
  };

  if (layout) {
    const used = new Set<string>();
    for (const b of layout) {
      if (b.kind === 'asset') used.add(assetKey);
      if (b.kind === 'row') b.keys.forEach((k) => used.add(k));
      if (b.kind === 'field') used.add(b.key);
      if (b.kind === 'growth') used.add('growth');
      if (b.kind === 'bonuses') equipBonusKeys().forEach((k) => used.add(k));
    }
    const rest = keys.filter(
      (k) =>
        !used.has(k) &&
        !(catalogId === 'bosses' && k === 'isBoss') &&
        k !== 'scaling' &&
        k !== 'vfx',
    );
    return (
      <div className="space-y-2.5 max-w-3xl text-xs">
        {layout.map(renderBlock)}
        {rest.map((k) => (
          <div key={k}>{renderField(k)}</div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2.5 max-w-3xl text-xs">
      {keys
        .filter((k) => k !== 'vfx')
        .map((k) => (
          <div key={k}>{renderField(k)}</div>
        ))}
    </div>
  );
}
