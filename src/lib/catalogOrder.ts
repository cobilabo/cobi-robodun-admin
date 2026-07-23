/** Canonical key order and form layouts for catalog editors. */

export type FormBlock =
  | { kind: 'asset' } // portrait / icon を先頭に
  | { kind: 'row'; keys: string[]; cols: number }
  | { kind: 'growth' } // growth.hp/atk/dex を 3 列
  | { kind: 'bonuses' } // 装備補正を 3 列
  | { kind: 'field'; key: string };

const ORDERS: Record<string, string[]> = {
  characters: [
    'id',
    'nameJa',
    'descriptionJa',
    'maxHp',
    'atk',
    'dex',
    'maxArmor',
    'growth',
    'exclusiveSkillIds',
    'starterEquipmentIds',
    'portrait',
  ],
  enemies: [
    'id',
    'nameJa',
    'maxHp',
    'atk',
    'behaviorId',
    'attackInterval',
    'icon',
    'spawnTurnStart',
    'spawnTurnEnd',
  ],
  bosses: [
    'id',
    'nameJa',
    'maxHp',
    'atk',
    'behaviorId',
    'attackInterval',
    'icon',
    'isBoss',
    'spawnTurn',
  ],
  skills: [
    'id',
    'nameJa',
    'exclusiveTo',
    'descriptionJa',
    'baseCooldown',
    'maxLevel',
    'effectIds',
    'icon',
  ],
  equipment: [
    'id',
    'nameJa',
    'slot',
    'descriptionJa',
    'atkBonus',
    'dexBonus',
    'maxHpBonus',
    'maxArmorBonus',
    'shieldHealBonus',
    'potionHealBonus',
    'uniqueKind',
    'uniqueValue',
    'spawnTurn',
    'icon',
  ],
  effects: [
    'id',
    'nameJa',
    'type',
    'descriptionJa',
    'baseAmount',
    'perLevel',
  ],
  behaviors: ['id', 'nameJa', 'logic', 'descriptionJa'],
  audio_cue: [
    'id',
    'kind',
    'loop',
    'trigger',
    'noteJa',
    'usageJa',
    'file',
    'files',
    'promptJa',
    'promptEn',
    'candidates',
  ],
  audio_candidate: [
    'id',
    'file',
    'originalFile',
    'originalFormat',
    'source',
    'provider',
    'createdAt',
    'label',
    'promptEn',
  ],
  hud_slot: ['slot', 'labelJa', 'icon'],
  hud_asset: ['key', 'labelJa', 'icon', 'useEquippedWeapon', 'noteJa'],
  growth: ['hp', 'atk', 'dex'],
};

/** フォームのブロック配置（キーはこの順で消費）。 */
export const FORM_LAYOUTS: Record<string, FormBlock[]> = {
  characters: [
    { kind: 'asset' },
    { kind: 'row', keys: ['id', 'nameJa'], cols: 2 },
    { kind: 'field', key: 'descriptionJa' },
    { kind: 'row', keys: ['maxHp', 'atk', 'dex', 'maxArmor'], cols: 4 },
    { kind: 'growth' },
    { kind: 'field', key: 'exclusiveSkillIds' },
    { kind: 'field', key: 'starterEquipmentIds' },
  ],
  enemies: [
    { kind: 'asset' },
    { kind: 'row', keys: ['id', 'nameJa'], cols: 2 },
    { kind: 'row', keys: ['maxHp', 'atk', 'behaviorId', 'attackInterval'], cols: 4 },
    { kind: 'row', keys: ['spawnTurnStart', 'spawnTurnEnd'], cols: 2 },
  ],
  bosses: [
    { kind: 'asset' },
    { kind: 'row', keys: ['id', 'nameJa'], cols: 2 },
    { kind: 'row', keys: ['maxHp', 'atk', 'behaviorId', 'attackInterval'], cols: 4 },
    { kind: 'field', key: 'spawnTurn' },
  ],
  skills: [
    { kind: 'asset' },
    { kind: 'row', keys: ['id', 'nameJa', 'exclusiveTo'], cols: 3 },
    { kind: 'field', key: 'descriptionJa' },
    { kind: 'row', keys: ['baseCooldown', 'maxLevel'], cols: 2 },
    { kind: 'field', key: 'effectIds' },
  ],
  equipment: [
    { kind: 'asset' },
    { kind: 'row', keys: ['id', 'nameJa', 'slot'], cols: 3 },
    { kind: 'field', key: 'descriptionJa' },
    { kind: 'bonuses' },
    { kind: 'row', keys: ['uniqueKind', 'uniqueValue'], cols: 2 },
    { kind: 'field', key: 'spawnTurn' },
  ],
  effects: [
    { kind: 'row', keys: ['id', 'nameJa', 'type'], cols: 3 },
    { kind: 'field', key: 'descriptionJa' },
    { kind: 'row', keys: ['baseAmount', 'perLevel'], cols: 2 },
  ],
  behaviors: [
    { kind: 'row', keys: ['id', 'nameJa'], cols: 2 },
    { kind: 'field', key: 'descriptionJa' },
    { kind: 'field', key: 'logic' },
  ],
  hud: [
    { kind: 'asset' },
    { kind: 'row', keys: ['key', 'labelJa'], cols: 2 },
    { kind: 'field', key: 'noteJa' },
    { kind: 'field', key: 'useEquippedWeapon' },
    { kind: 'row', keys: ['slot', 'labelJa'], cols: 2 },
  ],
};

const EQUIP_BONUS_KEYS = [
  'atkBonus',
  'dexBonus',
  'maxHpBonus',
  'maxArmorBonus',
  'shieldHealBonus',
  'potionHealBonus',
] as const;

const HUD_SLOT_ORDER = ['Weapon', 'Armor', 'Core'];

function orderObj(
  obj: Record<string, unknown>,
  keys: string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    if (k in obj) out[k] = obj[k];
  }
  for (const [k, v] of Object.entries(obj)) {
    if (!(k in out)) out[k] = v;
  }
  return out;
}

function orderRow(row: Record<string, unknown>, kind: string): Record<string, unknown> {
  const keys = ORDERS[kind];
  if (!keys) return { ...row };
  const ordered = orderObj(row, keys);
  if (kind === 'characters' && ordered.growth && typeof ordered.growth === 'object') {
    ordered.growth = orderObj(
      ordered.growth as Record<string, unknown>,
      ORDERS.growth,
    );
  }
  if (kind === 'audio_cue' && Array.isArray(ordered.candidates)) {
    ordered.candidates = ordered.candidates
      .filter(
        (r): r is Record<string, unknown> =>
          !!r && typeof r === 'object' && !Array.isArray(r),
      )
      .map((r) => orderRow(r, 'audio_candidate'));
  }
  return ordered;
}

function orderRows(
  rows: unknown[],
  kind: string,
  sortById = true,
): Record<string, unknown>[] {
  const ordered = rows
    .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object' && !Array.isArray(r))
    .map((r) => orderRow(r, kind));
  if (sortById) {
    ordered.sort((a, b) => String(a.id ?? '').localeCompare(String(b.id ?? ''), 'en'));
  }
  return ordered;
}

/** Normalize catalog payload for display / save / export. */
export function orderCatalogData(catalogId: string, data: unknown): unknown {
  if (catalogId === 'audio') {
    const doc = (data && typeof data === 'object' ? data : {}) as {
      version?: number;
      cues?: unknown[];
    };
    const cues = Array.isArray(doc.cues) ? orderRows(doc.cues, 'audio_cue') : [];
    return { version: doc.version ?? 1, cues };
  }

  if (catalogId === 'hud') {
    const doc = (data && typeof data === 'object' ? data : {}) as {
      appVersion?: string;
      assetSlots?: unknown[];
    };
    const assets = Array.isArray(doc.assetSlots)
      ? doc.assetSlots
          .filter(
            (r): r is Record<string, unknown> =>
              !!r && typeof r === 'object' && !Array.isArray(r),
          )
          .map((r) => orderRow({ ...r, kind: 'asset' }, 'hud_asset'))
      : [];
    return {
      appVersion: String(doc.appVersion ?? '1.0.0'),
      assetSlots: assets.map(({ kind: _k, ...rest }) => rest),
    };
  }

  if (Array.isArray(data)) {
    const rows = orderRows(data, catalogId);
    if (catalogId === 'skills' || catalogId === 'effects') {
      for (const row of rows) delete row.scaling;
    }
    return rows;
  }

  return data;
}

export function stringifyCatalog(catalogId: string, data: unknown): string {
  return `${JSON.stringify(orderCatalogData(catalogId, data), null, 2)}\n`;
}

/** Stable field order for form editors (known keys first, then leftovers). */
export function keysForRow(catalogId: string, row: Record<string, unknown>): string[] {
  let kind =
    catalogId === 'audio' ? 'audio_cue' : catalogId === 'hud' ? 'hud_slot' : catalogId;
  if (catalogId === 'hud') {
    kind = row.kind === 'asset' || row.key ? 'hud_asset' : 'hud_slot';
  }
  const preferred = ORDERS[kind] ?? [];
  const present = new Set(Object.keys(row));
  present.delete('kind');
  const ordered: string[] = [];
  for (const k of preferred) {
    if (present.has(k)) {
      ordered.push(k);
      present.delete(k);
    }
  }
  for (const k of present) ordered.push(k);
  return ordered;
}

export function equipBonusKeys(): readonly string[] {
  return EQUIP_BONUS_KEYS;
}

export function formLayoutFor(catalogId: string): FormBlock[] | null {
  return FORM_LAYOUTS[catalogId] ?? null;
}
