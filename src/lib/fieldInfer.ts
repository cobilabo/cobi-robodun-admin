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

/** Human-readable field caption including referenced catalog. */
export function fieldCaption(key: string): string {
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
    case 'code':
      return catalogId === 'behaviors'
        ? 'ロジック名（act_*）。必須'
        : '通称（旧名称）。参照キーではない';
    case 'nameJa':
      return '日本語の表示名';
    case 'descriptionJa':
      return '説明文';
    case 'labelJa':
      return 'HUD 上の表示名';
    case 'archetype':
      return '成長傾向（STR / INT / DEX）';
    case 'maxHp':
      return '最大 HP';
    case 'str':
      return '攻撃寄りステータス';
    case 'int':
      return '術寄りステータス';
    case 'dex':
      return '速度寄りステータス';
    case 'maxArmor':
      return '最大バリア';
    case 'growth':
      return 'レベルアップ時の上昇';
    case 'exclusiveSkillIds':
      return '専用スキル（id 参照）';
    case 'starterEquipmentIds':
      return '初期装備（id 参照）';
    case 'portrait':
      return '立ち絵・顔画像';
    case 'icon':
      return catalogId === 'hud' ? 'スロットアイコン' : '一覧・盤面用アイコン';
    case 'behaviorId':
      return '行動の管理番号（id）';
    case 'attackInterval':
      return '攻撃間隔（ターン）';
    case 'spawnTurnStart':
      return '出現開始ターン';
    case 'spawnTurnEnd':
      return '出現終了ターン';
    case 'spawnTurn':
      return '出現ターン';
    case 'minMatchSize':
      return '倒すのに必要なマッチ数';
    case 'isBoss':
      return 'ボス扱いフラグ';
    case 'scaling':
      return 'ステータス連動（str / int / dex / none）';
    case 'baseCooldown':
      return '基本クールダウン';
    case 'maxLevel':
      return 'スキル最大レベル';
    case 'effectIds':
      return '発動効果（id 参照）';
    case 'exclusiveTo':
      return '専用キャラ（id）。共通は空';
    case 'slot':
      return catalogId === 'hud'
        ? '装備スロット種別'
        : '装備部位（Weapon / Armor / Accessory）';
    case 'rarity':
      return 'レア度（数値）';
    case 'strBonus':
      return 'STR 補正';
    case 'intBonus':
      return 'INT 補正';
    case 'dexBonus':
      return 'DEX 補正';
    case 'attackBonus':
      return '攻撃力補正';
    case 'defenseBonus':
      return '防御補正';
    case 'maxHpBonus':
      return '最大 HP 補正';
    case 'maxArmorBonus':
      return '最大バリア補正';
    case 'shieldHealBonus':
      return 'バリア回復補正';
    case 'potionHealBonus':
      return '回復量補正';
    case 'type':
      return '効果タイプ（プログラム側の識別子）';
    case 'baseAmount':
      return '基本値';
    case 'perLevel':
      return 'レベルごとの増加';
    case 'multiplier':
      return '倍率';
    case 'healOnKill':
      return '撃破時回復';
    case 'hpThreshold':
      return 'HP 閾値（割合など）';
    case 'file':
      return '音声ファイルパス';
    case 'kind':
      return 'bgm / se / ui';
    case 'loop':
      return 'ループ再生';
    case 'trigger':
      return '再生タイミング';
    case 'noteJa':
      return '管理用メモ';
    default:
      break;
  }

  // 参照系の汎用メモ（個別定義が無い場合）
  if (refCatalogHint(key)) {
    if (key.toLowerCase().endsWith('ids')) return '複数の管理番号（id）';
    if (key.toLowerCase().endsWith('id')) return '管理番号（id）で参照';
  }
  return null;
}

export function rowLabel(row: Record<string, unknown>): string {
  const id = String(row.id ?? '');
  const name = String(row.nameJa ?? row.name ?? row.descriptionJa ?? '');
  const code = String(row.code ?? '').trim();
  if (!id && !name) return '(no id)';
  const mid = [name, code ? `(${code})` : ''].filter(Boolean).join(' ');
  return mid ? `${id} — ${mid}` : id;
}
