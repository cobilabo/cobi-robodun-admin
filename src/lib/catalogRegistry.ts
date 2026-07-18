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
        equipmentSlots?: unknown[];
        assetSlots?: unknown[];
      } | null;
      const eq = Array.isArray(doc?.equipmentSlots) ? doc!.equipmentSlots!.length : 0;
      const as = Array.isArray(doc?.assetSlots) ? doc!.assetSlots!.length : 0;
      return eq + as;
    }
    return data && typeof data === 'object' ? 1 : 0;
  }
  return Array.isArray(data) ? data.length : 0;
}

export const DEFAULT_HUD = {
  appVersion: '1.0.0',
  equipmentSlots: [
    {
      slot: 'Weapon',
      labelJa: '武器',
      icon: 'UI/hud/slot_weapon.png',
    },
    {
      slot: 'Armor',
      labelJa: '防具',
      icon: 'UI/hud/slot_armor.png',
    },
    {
      slot: 'Accessory',
      labelJa: 'アクセ',
      icon: 'UI/hud/slot_accessory.png',
    },
  ],
  assetSlots: [
    { key: 'ui.button', labelJa: 'ボタン', icon: '', noteJa: 'タイトル／選択肢ボタン背景' },
    { key: 'ui.panel', labelJa: 'パネル', icon: '', noteJa: 'ステータスチップ・枠パネル' },
    { key: 'ui.background', labelJa: 'プレイ背景', icon: '', noteJa: '未設定時は既存 backgrounds' },
    {
      key: 'tile.sword',
      labelJa: '兵器タイル',
      icon: '',
      useEquippedWeapon: true,
      noteJa: '装備中武器アイコン優先',
    },
    { key: 'tile.shield', labelJa: '修理タイル', icon: '', noteJa: 'アーマー回復' },
    { key: 'tile.potion', labelJa: 'ナノタイル', icon: '', noteJa: '体力回復' },
    { key: 'tile.coin', labelJa: 'クレジットタイル', icon: '', noteJa: 'お金' },
  ],
} as const;
