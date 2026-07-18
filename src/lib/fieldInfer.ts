export type FieldKind =
  | 'asset'
  | 'idMulti'
  | 'idSingle'
  | 'numberMap'
  | 'number'
  | 'boolean'
  | 'text'
  | 'json';

export function inferFieldKind(key: string, value: unknown): FieldKind {
  const k = key.toLowerCase();
  if (
    k === 'icon' ||
    k === 'portrait' ||
    k.endsWith('icon') ||
    k.endsWith('asset') ||
    k.endsWith('relativepath') ||
    k === 'file'
  ) {
    return 'asset';
  }
  if (Array.isArray(value) || k.endsWith('ids')) return 'idMulti';
  if (k.endsWith('id') && k !== 'id') return 'idSingle';
  if (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (k === 'growth' ||
      Object.values(value as object).every((v) => typeof v === 'number'))
  ) {
    return 'numberMap';
  }
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (value && typeof value === 'object') return 'json';
  return 'text';
}

export function refCatalogHint(key: string): string | null {
  const k = key.toLowerCase();
  if (k.includes('skill')) return 'skills';
  if (k.includes('equipment') || k.includes('equip')) return 'equipment';
  if (k.includes('effect')) return 'effects';
  if (k.includes('behavior')) return 'behaviors';
  if (k.includes('character') || k.includes('exclusive')) return 'characters';
  if (k.includes('enem')) return 'enemies';
  if (k.includes('boss')) return 'bosses';
  return null;
}

const CAPTIONS: Record<string, string> = {
  id: 'id',
  nameJa: '名前',
  descriptionJa: '説明',
  maxHp: 'HP',
  atk: 'ATK',
  dex: 'DEX',
  maxArmor: 'バリア',
  growth: '成長',
  exclusiveSkillIds: '専用スキル',
  starterEquipmentIds: '初期装備',
  portrait: '立ち絵',
  icon: 'アイコン',
  behaviorId: '行動',
  attackInterval: '攻撃間隔',
  spawnTurnStart: '出現開始',
  spawnTurnEnd: '出現終了',
  spawnTurn: '出現ターン',
  isBoss: 'ボス',
  scaling: 'スケール',
  baseCooldown: 'CD',
  maxLevel: '最大Lv',
  effectIds: '効果',
  exclusiveTo: '専用キャラ',
  slot: '部位',
  atkBonus: 'ATK+',
  dexBonus: 'DEX+',
  maxHpBonus: 'HP+',
  maxArmorBonus: 'バリア+',
  shieldHealBonus: '電力+',
  potionHealBonus: '食料+',
  type: 'type',
  baseAmount: '基本値',
  perLevel: 'Lvごと',
  multiplier: '倍率',
  healOnKill: '撃破回復',
  hpThreshold: 'HP閾値',
  logic: 'ロジック',
  labelJa: '表示名',
};

/** Human-readable field caption including referenced catalog. */
export function fieldCaption(key: string): string {
  if (CAPTIONS[key]) return CAPTIONS[key];
  const hint = refCatalogHint(key);
  if (!hint) return key;
  const names: Record<string, string> = {
    skills: 'スキル',
    equipment: '装備',
    effects: '効果',
    behaviors: '行動',
    characters: 'キャラ',
    enemies: '敵',
    bosses: 'ボス',
  };
  return `${key}（→ ${names[hint] ?? hint}）`;
}

/**
 * Short note shown next to the field name (same style as 「読み取り専用」).
 * catalogId で文脈が変わるものだけ分岐する。
 */
export function fieldNote(key: string, catalogId?: string): string | null {
  switch (key) {
    case 'id':
      return '読み取り専用';
    case 'nameJa':
      return '表示名';
    case 'descriptionJa':
      return catalogId === 'characters'
        ? 'キャラ選択画面に表示'
        : '説明文';
    case 'labelJa':
      return 'HUD 上の表示名';
    case 'maxHp':
      return '最大 HP';
    case 'atk':
      return '攻撃';
    case 'dex':
      return '機敏';
    case 'maxArmor':
      return '最大バリア';
    case 'growth':
      return 'レベルアップ時の自動成長';
    case 'exclusiveSkillIds':
      return 'id 参照';
    case 'starterEquipmentIds':
      return 'id 参照';
    case 'portrait':
      return '立ち絵';
    case 'icon':
      return catalogId === 'hud' ? '空スロット用アイコン' : 'アイコン';
    case 'behaviorId':
      return '行動 id';
    case 'attackInterval':
      return 'ターン';
    case 'spawnTurnStart':
    case 'spawnTurnEnd':
      return '出現期間';
    case 'spawnTurn':
      return catalogId === 'equipment'
        ? '開発に出始めるターン'
        : '出現ターン';
    case 'isBoss':
      return 'ボス扱い';
    case 'scaling':
      return catalogId === 'effects'
        ? '表示用メモ（実計算は type 側）'
        : 'ATK / DEX / none';
    case 'baseCooldown':
      return '基本 CD';
    case 'maxLevel':
      return '最大レベル';
    case 'effectIds':
      return '効果 id';
    case 'exclusiveTo':
      return '空なら共通';
    case 'slot':
      return catalogId === 'hud'
        ? 'スロット種別'
        : 'Weapon / Armor / Core';
    case 'atkBonus':
    case 'dexBonus':
    case 'maxHpBonus':
    case 'maxArmorBonus':
    case 'shieldHealBonus':
    case 'potionHealBonus':
      return '補正';
    case 'type':
      return catalogId === 'effects'
        ? 'HealPercent / DamageAllAtk など'
        : 'プログラム識別子';
    case 'baseAmount':
      return catalogId === 'effects'
        ? '基本%または個数（typeによる）'
        : '基本値';
    case 'perLevel':
      return 'Lvごとの加算';
    case 'logic':
      return 'act_*（プログラム用）';
    default:
      return null;
  }
}

/** Middle-list label: id — name (single line). */
export function rowLabel(row: Record<string, unknown>): string {
  const id = String(row.id ?? '');
  const name = String(row.nameJa ?? '');
  if (id && name) return `${id} — ${name}`;
  return id || name || '(empty)';
}
