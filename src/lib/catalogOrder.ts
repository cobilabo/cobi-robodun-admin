/** Canonical key order for catalog JSON (Firestore does not preserve map order). */

const ORDERS: Record<string, string[]> = {
  characters: [
    'id',
    'code',
    'nameJa',
    'archetype',
    'maxHp',
    'str',
    'int',
    'dex',
    'maxArmor',
    'growth',
    'exclusiveSkillIds',
    'starterEquipmentIds',
    'portrait',
  ],
  enemies: [
    'id',
    'code',
    'nameJa',
    'maxHp',
    'str',
    'int',
    'dex',
    'behaviorId',
    'attackInterval',
    'icon',
    'spawnTurnStart',
    'spawnTurnEnd',
    'minMatchSize',
  ],
  bosses: [
    'id',
    'code',
    'nameJa',
    'maxHp',
    'str',
    'int',
    'dex',
    'behaviorId',
    'attackInterval',
    'icon',
    'isBoss',
    'minMatchSize',
    'spawnTurn',
  ],
  skills: [
    'id',
    'code',
    'nameJa',
    'scaling',
    'baseCooldown',
    'maxLevel',
    'effectIds',
    'exclusiveTo',
    'descriptionJa',
    'icon',
  ],
  equipment: [
    'id',
    'code',
    'nameJa',
    'slot',
    'descriptionJa',
    'strBonus',
    'intBonus',
    'dexBonus',
    'attackBonus',
    'defenseBonus',
    'maxHpBonus',
    'maxArmorBonus',
    'shieldHealBonus',
    'potionHealBonus',
    'rarity',
    'icon',
  ],
  effects: [
    'id',
    'code',
    'type',
    'descriptionJa',
    'baseAmount',
    'perLevel',
    'scaling',
    'multiplier',
    'healOnKill',
    'hpThreshold',
  ],
  behaviors: ['id', 'code', 'nameJa', 'descriptionJa'],
  audio_cue: ['id', 'code', 'kind', 'loop', 'trigger', 'noteJa', 'file'],
  hud_slot: ['slot', 'labelJa', 'icon'],
  growth: ['hp', 'str', 'int', 'dex'],
};

const HUD_SLOT_ORDER = ['Weapon', 'Armor', 'Accessory'];

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
      equipmentSlots?: unknown[];
    };
    const slots = Array.isArray(doc.equipmentSlots)
      ? doc.equipmentSlots
          .filter(
            (r): r is Record<string, unknown> =>
              !!r && typeof r === 'object' && !Array.isArray(r),
          )
          .map((r) => orderRow(r, 'hud_slot'))
      : [];
    slots.sort((a, b) => {
      const sa = String(a.slot ?? '');
      const sb = String(b.slot ?? '');
      const ia = HUD_SLOT_ORDER.indexOf(sa);
      const ib = HUD_SLOT_ORDER.indexOf(sb);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || sa.localeCompare(sb);
    });
    return {
      appVersion: String(doc.appVersion ?? '1.0.0'),
      equipmentSlots: slots,
    };
  }

  if (Array.isArray(data)) {
    return orderRows(data, catalogId);
  }

  return data;
}

export function stringifyCatalog(catalogId: string, data: unknown): string {
  return `${JSON.stringify(orderCatalogData(catalogId, data), null, 2)}\n`;
}

/** Stable field order for form editors (known keys first, then leftovers). */
export function keysForRow(catalogId: string, row: Record<string, unknown>): string[] {
  const kind = catalogId === 'audio' ? 'audio_cue' : catalogId === 'hud' ? 'hud_slot' : catalogId;
  const preferred = ORDERS[kind] ?? [];
  const present = new Set(Object.keys(row));
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
