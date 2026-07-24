/** Shared catalog registry for Admin sync (local + cloud). */

export type CatalogShape = 'array' | 'audio' | 'object';

export type CatalogDef = {
  id: string;
  file: string;
  shape: CatalogShape;
  labelJa: string;
};

export const CATALOG_DEFS: readonly CatalogDef[] = [
  { id: 'characters', file: 'characters.json', shape: 'array', labelJa: 'キャラ' },
  { id: 'enemies', file: 'enemies.json', shape: 'array', labelJa: '敵' },
  { id: 'bosses', file: 'bosses.json', shape: 'array', labelJa: 'ボス' },
  { id: 'skills', file: 'skills.json', shape: 'array', labelJa: 'スキル' },
  { id: 'equipment', file: 'equipment.json', shape: 'array', labelJa: '装備' },
  { id: 'effects', file: 'effects.json', shape: 'array', labelJa: '効果' },
  { id: 'behaviors', file: 'behaviors.json', shape: 'array', labelJa: '行動' },
  { id: 'audio', file: 'audio.json', shape: 'audio', labelJa: '音声' },
  { id: 'hud', file: 'hud.json', shape: 'object', labelJa: 'HUD' },
] as const;

export const CATALOG_IDS = CATALOG_DEFS.map((d) => d.id);

export const ROW_CATALOG_IDS = CATALOG_DEFS.filter((d) => d.shape === 'array').map(
  (d) => d.id,
);

export function catalogDef(id: string): CatalogDef | undefined {
  return CATALOG_DEFS.find((d) => d.id === id);
}

export function isObjectCatalog(id: string): boolean {
  const shape = catalogDef(id)?.shape;
  return shape === 'audio' || shape === 'object';
}

/** Dashboard / listing count for a catalog payload. */
export function catalogEntryCount(id: string, data: unknown): number {
  const shape = catalogDef(id)?.shape ?? 'array';
  if (shape === 'audio') {
    const cues = (data as { cues?: unknown[] } | null)?.cues;
    return Array.isArray(cues) ? cues.length : 0;
  }
  if (shape === 'object') {
    if (id === 'hud') {
      const doc = data as {
        assetSlots?: unknown[];
      } | null;
      return Array.isArray(doc?.assetSlots) ? doc!.assetSlots!.length : 0;
    }
    return data && typeof data === 'object' ? 1 : 0;
  }
  return Array.isArray(data) ? data.length : 0;
}

export const DEFAULT_HUD = {
  appVersion: '1.0.0',
  assetSlots: [
    {
      key: 'ui.button',
      labelJa: 'ボタン',
      icon: '',
      noteJa: 'コンティニュー／ニューゲーム／リーダーズボード／オプション／戻る／中断／閉じる',
    },
    { key: 'ui.panel', labelJa: 'パネル', icon: '', noteJa: 'ステータスチップ・枠パネル' },
    {
      key: 'ui.panelTop',
      labelJa: 'パネル上部あしらい',
      icon: '',
      noteJa: 'HUD／モーダルパネルの上端装飾',
    },
    {
      key: 'ui.panelBottom',
      labelJa: 'パネル下部あしらい',
      icon: '',
      noteJa: 'HUD／モーダルパネルの下端装飾',
    },
    {
      key: 'ui.selectBackground',
      labelJa: '選択背景',
      icon: '',
      noteJa: 'キャラ／ステータス／スキル／装備の選択肢行背景',
    },
    {
      key: 'ui.slotEmpty',
      labelJa: '空スロット',
      icon: '',
      noteJa: '未装備・未取得スキル枠の共通デフォルト',
    },
    { key: 'ui.icon.hp', labelJa: 'HPアイコン', icon: '', noteJa: 'ステータス選択・表示用' },
    {
      key: 'ui.icon.atk',
      labelJa: 'STRアイコン',
      icon: '',
      noteJa: 'ATK／STR。ステータス選択・表示用',
    },
    { key: 'ui.icon.dex', labelJa: 'DEXアイコン', icon: '', noteJa: 'ステータス選択・表示用' },
    {
      key: 'ui.homeBackground',
      labelJa: 'ホーム背景',
      icon: '',
      noteJa: 'タイトル／ホーム画面の背景。未設定時は単色',
    },
    {
      key: 'ui.background',
      labelJa: 'プレイ背景',
      icon: '',
      noteJa: '未設定時は既存 backgrounds',
    },
    {
      key: 'tile.sword',
      labelJa: '弾薬タイル',
      icon: '',
      useEquippedWeapon: true,
      noteJa: '装備中武器アイコン優先',
    },
    { key: 'tile.shield', labelJa: '電力タイル', icon: '', noteJa: 'フォースシールド回復' },
    { key: 'tile.potion', labelJa: '食料タイル', icon: '', noteJa: '体力回復' },
    { key: 'tile.coin', labelJa: '廃品タイル', icon: '', noteJa: '貯まると開発へ' },
  ],
} as const;

/** 効果 type（ゲーム EffectInterpreter と同期） */
export const EFFECT_TYPES = [
  'HealPercent',
  'ArmorPercent',
  'CollectCoin',
  'CollectSword',
  'CollectShield',
  'CollectPotion',
  'ConvertToCoin',
  'ConvertToSword',
  'ConvertToShield',
  'ConvertToPotion',
  'SwapTiles',
  'DamageAllAtk',
  'DamageAllDex',
  'DamageAllHealHp',
  'DelayEnemies',
  'DamageHighestAtk',
  'DamageHighestDex',
  'DamageLowestAtk',
  'DamageLowestDex',
  'NextAttackNull',
  'NextAttackMul',
] as const;

/** 装備部位（ゲーム EquipSlot と同期） */
export const EQUIP_SLOTS = ['Weapon', 'Armor', 'Core'] as const;

/** 装備ユニーク（ゲーム EquipUniqueKinds と同期） */
export const EQUIP_UNIQUE_KINDS = [
  { value: '', label: 'なし' },
  { value: 'crit', label: 'クリティカル（ユニーク値=%、ダメ2倍）' },
  { value: 'cleave', label: '全体攻撃（ユニーク値=他敵への与ダメ%）' },
  {
    value: 'pierce',
    label: '貫通（ユニーク値=+N体。順序ダメで最初の1+N体までプール減衰なし）',
  },
  { value: 'reflect', label: '攻撃反射（ユニーク値=%）' },
  { value: 'armor_regen', label: '自動修復（ユニーク値=毎ターン バリアMaxの%）' },
  { value: 'hp_regen', label: '持続回復（ユニーク値=毎ターン HPMaxの%）' },
  {
    value: 'food_surge',
    label: '補給連動（ユニーク値=食料1マスで次戦闘 ATK/DEX+）',
  },
] as const;

/** 装備一覧チップ用の短いユニーク名 */
export function equipUniqueShortJa(kind: unknown, value?: unknown): string {
  const k = String(kind ?? '').trim().toLowerCase();
  if (!k || k === 'none' || k === '-') return '';
  const n = Number(value);
  const hasN = Number.isFinite(n) && n !== 0;
  switch (k) {
    case 'crit':
      return hasN ? `クリ${n}%` : 'クリ';
    case 'cleave':
      return hasN ? `全体${n}%` : '全体';
    case 'pierce':
      return hasN ? `貫通+${n}` : '貫通';
    case 'reflect':
      return hasN ? `反射${n}%` : '反射';
    case 'armor_regen':
      return hasN ? `防回${n}%` : '防回';
    case 'hp_regen':
      return hasN ? `H回${n}%` : 'H回';
    case 'food_surge':
      return hasN ? `補給+${n}` : '補給';
    default:
      return hasN ? `${k}:${n}` : k;
  }
}

/** uniqueValue 入力欄の補足（uniqueKind 依存） */
export function uniqueValueHintJa(kind: unknown): string {
  const k = String(kind ?? '').trim().toLowerCase();
  switch (k) {
    case 'crit':
      return 'クリ発生率（%）。装備Lvで乗算';
    case 'cleave':
      return 'パス外敵への与ダメ割合（%）。装備Lvで乗算';
    case 'pierce':
      return '追加貫通体数（+N）。基本1＋この値。装備Lvで乗算';
    case 'reflect':
      return '被ダメ反射率（%）。装備Lvで乗算';
    case 'armor_regen':
      return '毎ターン回復するバリアMax割合（%）。装備Lvで乗算';
    case 'hp_regen':
      return '毎ターン回復するHPMax割合（%）。装備Lvで乗算';
    case 'food_surge':
      return '食料1マスあたりの次戦闘ATK/DEX加算。装備Lvで乗算';
    default:
      return 'ユニーク強度（%または加算）。装備Lvで乗算';
  }
}

/** 行動 logic（ゲーム BehaviorInterpreter と同期） */
export const BEHAVIOR_LOGICS = [
  'act_error',
  'act_normal',
  'act_pierce',
  'act_heavy',
  'act_lifesteal',
  'act_suicide',
  'act_jam',
  'act_warp',
  'act_heal_others',
  'act_charge',
  'act_transfer',
] as const;
